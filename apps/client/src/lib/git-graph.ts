import type { GitLogItem } from '@ymir/shared';
import { GIT_GRAPH_COLORS } from './theme';

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
 * Processes commits newest→oldest (top to bottom, matching display order).
 * Each active lane tracks a single target parent hash; when a commit
 * appears it claims the lowest-numbered lane waiting for it, freeing
 * the rest. First parent stays on the commit's lane; additional parents
 * (merge targets) fan out to new lanes.
 */
export function computeLanes(commits: GitLogItem[]): LaneInfo[] {
  if (commits.length === 0) return [];

  // Map: lane number → { targetHash, colorIndex }
  // Represents lanes waiting for a specific parent commit to appear
  const activeLanes = new Map<number, { targetHash: string; colorIndex: number }>();

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
      colorIndex = nextColorIndex++ % GIT_GRAPH_COLORS.length;
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
        const newColor = nextColorIndex++ % GIT_GRAPH_COLORS.length;
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
export function computeActiveLanes(laneData: LaneInfo[]): ActiveLane[][] {
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
