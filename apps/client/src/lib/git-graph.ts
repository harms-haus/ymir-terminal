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
 *
 * Uses a sweep-line approach: records interval boundaries (start/end rows)
 * for each lane segment, then makes a single pass over all rows.
 * This reduces complexity from O(n * total_segments) to O(n + total_segments).
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

  // Record interval boundaries for each lane segment.
  // For each segment from commit i to parent j (j > i), the lanes are
  // active for rows i+1 .. j inclusive. We record starts at row i+1 and
  // ends at row j+1 (the first row where the lanes are no longer active).
  const laneStarts: Map<number, number[]> = new Map();
  const laneEnds: Map<number, number[]> = new Map();

  for (let i = 0; i < n; i++) {
    const info = laneData[i];
    for (let p = 0; p < info.commit.parents.length; p++) {
      const parentHash = info.commit.parents[p];
      const j = hashToIndex.get(parentHash);
      if (j === undefined) continue; // parent not in visible range

      const seg = info.linesDown[p];
      const startRow = i + 1;
      const endRow = j + 1;

      // Collect unique lanes for this segment (fromLane and toLane
      // may be the same — only add once per segment)
      const segmentLanes =
        seg.fromLane === seg.toLane ? [seg.fromLane] : [seg.fromLane, seg.toLane];

      for (const lane of segmentLanes) {
        let arr = laneStarts.get(startRow);
        if (!arr) {
          arr = [];
          laneStarts.set(startRow, arr);
        }
        arr.push(lane);

        arr = laneEnds.get(endRow);
        if (!arr) {
          arr = [];
          laneEnds.set(endRow, arr);
        }
        arr.push(lane);
      }
    }
  }

  // Sweep line: single pass through all rows
  const activeCounts = new Map<number, number>();

  for (let r = 0; r < n; r++) {
    // Process removals first — a lane removed by one interval ending
    // at row r can be re-added by another interval starting at row r
    const ends = laneEnds.get(r);
    if (ends) {
      for (const lane of ends) {
        const prev = activeCounts.get(lane)!;
        if (prev <= 1) {
          activeCounts.delete(lane);
        } else {
          activeCounts.set(lane, prev - 1);
        }
      }
    }

    const starts = laneStarts.get(r);
    if (starts) {
      for (const lane of starts) {
        activeCounts.set(lane, (activeCounts.get(lane) ?? 0) + 1);
      }
    }

    // Convert current active lanes to array
    const lanes = Array.from(activeCounts.keys());
    active[r] = lanes.map((l) => ({
      lane: l,
      colorIndex: laneColorMap.get(l) ?? 0,
    }));
  }

  return active;
}
