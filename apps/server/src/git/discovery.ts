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

export async function discoverRepos(workspaceCwd: string, maxDepth = 5): Promise<GitRepoInfo[]> {
  const repos: GitRepoInfo[] = [];
  await walkDir(workspaceCwd, workspaceCwd, 0, maxDepth, repos);
  repos.sort((a, b) => {
    if (a.path === '.') return -1;
    if (b.path === '.') return 1;
    return a.path.localeCompare(b.path);
  });
  return repos;
}

async function walkDir(
  currentDir: string,
  workspaceCwd: string,
  depth: number,
  maxDepth: number,
  repos: GitRepoInfo[],
): Promise<void> {
  if (depth > maxDepth) return;

  const dirName = basename(currentDir);
  if (depth > 0 && SKIP_DIRS.has(dirName)) return;

  // Check if this directory is a git repo
  if (isGitRepo(currentDir)) {
    const [branch, remote, tracking] = await Promise.all([
      getCurrentBranch(currentDir),
      hasRemote(currentDir),
      getAheadBehind(currentDir),
    ]);

    repos.push({
      path: relative(workspaceCwd, currentDir) || '.',
      name: basename(currentDir),
      branch,
      hasRemote: remote,
      ...tracking,
    });


  }

  // Recurse into subdirectories
  try {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const subdirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => join(currentDir, e.name));

    const BATCH_SIZE = 10;
    for (let i = 0; i < subdirs.length; i += BATCH_SIZE) {
      const batch = subdirs.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((dir) => walkDir(dir, workspaceCwd, depth + 1, maxDepth, repos)));
    }
  } catch {
    // Permission denied or other FS error
  }
}
