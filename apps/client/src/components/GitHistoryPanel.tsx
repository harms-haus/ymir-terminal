import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  memo,
} from 'react';
import { useInView } from 'react-intersection-observer';
import { useVirtualizer } from '@tanstack/react-virtual';
import { sendRequest } from '../lib/send-request';
import type { GitLogItem, GitLogResponse } from '@ymir/shared';
import {
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_ERROR,
} from '../lib/theme';

// ── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const ROW_HEIGHT = 30;
const LANE_WIDTH = 16;
const GRAPH_LEFT_PADDING = 10;
const COLOR_PALETTE = [
  '#007acc',
  '#4ec9b0',
  '#c586c0',
  '#dcdcaa',
  '#e06050',
  '#569cd6',
  '#ce9178',
  '#b5cea8',
];

// ── Lane allocation types ───────────────────────────────────────────────────

interface LineSegment {
  fromLane: number;
  toLane: number;
  colorIndex: number;
}

interface LaneInfo {
  commit: GitLogItem;
  lane: number;
  colorIndex: number;
  linesDown: LineSegment[];
}

interface ActiveLane {
  lane: number;
  colorIndex: number;
}

const EMPTY_ACTIVE_LANES: ActiveLane[] = [];

// ── formatRelativeTime ──────────────────────────────────────────────────────

function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

// ── computeLanes ────────────────────────────────────────────────────────────

/**
 * Computes lane assignments and line segments for a git commit graph.
 * Processes commits newest→oldest (top to bottom, matching display order).
 * Each active lane tracks a single target parent hash; when a commit
 * appears it claims the lowest-numbered lane waiting for it, freeing
 * the rest. First parent stays on the commit's lane; additional parents
 * (merge targets) fan out to new lanes.
 */
function computeLanes(commits: GitLogItem[]): LaneInfo[] {
  if (commits.length === 0) return [];

  // Map: lane number → { targetHash, colorIndex }
  // Represents lanes waiting for a specific parent commit to appear
  const activeLanes = new Map<
    number,
    { targetHash: string; colorIndex: number }
  >();

  const freeLanes: number[] = [];
  let nextLane = 0;
  let nextColorIndex = 0;

  const results: LaneInfo[] = [];

  function takeFreeLane(): number {
    if (freeLanes.length > 0) return freeLanes.shift()!;
    return nextLane++;
  }

  for (const commit of commits) {
    // Step 1: Find which active lanes target this commit
    const targetingLanes: number[] = [];
    for (const [lane, info] of activeLanes) {
      if (info.targetHash === commit.id) {
        targetingLanes.push(lane);
      }
    }

    // Step 2: Assign this commit a lane
    let lane: number;
    let colorIndex: number;

    if (targetingLanes.length > 0) {
      // Pick lowest-numbered targeting lane
      targetingLanes.sort((a, b) => a - b);
      lane = targetingLanes[0];
      colorIndex = activeLanes.get(lane)!.colorIndex;

      // Free other targeting lanes (they merge into this commit)
      for (let i = 1; i < targetingLanes.length; i++) {
        activeLanes.delete(targetingLanes[i]);
        freeLanes.push(targetingLanes[i]);
        freeLanes.sort((a, b) => a - b);
      }

      // Remove this lane from active (we'll re-add it for the parent below)
      activeLanes.delete(lane);
    } else {
      // No child targeting this commit — it's a branch root or the first commit
      lane = takeFreeLane();
      colorIndex = nextColorIndex++ % COLOR_PALETTE.length;
    }

    // Step 3: For each parent, allocate a lane and add to activeLanes
    const linesDown: LineSegment[] = [];
    const parentLanes: {
      parentId: string;
      parentLane: number;
      parentColor: number;
    }[] = [];

    for (let p = 0; p < commit.parents.length; p++) {
      const parentId = commit.parents[p];

      if (p === 0) {
        // First parent stays on same lane
        parentLanes.push({
          parentId,
          parentLane: lane,
          parentColor: colorIndex,
        });
      } else {
        // Additional parents (merge targets) get new lanes
        const newLane = takeFreeLane();
        const newColor = nextColorIndex++ % COLOR_PALETTE.length;
        parentLanes.push({
          parentId,
          parentLane: newLane,
          parentColor: newColor,
        });
      }
    }

    // Register parent lanes as active
    for (const pl of parentLanes) {
      activeLanes.set(pl.parentLane, {
        targetHash: pl.parentId,
        colorIndex: pl.parentColor,
      });
    }

    // Build linesDown
    for (const pl of parentLanes) {
      linesDown.push({
        fromLane: lane,
        toLane: pl.parentLane,
        colorIndex: pl.parentColor,
      });
    }

    results.push({ commit, lane, colorIndex, linesDown });
  }

  return results;
}

// ── computeActiveLanes ──────────────────────────────────────────────────────

/**
 * For each row, determines which lanes pass through (vertical lines from a
 * commit above to a parent below that aren't the current row's own lane).
 * Used to draw pass-through vertical lines in the per-row SVG.
 */
function computeActiveLanes(
  laneData: LaneInfo[],
): ActiveLane[][] {
  const n = laneData.length;
  if (n === 0) return [];

  const active: ActiveLane[][] = new Array(n);

  // Build a map from hash → laneData index
  const hashToIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    hashToIndex.set(laneData[i].commit.id, i);
  }

  // Build lane → colorIndex map
  const laneColorMap = new Map<number, number>();
  for (const info of laneData) {
    if (!laneColorMap.has(info.lane)) {
      laneColorMap.set(info.lane, info.colorIndex);
    }
  }
  for (const info of laneData) {
    for (const seg of info.linesDown) {
      if (!laneColorMap.has(seg.toLane)) {
        laneColorMap.set(seg.toLane, seg.colorIndex);
      }
    }
  }

  // For each commit at index i, look at each parent. The parent appears at
  // some index j where j > i (commits are newest-first, parents are older).
  // The line segment from i to j means both lanes (fromLane & toLane) are
  // active for rows i+1 .. j-1.
  const rowSets: Set<number>[] = new Array(n);
  for (let i = 0; i < n; i++) rowSets[i] = new Set();

  for (let i = 0; i < n; i++) {
    const info = laneData[i];
    for (let p = 0; p < info.commit.parents.length; p++) {
      const parentHash = info.commit.parents[p];
      const j = hashToIndex.get(parentHash);
      if (j === undefined) continue; // parent not in visible range

      const seg = info.linesDown[p];
      for (let r = i + 1; r <= j; r++) {
        rowSets[r].add(seg.fromLane);
        rowSets[r].add(seg.toLane);
      }
    }
  }

  // Convert sets to ActiveLane arrays
  for (let i = 0; i < n; i++) {
    const lanes = Array.from(rowSets[i]);
    active[i] = lanes.map((l) => ({
      lane: l,
      colorIndex: laneColorMap.get(l) ?? 0,
    }));
  }

  return active;
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
  const color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
  const cx = lane * LANE_WIDTH + GRAPH_LEFT_PADDING;
  const cy = ROW_HEIGHT / 2;

  return (
    <div style={{ display: 'flex', height: ROW_HEIGHT, ...style }}>
      {/* Graph column */}
      <svg
        width={graphWidth}
        height={ROW_HEIGHT}
        style={{ flexShrink: 0 }}
      >
        {/* Pass-through vertical lines */}
        {activeLanes.map((al) => {
          const x = al.lane * LANE_WIDTH + GRAPH_LEFT_PADDING;
          const c = COLOR_PALETTE[al.colorIndex % COLOR_PALETTE.length];
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
          const segColor =
            COLOR_PALETTE[seg.colorIndex % COLOR_PALETTE.length];

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
          flexDirection: 'column',
          justifyContent: 'center',
          paddingLeft: 4,
          paddingRight: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: COLOR_TEXT,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
          }}
        >
          {commit.message}
        </div>
        <div style={{ fontSize: 10, color: COLOR_TEXT_MUTED }}>
          {commit.author} · {formatRelativeTime(commit.date)}
        </div>
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

  const graphWidth = (maxLane + 1) * LANE_WIDTH + GRAPH_LEFT_PADDING * 2;

  // ── Active lanes per row ───────────────────────────────────────────────

  const activeLanesPerRow = useMemo(
    () => computeActiveLanes(laneData),
    [laneData],
  );

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
        <div style={{ padding: 8, color: COLOR_ERROR, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <div style={{ padding: 8, color: COLOR_TEXT_MUTED, fontSize: 12 }}>
            No commits
          </div>
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
          <div style={{ padding: 8, color: COLOR_TEXT_MUTED, fontSize: 12 }}>
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
