import { readdir } from 'node:fs/promises';
import { join, basename, relative } from 'node:path';
import type { GitRepoInfo } from '@ymir/shared';
import { isGitRepo, getCurrentBranch, hasRemote, getAheadBehind } from './status';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  '__pycache__',
  'vendor',
  'Pods',
  '.tox',
  '.venv',
  'venv',
  'env',
  '.idea',
  '.vscode',
]);

const BATCH_SIZE = 10;

/**
 * Discovers git repositories within a workspace directory using BFS (breadth-first search).
 * Processes directories level-by-level up to `maxDepth` (default 5), concurrently in batches
 * of 10. Known non-project directories and hidden directories are skipped when recursing into subdirectories. The optional `onDepthComplete` callback fires after each BFS depth that yields
 * repos, with a shallow copy of the results for that level. Returns a sorted array of
 * `GitRepoInfo` — workspace root repo first, then alphabetical.
 */
export async function discoverRepos(
  workspaceCwd: string,
  maxDepth = 5,
  onDepthComplete?: (repos: GitRepoInfo[], depth: number) => void,
): Promise<GitRepoInfo[]> {
  const allRepos: GitRepoInfo[] = [];
  let currentLevel: string[] = [workspaceCwd];
  let depth = 0;

  while (currentLevel.length > 0 && depth <= maxDepth) {
    const depthRepos: GitRepoInfo[] = [];
    const nextLevelCandidates: string[] = [];

    // Process directories at this depth concurrently in batches
    for (let i = 0; i < currentLevel.length; i += BATCH_SIZE) {
      const batch = currentLevel.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (dir) => {
          // Skip SKIP_DIRS at depths > 0 (depth 0 is the workspace root itself)
          if (depth > 0 && SKIP_DIRS.has(basename(dir))) {
            return null;
          }

          const reposAtDir: GitRepoInfo[] = [];
          const subdirs: string[] = [];

          // Check if this directory is a git repo
          if (isGitRepo(dir)) {
            const [branch, remote, tracking] = await Promise.all([
              getCurrentBranch(dir),
              hasRemote(dir),
              getAheadBehind(dir),
            ]);

            reposAtDir.push({
              path: relative(workspaceCwd, dir) || '.',
              name: basename(dir),
              branch,
              hasRemote: remote,
              ...tracking,
            });
          }

          // Read entries to find subdirectories for the next level.
          // Skip at maxDepth — those children would never be visited.
          if (depth < maxDepth) {
            try {
              const entries = await readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                if (
                  entry.isDirectory() &&
                  !entry.name.startsWith('.') &&
                  !SKIP_DIRS.has(entry.name)
                ) {
                  subdirs.push(join(dir, entry.name));
                }
              }
            } catch {
              // Permission denied or other FS error — silently skip
            }
          }

          return { reposAtDir, subdirs };
        }),
      );

      // Merge batch results
      for (const result of results) {
        if (result === null) continue;
        depthRepos.push(...result.reposAtDir);
        nextLevelCandidates.push(...result.subdirs);
      }
    }

    // Notify caller with per-depth results (unsorted)
    // Pass a shallow copy to prevent the callback from mutating the
    // array that is also spread into allRepos below.
    if (depthRepos.length > 0 && onDepthComplete) {
      onDepthComplete([...depthRepos], depth);
    }

    allRepos.push(...depthRepos);
    currentLevel = nextLevelCandidates;
    depth++;
  }

  // Sort final result: root repo (path='.') first, then alphabetical
  allRepos.sort((a, b) => {
    if (a.path === '.') return -1;
    if (b.path === '.') return 1;
    return a.path.localeCompare(b.path);
  });

  return allRepos;
}
