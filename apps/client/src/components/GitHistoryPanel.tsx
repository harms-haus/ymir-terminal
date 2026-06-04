import { useState, useCallback, useMemo, useRef, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatRelativeTime } from '../lib/git-utils';
import { usePaginatedGitLog } from '../hooks/usePaginatedGitLog';
import { COLOR_TEXT, COLOR_TEXT_MUTED, COLOR_ERROR } from '../lib/theme';
import {
  LANE_WIDTH,
  GRAPH_LEFT_PADDING,
  EMPTY_ACTIVE_LANES,
  computeLanes,
  computeActiveLanes,
} from '../lib/git-graph';
import type { LaneInfo, ActiveLane } from '../lib/git-graph';
import { CommitGraphRow } from './git-graph/CommitGraphRow';

// ── Constants ───────────────────────────────────────────────────────────────

const ROW_HEIGHT = 24;

// ── CommitRow ───────────────────────────────────────────────────────────────

interface CommitRowProps {
  info: LaneInfo;
  graphWidth: number;
  activeLanes: ActiveLane[];
  style?: React.CSSProperties;
  onClick?: () => void;
}

const CommitRow = memo(function CommitRow({
  info,
  graphWidth,
  activeLanes,
  style,
  onClick,
}: CommitRowProps) {
  const { commit } = info;
  const [hovered, setHovered] = useState(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    },
    [onClick],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        height: ROW_HEIGHT,
        background: hovered ? 'rgba(255,255,255,0.04)' : undefined,
        cursor: 'pointer',
        ...style,
      }}
    >
      {/* Graph column */}
      <CommitGraphRow info={info} graphWidth={graphWidth} activeLanes={activeLanes} />

      {/* Commit info */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          overflow: 'hidden',
          gap: 6,
        }}
      >
        <div
          style={{
            flex: 1,
            fontSize: 12,
            color: COLOR_TEXT,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
          }}
        >
          {commit.message}
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 10,
            color: COLOR_TEXT_MUTED,
            whiteSpace: 'nowrap',
          }}
        >
          {formatRelativeTime(commit.date)}
        </span>
      </div>
    </div>
  );
});

// ── GitHistoryPanel ─────────────────────────────────────────────────────────

interface GitHistoryPanelProps {
  workspaceId: string | null;
  workspaceCwd?: string;
  onCommitClick?: (commitSha: string) => void;
}

/**
 * Displays a virtualized git commit history with a custom SVG lane graph.
 * Features: infinite scroll (react-intersection-observer), virtualized rendering
 * (@tanstack/react-virtual), custom per-row graph renderer with bezier curves,
 * and skip-based pagination via the `git.log` WebSocket channel.
 */
export function GitHistoryPanel({
  workspaceId,
  workspaceCwd,
  onCommitClick,
}: GitHistoryPanelProps) {
  // ── Paginated git log ──────────────────────────────────────────────

  const { commits, loading, error, sentinelRef, reload } = usePaginatedGitLog({
    workspaceId,
    repoPath: workspaceCwd ?? null,
  });

  // ── Scrollable container ref for virtualizer ────────────────────────

  const parentRef = useRef<HTMLDivElement>(null);

  // ── Computed lane data ─────────────────────────────────────────────────

  const laneData = useMemo(() => computeLanes(commits), [commits]);

  const maxLane = useMemo(() => {
    if (laneData.length === 0) return 0;
    return Math.max(...laneData.map((l) => l.lane));
  }, [laneData]);

  const graphWidth = maxLane * LANE_WIDTH + GRAPH_LEFT_PADDING + 4 + 2;

  // ── Active lanes per row ───────────────────────────────────────────────

  const activeLanesPerRow = useMemo(() => computeActiveLanes(laneData), [laneData]);

  // ── Stable click handler map (memoized by commit id via useCallback) ──

  const commitClickHandlers = useMemo(() => {
    if (!onCommitClick) return {} as Record<string, () => void>;
    const map: Record<string, () => void> = {};
    for (const info of laneData) {
      const sha = info.commit.id;
      map[sha] = () => onCommitClick(sha);
    }
    return map;
  }, [laneData, onCommitClick]);

  // ── Virtualizer ──────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: laneData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      data-testid="git-history-panel"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {error && (
        <div
          style={{
            padding: 8,
            color: COLOR_ERROR,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={reload}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: COLOR_ERROR,
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div ref={parentRef} style={{ flex: 1, overflowY: 'auto' }}>
        {!workspaceId && (
          <div style={{ padding: 8, color: COLOR_TEXT_MUTED, fontSize: 12 }}>
            No workspace selected
          </div>
        )}
        {workspaceId && commits.length === 0 && !loading && (
          <div style={{ padding: 8, color: COLOR_TEXT_MUTED, fontSize: 12 }}>No commits</div>
        )}
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const idx = virtualItem.index;
            const info = laneData[idx];
            return (
              <CommitRow
                key={info.commit.id}
                info={info}
                graphWidth={graphWidth}
                activeLanes={activeLanesPerRow[idx] ?? EMPTY_ACTIVE_LANES}
                onClick={commitClickHandlers[info.commit.id]}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              />
            );
          })}
        </div>
        <div ref={sentinelRef} style={{ height: 1 }} />
        {loading && (
          <div style={{ padding: 8, color: COLOR_TEXT_MUTED, fontSize: 12 }}>Loading…</div>
        )}
      </div>
    </div>
  );
}
