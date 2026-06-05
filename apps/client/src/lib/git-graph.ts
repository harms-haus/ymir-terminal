import type { GitLogItem } from '@ymir/shared';
import { GIT_GRAPH_COLORS } from './theme';
import { computeGraphPosition, type CommitGraphNode } from './commit-graph-position';

// ── Constants ───────────────────────────────────────────────────────────────

export const LANE_WIDTH = 16;
export const GRAPH_LEFT_PADDING = 10;

// ── Lane allocation types ───────────────────────────────────────────────────

export interface LineSegment {
  fromLane: number;
  toLane: number;
  colorIndex: number;
}

export interface LaneInfo {
  commit: GitLogItem;
  lane: number;
  colorIndex: number;
  linesDown: LineSegment[];
}

export interface ActiveLane {
  lane: number;
  colorIndex: number;
}

export const EMPTY_ACTIVE_LANES: ActiveLane[] = [];

// ── computeLanes ────────────────────────────────────────────────────────────

/**
 * Computes lane assignments and line segments for a git commit graph.
 * Delegates column placement to the dolthub-derived `computeGraphPosition`
 * algorithm, then maps its x-coordinates onto our LaneInfo structure.
 */
export function computeLanes(commits: GitLogItem[]): LaneInfo[] {
  if (commits.length === 0) return [];

  // Visible commit hashes
  const visibleHashes = new Set(commits.map((c) => c.id));

  // Build children map (only within visible set)
  const childrenMap = new Map<string, string[]>();
  for (const c of commits) {
    for (const parentId of c.parents) {
      if (visibleHashes.has(parentId)) {
        let arr = childrenMap.get(parentId);
        if (!arr) {
          arr = [];
          childrenMap.set(parentId, arr);
        }
        arr.push(c.id);
      }
    }
  }

  // Detect missing parents (parents not in the visible set) and
  // track which visible commits reference each missing parent.
  const missingParentHashes = new Set<string>();
  const missingParentChildren = new Map<string, string[]>();
  for (const c of commits) {
    for (const parentId of c.parents) {
      if (!visibleHashes.has(parentId)) {
        missingParentHashes.add(parentId);
        let arr = missingParentChildren.get(parentId);
        if (!arr) {
          arr = [];
          missingParentChildren.set(parentId, arr);
        }
        arr.push(c.id);
      }
    }
  }

  // Lookup map for O(1) commit access by id
  const commitById = new Map(commits.map((c) => [c.id, c]));

  // Create synthetic nodes for missing parents so the algorithm can
  // still route edges to off-screen ancestors.
  const syntheticNodes: CommitGraphNode[] = [];
  for (const hash of missingParentHashes) {
    const childIds = missingParentChildren.get(hash)!;
    const earliestChildDate = Math.min(...childIds.map((id) => commitById.get(id)!.date));
    syntheticNodes.push({
      hash,
      parents: [],
      children: childIds,
      commitDate: new Date(earliestChildDate * 1000 - 1),
      x: -1,
      y: -1,
    });
  }

  // Create CommitGraphNode entries for visible commits
  const visibleNodes: CommitGraphNode[] = commits.map((c) => ({
    hash: c.id,
    parents: c.parents,
    children: childrenMap.get(c.id) ?? [],
    commitDate: new Date(c.date * 1000),
    x: -1,
    y: -1,
  }));

  // Run the graph-position algorithm on the combined set
  const allNodes = [...visibleNodes, ...syntheticNodes];
  const { commitsMap } = computeGraphPosition(allNodes);

  // Build LaneInfo[] for visible commits only, in ORIGINAL input order
  return commits.map((commit) => {
    const node = commitsMap.get(commit.id)!;
    const lane = node.x;
    const colorIndex = lane % GIT_GRAPH_COLORS.length;

    const linesDown: LineSegment[] = commit.parents.map((parentId) => {
      const parentNode = commitsMap.get(parentId);
      const toLane = parentNode ? parentNode.x : lane;
      const segColorIndex = toLane % GIT_GRAPH_COLORS.length;
      return { fromLane: lane, toLane, colorIndex: segColorIndex };
    });

    return { commit, lane, colorIndex, linesDown };
  });
}

// ── computeActiveLanes ──────────────────────────────────────────────────────

/**
 * For each row, determines which lanes pass through (vertical lines from a
 * commit above to a parent below that aren't the current row's own lane).
 * Used to draw pass-through vertical lines in the per-row SVG.
 */
export function computeActiveLanes(laneData: LaneInfo[]): ActiveLane[][] {
  const n = laneData.length;
  if (n === 0) return [];

  // Map commit hash → row index
  const hashToIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    hashToIndex.set(laneData[i].commit.id, i);
  }

  // Map lane number → colorIndex (first-write-wins)
  const laneColorMap = new Map<number, number>();
  for (const info of laneData) {
    if (!laneColorMap.has(info.lane)) {
      laneColorMap.set(info.lane, info.colorIndex);
    }
  }
  for (const info of laneData) {
    for (const seg of info.linesDown) {
      if (!laneColorMap.has(seg.fromLane)) {
        laneColorMap.set(seg.fromLane, seg.colorIndex);
      }
      if (!laneColorMap.has(seg.toLane)) {
        laneColorMap.set(seg.toLane, seg.colorIndex);
      }
    }
  }

  // Sweep-line: record start/end events per row instead of filling
  // every intermediate row, reducing O(n²) to O(n + E) where E is the
  // total number of edges.
  const startEvents = new Map<number, number[]>();
  const endEvents = new Map<number, number[]>();

  const addEvent = (map: Map<number, number[]>, row: number, lane: number) => {
    let arr = map.get(row);
    if (!arr) {
      arr = [];
      map.set(row, arr);
    }
    arr.push(lane);
  };

  for (let i = 0; i < n; i++) {
    const info = laneData[i];
    for (let p = 0; p < info.commit.parents.length; p++) {
      const parentHash = info.commit.parents[p];
      const j = hashToIndex.get(parentHash);
      if (j === undefined) continue; // parent not in visible range

      const seg = info.linesDown[p];
      addEvent(startEvents, i + 1, seg.fromLane);
      addEvent(endEvents, j + 1, seg.fromLane);
      if (seg.toLane !== seg.fromLane) {
        addEvent(startEvents, i + 1, seg.toLane);
        addEvent(endEvents, j + 1, seg.toLane);
      }
    }
  }

  // Single sweep collecting active lanes via reference counts
  const activeCounts = new Map<number, number>(); // lane → ref count
  const active: ActiveLane[][] = new Array(n);

  for (let r = 0; r < n; r++) {
    // Process starts
    for (const lane of startEvents.get(r) ?? []) {
      activeCounts.set(lane, (activeCounts.get(lane) ?? 0) + 1);
    }
    // Process ends
    for (const lane of endEvents.get(r) ?? []) {
      const count = activeCounts.get(lane)! - 1;
      if (count === 0) activeCounts.delete(lane);
      else activeCounts.set(lane, count);
    }
    // Snapshot current active lanes
    active[r] = [...activeCounts.keys()]
      .sort((a, b) => a - b)
      .map((lane) => ({
        lane,
        colorIndex: laneColorMap.get(lane) ?? 0,
      }));
  }

  return active;
}
