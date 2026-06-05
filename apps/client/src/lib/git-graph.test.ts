import { describe, test, expect } from 'bun:test';
import { computeLanes, computeActiveLanes, EMPTY_ACTIVE_LANES, type LaneInfo } from './git-graph';
import type { GitLogItem } from '@ymir/shared';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Shorthand to build a GitLogItem with sensible defaults. */
function commit(
  id: string,
  parents: string[] = [],
  opts: Partial<Omit<GitLogItem, 'id' | 'parents'>> = {},
): GitLogItem {
  return {
    id,
    parents,
    message: opts.message ?? id,
    author: opts.author ?? 'test',
    date: opts.date ?? 0,
  };
}

/** Extract just the lane numbers from a LaneInfo array. */
function lanes(result: LaneInfo[]): number[] {
  return result.map((r) => r.lane);
}

/** Extract colorIndices from a LaneInfo array. */
function colors(result: LaneInfo[]): number[] {
  return result.map((r) => r.colorIndex);
}

// ── computeLanes ────────────────────────────────────────────────────────────

describe('computeLanes', () => {
  // ── Edge cases ──────────────────────────────────────────────────────────

  test('returns empty array for empty input', () => {
    expect(computeLanes([])).toEqual([]);
  });

  test('handles a single commit with no parents (root commit)', () => {
    const c = commit('a');
    const result = computeLanes([c]);

    expect(result).toHaveLength(1);
    expect(result[0].lane).toBe(0);
    expect(result[0].colorIndex).toBe(0);
    expect(result[0].linesDown).toEqual([]);
    expect(result[0].commit.id).toBe('a');
  });

  test('handles a single commit with a parent not in the visible range', () => {
    const c = commit('a', ['missing']);
    const result = computeLanes([c]);

    expect(result).toHaveLength(1);
    expect(result[0].lane).toBe(0);
    // First parent stays on same lane, linesDown should have one entry
    expect(result[0].linesDown).toHaveLength(1);
    expect(result[0].linesDown[0]).toEqual({
      fromLane: 0,
      toLane: 0,
      colorIndex: 0,
    });
  });

  // ── Linear history ──────────────────────────────────────────────────────

  test('assigns lane 0 to a simple linear chain', () => {
    // c → b → a (newest first)
    const commits = [commit('c', ['b']), commit('b', ['a']), commit('a')];
    const result = computeLanes(commits);

    // All should be on lane 0
    expect(lanes(result)).toEqual([0, 0, 0]);
    // Same color throughout
    expect(colors(result)).toEqual([0, 0, 0]);
  });

  test('linear chain: each commit has one lineDown to its parent', () => {
    const commits = [commit('c', ['b']), commit('b', ['a']), commit('a')];
    const result = computeLanes(commits);

    // c → b
    expect(result[0].linesDown).toEqual([{ fromLane: 0, toLane: 0, colorIndex: 0 }]);
    // b → a
    expect(result[1].linesDown).toEqual([{ fromLane: 0, toLane: 0, colorIndex: 0 }]);
    // a has no parents
    expect(result[2].linesDown).toEqual([]);
  });

  // ── Branch divergence ───────────────────────────────────────────────────

  test('two branches diverging from a common root', () => {
    //     c   b    (two branch tips)
    //      \ /
    //       a      (common parent)
    const commits = [commit('c', ['a']), commit('b', ['a']), commit('a')];
    const result = computeLanes(commits);

    // c: first commit, lane 0, targeting parent 'a'
    // b: no lane targeting it, so takes free lane → lane 1
    // a: both lanes 0 and 1 target it; picks lane 0, frees lane 1
    expect(lanes(result)).toEqual([0, 1, 0]);

    // c has one lineDown: lane 0 → lane 0
    expect(result[0].linesDown).toEqual([{ fromLane: 0, toLane: 0, colorIndex: 0 }]);

    // b has one lineDown: lane 1 → lane 0 (parent a is on lane 0)
    expect(result[1].linesDown).toEqual([{ fromLane: 1, toLane: 0, colorIndex: 0 }]);

    // a has no parents
    expect(result[2].linesDown).toEqual([]);
  });

  test('three branches from a single root', () => {
    // d, c, b all parent → a
    const commits = [commit('d', ['a']), commit('c', ['a']), commit('b', ['a']), commit('a')];
    const result = computeLanes(commits);

    // d: lane 0
    // c: lane 1 (new, no one targeting it)
    // b: lane 2 (new, no one targeting it)
    // a: lanes 0,1,2 all target it; picks 0, frees 1 and 2
    expect(lanes(result)).toEqual([0, 1, 2, 0]);
  });

  // ── Merge commits ───────────────────────────────────────────────────────

  test('merge commit fans out second parent to a new lane', () => {
    //     c (merge of a and b)
    //    / \
    //   b   a
    // b is first parent, a is second parent
    const commits = [commit('c', ['b', 'a']), commit('b'), commit('a')];
    const result = computeLanes(commits);

    // c: lane 0, first parent (b) stays on lane 0, second parent (a) gets lane 1
    expect(result[0].lane).toBe(0);
    expect(result[0].linesDown).toHaveLength(2);
    expect(result[0].linesDown[0]).toEqual({ fromLane: 0, toLane: 0, colorIndex: 0 }); // → b
    expect(result[0].linesDown[1]).toEqual({ fromLane: 0, toLane: 1, colorIndex: 1 }); // → a

    // b: lane 0
    expect(result[1].lane).toBe(0);
    // a: lane 1 (was assigned as a new lane for merge target)
    expect(result[2].lane).toBe(1);
  });

  test('merge commit with linear first parent branch', () => {
    // d is a merge: first parent c, second parent b
    // d → c → a
    //   ↘ b
    const commits = [commit('d', ['c', 'b']), commit('c', ['a']), commit('b'), commit('a')];
    const result = computeLanes(commits);

    // d: lane 0, linesDown: [lane0→lane0 for c, lane0→lane1 for b]
    expect(result[0].lane).toBe(0);
    expect(result[0].linesDown).toHaveLength(2);
    expect(result[0].linesDown[0].toLane).toBe(0); // first parent c on lane 0
    expect(result[0].linesDown[1].toLane).toBe(1); // second parent b on lane 1

    // c: lane 0, parent a stays on lane 0
    expect(result[1].lane).toBe(0);

    // b: lane 1
    expect(result[2].lane).toBe(1);

    // a: lane 0 (both lane 0 and lane 1 target it)
    expect(result[3].lane).toBe(0);
  });

  // ── Lane reuse ──────────────────────────────────────────────────────────

  test('freed lanes are reused by new branches', () => {
    // a → b → c (main)
    //        ↘ d (branch from b)
    // displayed newest-first: d, c, b, a
    // d and c are branch tips, b is common ancestor, a is root
    const commits = [
      commit('d', ['b']), // branch tip
      commit('c', ['b']), // main tip
      commit('b', ['a']), // common ancestor
      commit('a'), // root
    ];
    const result = computeLanes(commits);

    // d: lane 0 (first commit)
    // c: lane 1 (no one targets c, new lane)
    // b: lanes 0 and 1 target it; picks 0, frees 1
    // a: only lane 0 targets it
    expect(lanes(result)).toEqual([0, 1, 0, 0]);

    // Verify lane 1 was freed and reused
    // b's parent a stays on lane 0
    expect(result[2].linesDown).toEqual([{ fromLane: 0, toLane: 0, colorIndex: 0 }]);
  });

  // ── Color cycling ───────────────────────────────────────────────────────

  test('color indices cycle after exceeding the palette size', () => {
    // Create 10 root commits to force colorIndex to wrap (palette size is 8)
    const commits = Array.from({ length: 10 }, (_, i) => commit(`r${i}`));
    const result = computeLanes(commits);

    // Colors should be 0..7, then 0,1
    expect(colors(result)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
  });

  // ── Complex graph ───────────────────────────────────────────────────────

  test('handles a diamond-shaped history', () => {
    //     d (merge)
    //    / \
    //   b   c
    //    \ /
    //     a
    // Display order: d, c, b, a
    const commits = [
      commit('d', ['b', 'c']), // merge
      commit('c', ['a']),
      commit('b', ['a']),
      commit('a'),
    ];
    const result = computeLanes(commits);

    // d: lane 0
    expect(result[0].lane).toBe(0);
    // d has 2 parents: b (first, lane 0) and c (second, new lane 1)
    expect(result[0].linesDown).toHaveLength(2);

    // c: should be on lane 1 (merge target lane)
    expect(result[1].lane).toBe(1);
    // c's parent is 'a' which is on lane 0, so c → a goes from lane 1 to lane 0
    expect(result[1].linesDown[0].toLane).toBe(0);

    // b: lanes targeting b? d's first parent lineDown is lane 0 → lane 0 targeting b
    expect(result[2].lane).toBe(0);

    // a: targeted by both lane 0 (from b) and lane 1 (from c)
    expect(result[3].lane).toBe(0); // picks lowest
  });

  test('handles octopus merge (3+ parents)', () => {
    // m merges b, c, d into one
    const commits = [commit('m', ['b', 'c', 'd']), commit('b'), commit('c'), commit('d')];
    const result = computeLanes(commits);

    // m: lane 0, first parent b on lane 0, second parent c on lane 1,
    // third parent d on lane 2
    expect(result[0].lane).toBe(0);
    expect(result[0].linesDown).toHaveLength(3);
    expect(result[0].linesDown[0]).toEqual({ fromLane: 0, toLane: 0, colorIndex: 0 });
    expect(result[0].linesDown[1]).toEqual({ fromLane: 0, toLane: 1, colorIndex: 1 });
    expect(result[0].linesDown[2]).toEqual({ fromLane: 0, toLane: 2, colorIndex: 2 });

    expect(result[1].lane).toBe(0); // b
    expect(result[2].lane).toBe(1); // c
    expect(result[3].lane).toBe(2); // d
  });

  // ── Multiple roots ──────────────────────────────────────────────────────

  test('handles multiple unrelated root commits', () => {
    // Three independent root commits
    const commits = [commit('r1'), commit('r2'), commit('r3')];
    const result = computeLanes(commits);

    // Each gets its own lane since no one targets any of them
    expect(lanes(result)).toEqual([0, 1, 2]);
    expect(colors(result)).toEqual([0, 1, 2]);
    // No linesDown since no parents
    expect(result.every((r) => r.linesDown.length === 0)).toBe(true);
  });

  test('multiple roots each with linear descendants', () => {
    // Two independent chains:
    // c → b → a
    // f → e → d
    // interleaved display: c, f, b, e, a, d
    const commits = [
      commit('c', ['b']),
      commit('f', ['e']),
      commit('b', ['a']),
      commit('e', ['d']),
      commit('a'),
      commit('d'),
    ];
    const result = computeLanes(commits);

    // c: lane 0
    // f: lane 1 (no one targets f)
    // b: lane 0 (lane 0 targets b)
    // e: lane 1 (lane 1 targets e)
    // a: lane 0 (lane 0 targets a)
    // d: lane 1 (lane 1 targets d)
    expect(lanes(result)).toEqual([0, 1, 0, 1, 0, 1]);
  });

  test('handles paginated view where parent is outside visible range', () => {
    // Simulate paginated view: commits c,b visible, parent 'a' is missing (off-screen)
    const commits = [commit('c', ['b']), commit('b', ['a'])];
    const result = computeLanes(commits);
    expect(result).toHaveLength(2);
    // Both visible commits should have valid lane assignments
    expect(result[0].lane).toBeGreaterThanOrEqual(0);
    expect(result[1].lane).toBeGreaterThanOrEqual(0);
    // b should have a lineDown to its missing parent 'a'
    expect(result[1].linesDown.length).toBeGreaterThanOrEqual(1);
    // The lineDown to 'a' should have a valid toLane
    const lineToA = result[1].linesDown[0];
    expect(lineToA.toLane).toBeGreaterThanOrEqual(0);
    expect(lineToA.colorIndex).toBeGreaterThanOrEqual(0);
  });
});

// ── computeActiveLanes ──────────────────────────────────────────────────────

describe('computeActiveLanes', () => {
  test('returns empty array for empty input', () => {
    expect(computeActiveLanes([])).toEqual([]);
  });

  test('single commit with no parents has no active lanes', () => {
    const result = computeLanes([commit('a')]);
    const active = computeActiveLanes(result);

    expect(active).toHaveLength(1);
    // Row 0: no edges and no off-screen pass-through → empty
    expect(active[0]).toEqual([]);
  });

  test('linear chain: pass-through lanes from edges only', () => {
    // c → b → a, all on lane 0
    const result = computeLanes([commit('c', ['b']), commit('b', ['a']), commit('a')]);
    const active = computeActiveLanes(result);

    expect(active).toHaveLength(3);

    // Row 0 (c): no edges starting above, no off-screen pass-through → empty
    expect(active[0]).toEqual([]);
    // Row 1 (b): line from c(0)→b(0) active in row 1
    expect(active[1].map((a) => a.lane)).toContain(0);
    // Row 2 (a): line from b(0)→a(0)
    expect(active[2].map((a) => a.lane)).toContain(0);
  });

  test('merge commit: detects branch lane passing through', () => {
    // d merges b and c, both from a:
    //   d (merge: first parent b, second parent c)
    //   c → a
    //   b → a
    const commits = [commit('d', ['b', 'c']), commit('c', ['a']), commit('b', ['a']), commit('a')];
    const result = computeLanes(commits);
    const active = computeActiveLanes(result);

    expect(active).toHaveLength(4);

    // Row 0 (d): no off-screen pass-through → empty
    expect(active[0]).toEqual([]);

    // Row 1 (c): lines from d→b (lane 0→0) and d→c (lane 0→lane for c)
    // Both lane 0 and c's lane should be active
    const row1Lanes = active[1].map((a) => a.lane);
    expect(row1Lanes).toContain(0);
  });

  test('two branches: pass-through detected between branch tip and merge point', () => {
    // c and b both from a
    // c at row 0 has line c→a spanning rows 1–2 (lane 0)
    // b at row 1 has line b→a spanning row 2 only (lane 1)
    const commits = [commit('c', ['a']), commit('b', ['a']), commit('a')];
    const result = computeLanes(commits);
    const active = computeActiveLanes(result);

    expect(active).toHaveLength(3);

    // Row 0 (c): no off-screen pass-through → empty
    expect(active[0]).toEqual([]);

    // Row 1 (b): lane 0 from c→a (normal edge)
    const row1Lanes = active[1].map((a) => a.lane);
    expect(row1Lanes).toContain(0);

    // Row 2 (a): both lanes active — lane 0 from c→a, lane 1 from b→a
    const row2Lanes = active[2].map((a) => a.lane);
    expect(row2Lanes).toContain(0);
    expect(row2Lanes).toContain(1);
  });

  test('parent not in visible range is skipped', () => {
    // Commit with a parent not in the list
    const commits = [commit('a', ['missing'])];
    const result = computeLanes(commits);
    const active = computeActiveLanes(result);

    // Only one commit, parent not in range. No off-screen pass-through.
    expect(active).toHaveLength(1);
    expect(active[0]).toEqual([]);
  });

  test('active lanes include color indices from line segments', () => {
    const commits = [commit('c', ['b']), commit('b', ['a']), commit('a')];
    const result = computeLanes(commits);
    const active = computeActiveLanes(result);

    // All lanes should be lane 0 with color 0
    for (const row of active) {
      for (const al of row) {
        if (al.lane === 0) {
          expect(al.colorIndex).toBe(0);
        }
      }
    }
  });
});

// ── EMPTY_ACTIVE_LANES constant ─────────────────────────────────────────────

describe('EMPTY_ACTIVE_LANES', () => {
  test('is an empty array', () => {
    expect(EMPTY_ACTIVE_LANES).toEqual([]);
  });
});
