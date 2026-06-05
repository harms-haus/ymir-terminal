// Adapted from dolthub/commit-graph
// Source: https://github.com/dolthub/commit-graph/blob/main/src/components/CommitGraph/computePosition.ts
// Copyright DoltHub, Inc.
// Licensed under the Apache License, Version 2.0.
// Modified for Ymir Terminal.

// ── Types ───────────────────────────────────────────────────────────────────

export interface CommitGraphNode {
  hash: string;
  parents: string[];
  children: string[];
  commitDate: Date;
  x: number; // column assignment (set by algorithm)
  y: number; // row assignment (set by algorithm)
}

export interface BranchSegment {
  start: number; // start Y position (row index)
  end: number; // end Y position (row index), Infinity if open-ended
  endCommitHash: string;
  branchOrder: number; // monotonically increasing counter
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Produces a topological ordering of commit hashes (reverse-post-order via DFS).
 * Ties are broken by commitDate descending; equal dates fall back to original
 * array index so the sort is stable.
 */
function topologicalOrderCommits(
  commits: CommitGraphNode[],
  commitsMap: Map<string, CommitGraphNode>,
): string[] {
  const sorted = commits
    .map((node, originalIndex) => ({ node, originalIndex }))
    .sort((a, b) => {
      const dateDiff = b.node.commitDate.getTime() - a.node.commitDate.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.originalIndex - b.originalIndex;
    });

  const seen = new Set<string>();
  const sortedCommits: string[] = [];

  for (const { node } of sorted) {
    if (seen.has(node.hash)) continue;
    seen.add(node.hash);

    const stack: { hash: string; childIndex: number }[] = [{ hash: node.hash, childIndex: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const currentNode = commitsMap.get(top.hash);

      if (currentNode && top.childIndex < currentNode.children.length) {
        const childHash = currentNode.children[top.childIndex];
        top.childIndex++;
        if (!seen.has(childHash)) {
          seen.add(childHash);
          stack.push({ hash: childHash, childIndex: 0 });
        }
      } else {
        stack.pop();
        sortedCommits.push(top.hash);
      }
    }
  }

  return sortedCommits;
}

/**
 * Walks commits in topological order and assigns each one a column (x) and
 * row (y = index). Returns the columns array (each column is a list of
 * BranchSegments) and the enriched commitsMap with x/y populated.
 */
function computeColumns(
  orderedHashes: string[],
  commitsMap: Map<string, CommitGraphNode>,
): { columns: BranchSegment[][]; commitsMap: Map<string, CommitGraphNode> } {
  const columns: BranchSegment[][] = [];
  const commitXs = new Map<string, number>();
  // commitsMap is mutated in-place with x/y positions
  let branchOrder = 0;

  for (let i = 0; i < orderedHashes.length; i++) {
    const hash = orderedHashes[i];
    const node = commitsMap.get(hash)!;

    const branchChildren = node.children.filter((childHash) => {
      const childNode = commitsMap.get(childHash);
      return childNode !== undefined && childNode.parents[0] === hash;
    });

    const isLastCommitOnBranch = node.children.length === 0;
    const isBranchOutCommit = branchChildren.length > 0;
    const isFirstCommit = node.parents.length === 0;
    const end = isFirstCommit ? i : Infinity;

    let commitX: number;

    if (isLastCommitOnBranch) {
      columns.push([]);
      commitX = columns.length - 1;
      columns[commitX].push({
        start: i,
        end,
        endCommitHash: hash,
        branchOrder,
      });
      branchOrder++;
    } else if (isBranchOutCommit) {
      const branchChildXs = branchChildren.map((ch) => commitXs.get(ch)!);
      commitX = Math.min(...branchChildXs);

      // Terminate the segment in the chosen column at this row
      const col = columns[commitX];
      if (col.length > 0) {
        col[col.length - 1].end = i;
      }

      // For other branch children not at commitX, terminate and start new segments
      for (const childHash of branchChildren) {
        const childX = commitXs.get(childHash)!;
        if (childX !== commitX) {
          const otherCol = columns[childX];
          if (otherCol.length > 0) {
            otherCol[otherCol.length - 1].end = i - 1;
          }
          otherCol.push({
            start: i,
            end: Infinity,
            endCommitHash: childHash,
            branchOrder,
          });
          branchOrder++;
        }
      }

      columns[commitX].push({
        start: i,
        end,
        endCommitHash: hash,
        branchOrder,
      });
      branchOrder++;
    } else {
      // Merge commit — find a reusable column or create a new one
      const childXs = node.children.map((ch) => commitXs.get(ch)!);
      const maxChildX = Math.max(...childXs);

      const minChildY = Math.min(...node.children.map((ch) => commitsMap.get(ch)!.y));

      let foundColIdx = -1;
      for (let c = maxChildX + 1; c < columns.length; c++) {
        const col = columns[c];
        if (col.length > 0 && col[col.length - 1].end < minChildY) {
          foundColIdx = c;
          break;
        }
      }

      if (foundColIdx >= 0) {
        commitX = foundColIdx;
      } else {
        columns.push([]);
        commitX = columns.length - 1;
      }

      columns[commitX].push({
        start: i,
        end,
        endCommitHash: hash,
        branchOrder,
      });
      branchOrder++;
    }

    // Set position on the node
    node.x = commitX;
    node.y = i;
    commitXs.set(hash, commitX);
  }

  return { columns, commitsMap };
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Computes column (x) and row (y) positions for a set of commits, producing
 * both the enriched node map and a columns structure of BranchSegments that
 * describe the vertical span of each branch lane.
 */
export function computeGraphPosition(commits: CommitGraphNode[]): {
  columns: BranchSegment[][];
  commitsMap: Map<string, CommitGraphNode>;
} {
  if (commits.length === 0) {
    return { columns: [], commitsMap: new Map() };
  }

  const commitsMap = new Map<string, CommitGraphNode>();
  for (const node of commits) {
    commitsMap.set(node.hash, node);
  }

  const orderedHashes = topologicalOrderCommits(commits, commitsMap);
  const { columns } = computeColumns(orderedHashes, commitsMap);

  return { columns, commitsMap };
}
