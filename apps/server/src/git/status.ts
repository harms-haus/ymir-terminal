import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { GitFileChange, GitFileChangeStatus, GitStatusResponse } from '@ymir/shared';

export function isGitRepo(dirPath: string): boolean {
  try {
    return statSync(join(dirPath, '.git')).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read stdout from a Bun.spawn process as a string.
 * Returns an empty string on failure.
 */
export async function spawnGit(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  await proc.exited;
  if (proc.exitCode !== 0) return '';
  const text = await new Response(proc.stdout).text();
  return text;
}

export async function getCurrentBranch(dirPath: string): Promise<string | null> {
  const out = await spawnGit(['rev-parse', '--abbrev-ref', 'HEAD'], dirPath);
  return out.trim() || null;
}

export async function getGitStatus(dirPath: string): Promise<GitStatusResponse | null> {
  if (!isGitRepo(dirPath)) return null;

  const [branchResult, statusOutput] = await Promise.all([
    getCurrentBranch(dirPath),
    spawnGit(['status', '--porcelain=v1'], dirPath),
  ]);

  const branch = branchResult || 'unknown';
  const changes: GitFileChange[] = [];
  const staged: GitFileChange[] = [];

  const lines = statusOutput.split('\n').filter((l) => l.length >= 3);
  for (const line of lines) {
    const stagedStatus = line[0];
    const unstagedStatus = line[1];
    let filePath = line.slice(3);

    // For renames/copies, porcelain shows "old -> new" — extract new name
    const arrowIdx = filePath.indexOf(' -> ');
    if (arrowIdx !== -1) {
      filePath = filePath.slice(arrowIdx + 4);
    }

    // Untracked files: "?? file"
    if (stagedStatus === '?') {
      changes.push({ path: filePath, status: '??' });
      continue;
    }

    if (stagedStatus !== ' ') {
      staged.push({ path: filePath, status: stagedStatus as GitFileChangeStatus });
    }

    if (unstagedStatus !== ' ') {
      changes.push({ path: filePath, status: unstagedStatus as GitFileChangeStatus });
    }
  }

  return { branch, changes, staged, hasRemote: false, ahead: 0, behind: 0 };
}

export async function hasRemote(dirPath: string): Promise<boolean> {
  const output = await spawnGit(['remote', '-v'], dirPath);
  return output.trim().length > 0;
}

export async function getAheadBehind(dirPath: string): Promise<{ ahead: number; behind: number }> {
  try {
    const output = await spawnGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], dirPath);
    const parts = output.trim().split(/\s+/);
    return { ahead: parseInt(parts[0], 10) || 0, behind: parseInt(parts[1], 10) || 0 };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

export async function getGitStatusEnhanced(
  dirPath: string,
): Promise<(GitStatusResponse & { hasRemote: boolean; ahead: number; behind: number }) | null> {
  const status = await getGitStatus(dirPath);
  if (!status) return null;
  const [remote, tracking] = await Promise.all([hasRemote(dirPath), getAheadBehind(dirPath)]);
  return { ...status, hasRemote: remote, ...tracking };
}
