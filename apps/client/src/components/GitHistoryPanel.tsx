import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useInView } from 'react-intersection-observer';
import { useVirtualizer } from '@tanstack/react-virtual';
import { sendRequest } from '../lib/send-request';
import type { GitLogItem, GitLogResponse } from '@ymir/shared';
import { COLOR_TEXT, COLOR_TEXT_MUTED, COLOR_ERROR, GIT_GRAPH_COLORS } from '../lib/theme';
import {
  LANE_WIDTH,
  GRAPH_LEFT_PADDING,
  EMPTY_ACTIVE_LANES,
  computeLanes,
  computeActiveLanes,
} from '../lib/git-graph';
import type { LaneInfo, ActiveLane } from '../lib/git-graph';

// ── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const ROW_HEIGHT = 24;

// ── formatRelativeTime ──────────────────────────────────────────────────────

function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

// ── CommitRow ───────────────────────────────────────────────────────────────

interface CommitRowProps {
  info: LaneInfo;
  graphWidth: number;
  activeLanes: ActiveLane[];
  style?: React.CSSProperties;
}

const CommitRow = memo(function CommitRow({
  info,
  graphWidth,
  activeLanes,
  style,
}: CommitRowProps) {
  const { commit, lane, colorIndex, linesDown } = info;
  const color = GIT_GRAPH_COLORS[colorIndex % GIT_GRAPH_COLORS.length];
  const cx = lane * LANE_WIDTH + GRAPH_LEFT_PADDING;
  const cy = ROW_HEIGHT / 2;

  return (
    <div style={{ display: 'flex', height: ROW_HEIGHT, ...style }}>
      {/* Graph column */}
      <svg width={graphWidth} height={ROW_HEIGHT} style={{ flexShrink: 0 }}>
        {/* Pass-through vertical lines */}
        {activeLanes.map((al) => {
          const x = al.lane * LANE_WIDTH + GRAPH_LEFT_PADDING;
          const c = GIT_GRAPH_COLORS[al.colorIndex % GIT_GRAPH_COLORS.length];
          return (
            <line
              key={`pt-${al.lane}`}
              x1={x}
              y1={0}
              x2={x}
              y2={ROW_HEIGHT}
              stroke={c}
              strokeWidth={1.5}
            />
          );
        })}

        {/* Lines going down to parents */}
        {linesDown.map((seg, idx) => {
          const fromX = seg.fromLane * LANE_WIDTH + GRAPH_LEFT_PADDING;
          const toX = seg.toLane * LANE_WIDTH + GRAPH_LEFT_PADDING;
          const segColor = GIT_GRAPH_COLORS[seg.colorIndex % GIT_GRAPH_COLORS.length];

          if (seg.fromLane === seg.toLane) {
            // Same lane — vertical line from center to bottom
            return (
              <line
                key={`ld-${idx}`}
                x1={fromX}
                y1={cy}
                x2={toX}
                y2={ROW_HEIGHT}
                stroke={segColor}
                strokeWidth={1.5}
              />
            );
          }

          // Different lane — cubic bezier curve
          return (
            <path
              key={`ld-${idx}`}
              d={`M ${fromX} ${cy} C ${fromX} ${ROW_HEIGHT * 0.75} ${toX} ${ROW_HEIGHT * 0.75} ${toX} ${ROW_HEIGHT}`}
              stroke={segColor}
              strokeWidth={1.5}
              fill="none"
            />
          );
        })}

        {/* Node dot */}
        <circle cx={cx} cy={cy} r={4} fill={color} />
      </svg>

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
}

/**
 * Displays a virtualized git commit history with a custom SVG lane graph.
 * Features: infinite scroll (react-intersection-observer), virtualized rendering
 * (@tanstack/react-virtual), custom per-row graph renderer with bezier curves,
 * and skip-based pagination via the `git.log` WebSocket channel.
 */
export function GitHistoryPanel({ workspaceId }: GitHistoryPanelProps) {
  const [commits, setCommits] = useState<GitLogItem[]>([]);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Scrollable container ref for virtualizer ────────────────────────

  const parentRef = useRef<HTMLDivElement>(null);

  // ── Generation counter to discard stale fetches ───────────────────────

  const generationRef = useRef(0);

  // ── loadCommits ─────────────────────────────────────────────────────────

  const loadCommits = useCallback(async () => {
    if (!workspaceId || loading || !hasMore) return;
    const gen = generationRef.current;
    setLoading(true);
    try {
      const res = await sendRequest<GitLogResponse>('git.log', {
        workspaceId,
        skip,
        limit: PAGE_SIZE,
      });
      if (gen !== generationRef.current) return; // discard stale
      setCommits((prev) => [...prev, ...res.commits]);
      setSkip((prev) => prev + res.commits.length);
      setHasMore(res.hasMore);
    } catch (err) {
      if (gen !== generationRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load git history');
    } finally {
      if (gen === generationRef.current) setLoading(false);
    }
  }, [workspaceId, skip, loading, hasMore]);

  // ── Reset on workspace change ──────────────────────────────────────────

  const loadCommitsRef = useRef(loadCommits);
  loadCommitsRef.current = loadCommits;

  useEffect(() => {
    ++generationRef.current;
    setCommits([]);
    setSkip(0);
    setHasMore(true);
    setError(null);
    if (workspaceId) {
      setTimeout(() => loadCommitsRef.current(), 0);
    }
  }, [workspaceId]);

  // ── Infinite scroll ────────────────────────────────────────────────────

  const { ref: sentinelRef, inView } = useInView({ rootMargin: '200px' });

  useEffect(() => {
    if (inView && hasMore && !loading) loadCommits();
  }, [inView, hasMore, loading, loadCommits]);

  // ── Computed lane data ─────────────────────────────────────────────────

  const laneData = useMemo(() => computeLanes(commits), [commits]);

  const maxLane = useMemo(() => {
    if (laneData.length === 0) return 0;
    return Math.max(...laneData.map((l) => l.lane));
  }, [laneData]);

  const graphWidth = maxLane * LANE_WIDTH + GRAPH_LEFT_PADDING + 4 + 2;

  // ── Active lanes per row ───────────────────────────────────────────────

  const activeLanesPerRow = useMemo(() => computeActiveLanes(laneData), [laneData]);

  // ── Virtualizer ──────────────────────────────────────────────────────

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
            onClick={() => loadCommitsRef.current()}
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
