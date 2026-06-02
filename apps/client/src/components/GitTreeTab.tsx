import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { sendRequest } from '../lib/send-request';
import { formatRelativeTime } from '../lib/git-utils';
import { usePaginatedGitLog } from '../hooks/usePaginatedGitLog';
import type { GitLogItem, GitCommitDetailsResponse, GitCommitFileChange } from '@ymir/shared';
import {
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_ERROR,
  COLOR_BORDER,
  COLOR_BG_PRIMARY,
  COLOR_DIFF_ADDITIONS,
  COLOR_DIFF_DELETIONS,
  GIT_STATUS_COLORS,
  GIT_GRAPH_COLORS,
} from '../lib/theme';
import {
  LANE_WIDTH,
  GRAPH_LEFT_PADDING,
  EMPTY_ACTIVE_LANES,
  computeLanes,
  computeActiveLanes,
} from '../lib/git-graph';
import type { LaneInfo, ActiveLane } from '../lib/git-graph';

// ── Constants ───────────────────────────────────────────────────────────────

const ROW_HEIGHT = 24;

// ── CommitRow ───────────────────────────────────────────────────────────────

interface CommitRowGraphProps {
  info: LaneInfo;
  graphWidth: number;
  activeLanes: ActiveLane[];
}

const CommitRowGraph = memo(function CommitRowGraph({
  info,
  graphWidth,
  activeLanes,
}: CommitRowGraphProps) {
  const { lane, colorIndex, linesDown } = info;
  const color = GIT_GRAPH_COLORS[colorIndex % GIT_GRAPH_COLORS.length];
  const cx = lane * LANE_WIDTH + GRAPH_LEFT_PADDING;
  const cy = ROW_HEIGHT / 2;

  return (
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
  );
});

// ── FileRow ─────────────────────────────────────────────────────────────────

interface FileRowProps {
  file: GitCommitFileChange;
  commitSha: string;
  parentSha: string;
  onOpenCommitDiff: (commitSha: string, parentSha: string, filePath: string) => void;
}

const FileRow = memo(function FileRow({
  file,
  commitSha,
  parentSha,
  onOpenCommitDiff,
}: FileRowProps) {
  const [hovered, setHovered] = useState(false);

  const statusColor = GIT_STATUS_COLORS[file.status] ?? COLOR_TEXT_MUTED;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenCommitDiff(commitSha, parentSha, file.filePath);
      }
    },
    [commitSha, parentSha, file.filePath, onOpenCommitDiff],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenCommitDiff(commitSha, parentSha, file.filePath)}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 22,
        paddingLeft: 24,
        paddingRight: 8,
        gap: 6,
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontSize: 11,
          fontFamily: 'monospace',
          color: statusColor,
          width: 16,
          textAlign: 'center',
        }}
      >
        {file.status}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: COLOR_TEXT,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
        }}
      >
        {file.filePath}
      </span>
      <span
        style={{
          flexShrink: 0,
          fontSize: 12,
          fontFamily: 'monospace',
          color: COLOR_DIFF_ADDITIONS,
        }}
      >
        +{file.additions}
      </span>
      <span
        style={{
          flexShrink: 0,
          fontSize: 12,
          fontFamily: 'monospace',
          color: COLOR_DIFF_DELETIONS,
        }}
      >
        -{file.deletions}
      </span>
    </div>
  );
});

// ── GitTreeTab ──────────────────────────────────────────────────────────────

interface GitTreeTabProps {
  workspaceId: string;
  repoPath: string; // empty string '' means workspace root
  highlightCommitSha?: string | null; // one-shot: scroll to and expand this commit
  onOpenCommitDiff: (commitSha: string, parentSha: string, filePath: string) => void;
}

export function GitTreeTab({
  workspaceId,
  repoPath,
  highlightCommitSha,
  onOpenCommitDiff,
}: GitTreeTabProps) {
  // ── Paginated git log ────────────────────────────────────────────────

  const { commits, loading, error, sentinelRef, reload } = usePaginatedGitLog({
    workspaceId,
    repoPath,
  });

  // ── Commit-details state ────────────────────────────────────────────

  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<
    Map<string, { body: string; files: GitCommitFileChange[] }>
  >(new Map());
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());
  const [detailsErrors, setDetailsErrors] = useState<Map<string, string>>(new Map());

  const parentRef = useRef<HTMLDivElement>(null);
  const highlightPendingRef = useRef(false);

  // ── loadCommitDetails ─────────────────────────────────────────────────

  const loadCommitDetails = useCallback(
    async (sha: string) => {
      if (detailsCache.has(sha) || detailsLoading.has(sha)) return;
      setDetailsLoading((prev) => {
        const next = new Set(prev);
        next.add(sha);
        return next;
      });
      try {
        setDetailsErrors((prev) => {
          const next = new Map(prev);
          next.delete(sha);
          return next;
        });
        const res = await sendRequest<GitCommitDetailsResponse>('git.commitDetails', {
          workspaceId,
          repoPath: repoPath || undefined,
          commitSha: sha,
        });
        setDetailsCache((prev) => {
          const next = new Map(prev);
          next.set(sha, { body: res.body, files: res.files });
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load commit details';
        setDetailsErrors((prev) => {
          const next = new Map(prev);
          next.set(sha, message);
          return next;
        });
      } finally {
        setDetailsLoading((prev) => {
          const next = new Set(prev);
          next.delete(sha);
          return next;
        });
      }
    },
    [workspaceId, repoPath, detailsCache, detailsLoading],
  );

  const loadCommitDetailsRef = useRef(loadCommitDetails);
  loadCommitDetailsRef.current = loadCommitDetails;

  // ── Reset details on workspaceId / repoPath change ─────────────────

  useEffect(() => {
    setExpandedSha(null);
    setDetailsCache(new Map());
    setDetailsLoading(new Set());
    setDetailsErrors(new Map());
  }, [workspaceId, repoPath]);

  // ── Expand triggers details fetch ────────────────────────────────────

  useEffect(() => {
    if (expandedSha) {
      loadCommitDetailsRef.current(expandedSha);
    }
  }, [expandedSha]);

  // ── highlightCommitSha ───────────────────────────────────────────────

  // (effects moved after virtualizer declaration)

  // ── Computed lane data ───────────────────────────────────────────────

  const laneData = useMemo(() => computeLanes(commits), [commits]);

  const maxLane = useMemo(() => {
    if (laneData.length === 0) return 0;
    return Math.max(...laneData.map((l) => l.lane));
  }, [laneData]);

  const graphWidth = LANE_WIDTH * (maxLane + 1) + GRAPH_LEFT_PADDING;

  const activeLanesData = useMemo(() => computeActiveLanes(laneData), [laneData]);

  // ── Virtualizer ──────────────────────────────────────────────────────

  const rowVirtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index: number) => commits[index]?.id ?? index,
    measureElement: (el: HTMLElement) => el.getBoundingClientRect().height,
  });

  // ── highlightCommitSha effects ──────────────────────────────────────

  useEffect(() => {
    if (!highlightCommitSha) return;
    highlightPendingRef.current = true;
    setExpandedSha(highlightCommitSha);
    loadCommitDetailsRef.current(highlightCommitSha);

    // Try immediate scroll
    const idx = commits.findIndex((c) => c.id === highlightCommitSha);
    if (idx !== -1) {
      highlightPendingRef.current = false;
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(idx, { align: 'center' });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightCommitSha]);

  // Scroll when highlighted commit first appears after pagination
  useEffect(() => {
    if (!highlightPendingRef.current || !highlightCommitSha) return;
    const idx = commits.findIndex((c) => c.id === highlightCommitSha);
    if (idx !== -1) {
      highlightPendingRef.current = false;
      requestAnimationFrame(() => rowVirtualizer.scrollToIndex(idx, { align: 'center' }));
    }
  }, [commits, highlightCommitSha, rowVirtualizer]);

  // ── Render helpers ───────────────────────────────────────────────────

  const toggleExpand = useCallback((sha: string) => {
    setExpandedSha((prev) => (prev === sha ? null : sha));
  }, []);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      data-testid="git-tree-tab"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: COLOR_BG_PRIMARY,
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

      <div ref={parentRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {commits.length === 0 && !loading && (
          <div style={{ padding: 8, color: COLOR_TEXT_MUTED, fontSize: 12 }}>No commits</div>
        )}

        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const idx = virtualItem.index;
            const commit = commits[idx];
            const info = laneData[idx];
            const isExpanded = expandedSha === commit.id;
            const details = detailsCache.get(commit.id);
            const isLoadingDetails = detailsLoading.has(commit.id);
            const parentSha = commit.parents[0] ?? '';

            // Extract subject line (first line) from message
            const subject = commit.message.split('\n')[0] ?? commit.message;

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TreeRow
                  commit={commit}
                  subject={subject}
                  info={info}
                  graphWidth={graphWidth}
                  activeLanes={activeLanesData[idx] ?? EMPTY_ACTIVE_LANES}
                  isExpanded={isExpanded}
                  details={details}
                  isLoadingDetails={isLoadingDetails}
                  detailsError={detailsErrors.get(commit.id) ?? null}
                  parentSha={parentSha}
                  onToggle={toggleExpand}
                  onOpenCommitDiff={onOpenCommitDiff}
                  onRetryDetails={loadCommitDetailsRef.current}
                />
              </div>
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

// ── TreeRow (inner component) ──────────────────────────────────────────────

interface TreeRowProps {
  commit: GitLogItem;
  subject: string;
  info: LaneInfo;
  graphWidth: number;
  activeLanes: ActiveLane[];
  isExpanded: boolean;
  details: { body: string; files: GitCommitFileChange[] } | undefined;
  isLoadingDetails: boolean;
  detailsError: string | null;
  parentSha: string;
  onToggle: (sha: string) => void;
  onOpenCommitDiff: (commitSha: string, parentSha: string, filePath: string) => void;
  onRetryDetails: (sha: string) => void;
}

const TreeRow = memo(function TreeRow({
  commit,
  subject,
  info,
  graphWidth,
  activeLanes,
  isExpanded,
  details,
  isLoadingDetails,
  detailsError,
  parentSha,
  onToggle,
  onOpenCommitDiff,
  onRetryDetails,
}: TreeRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div>
      {/* Collapsed header row — always visible */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => onToggle(commit.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(commit.id);
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: ROW_HEIGHT,
          cursor: 'pointer',
          background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: COLOR_TEXT_MUTED,
            flexShrink: 0,
            width: 12,
            textAlign: 'center',
          }}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
        <CommitRowGraph info={info} graphWidth={graphWidth} activeLanes={activeLanes} />
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
            {subject}
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

      {/* Expanded details */}
      {isExpanded && (
        <div>
          {/* Commit body */}
          {details && details.body && details.body !== subject && (
            <div
              style={{
                fontSize: 12,
                color: COLOR_TEXT_MUTED,
                padding: '4px 8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {details.body}
            </div>
          )}

          {/* Author info */}
          <div
            style={{
              fontSize: 11,
              color: COLOR_TEXT_MUTED,
              padding: '2px 8px',
            }}
          >
            {commit.author}
          </div>

          {/* Files changed section */}
          {details && details.files.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: COLOR_TEXT_MUTED,
                  textTransform: 'uppercase',
                  padding: '4px 8px',
                  borderTop: `1px solid ${COLOR_BORDER}`,
                  marginTop: 4,
                }}
              >
                Files changed
              </div>
              {details.files.map((file) => (
                <FileRow
                  key={file.filePath}
                  file={file}
                  commitSha={commit.id}
                  parentSha={parentSha}
                  onOpenCommitDiff={onOpenCommitDiff}
                />
              ))}
            </div>
          )}

          {/* Loading state */}
          {isLoadingDetails && (
            <div
              style={{
                fontSize: 12,
                color: COLOR_TEXT_MUTED,
                padding: 8,
              }}
            >
              Loading...
            </div>
          )}

          {/* Error state */}
          {detailsError && !isLoadingDetails && (
            <div style={{ padding: 8, color: COLOR_ERROR, fontSize: 12 }}>
              <div>Failed to load commit details.</div>
              <button
                onClick={() => onRetryDetails(commit.id)}
                style={{
                  marginTop: 4,
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
        </div>
      )}
    </div>
  );
});
