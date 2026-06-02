import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { GitWorktreeInfo } from '@ymir/shared';
import { spawnGit } from './status';

/**
 * Parse the output of `git worktree list --porcelain` into structured records.
 */
export function parseWorktreeList(output: string): GitWorktreeInfo[] {
  if (!output || !output.trim()) return [];

  const records = output.split('\n\n').filter((r) => r.trim().length > 0);
  const result: GitWorktreeInfo[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const lines = record.split('\n').filter((l) => l.length > 0);

    let worktreePath = '';
    let branch: string | null = null;
    let isDetached = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktreePath = line.slice('worktree '.length);
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length);
        if (ref.startsWith('refs/heads/')) {
          branch = ref.slice('refs/heads/'.length);
        } else {
          branch = ref;
        }
      } else if (line === 'detached') {
        isDetached = true;
      }
    }

    if (isDetached) {
      branch = null;
    }

    result.push({
      path: worktreePath,
      branch,
      isMain: i === 0,
      isDetached,
    });
  }

  return result;
}

/**
 * List all worktrees for the repository at `dirPath`.
 * Returns an empty array on failure.
 */
export async function listWorktrees(dirPath: string): Promise<GitWorktreeInfo[]> {
  const output = await spawnGit(['worktree', 'list', '--porcelain'], dirPath);
  return parseWorktreeList(output);
}

/**
 * Create a new worktree with the given branch name.
 * The worktree directory is created as a sibling of `dirPath`.
 */
export async function createWorktree(
  dirPath: string,
  branchName: string,
  startRef?: string,
): Promise<GitWorktreeInfo> {
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(branchName)) {
    throw new Error(`Invalid branch name: ${branchName}`);
  }
  if (branchName.includes('..')) {
    throw new Error(`Invalid branch name: ${branchName}`);
  }

  const worktreePath = join(dirPath, '.git', 'worktrees', branchName);
  const resolvedWorktree = resolve(worktreePath);
  const workspaceResolved = resolve(dirPath);
  if (!resolvedWorktree.startsWith(workspaceResolved + sep)) {
    throw new Error(`Worktree path escapes parent directory: ${worktreePath}`);
  }

  const args = ['worktree', 'add', worktreePath, '-b', branchName];
  if (startRef) {
    if (!/^[a-zA-Z0-9\/. _-]+$/.test(startRef) || startRef.includes('..')) {
      throw new Error(`Invalid start reference: ${startRef}`);
    }
    args.push(startRef);
  }

  const proc = Bun.spawn(['git', ...args], {
    cwd: dirPath,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(' ')} failed (exit ${proc.exitCode}): ${stderr.trim()}`);
  }

  const worktrees = await listWorktrees(dirPath);
  const created = worktrees.find((w) => w.path === worktreePath);
  if (!created) {
    throw new Error(`Worktree was created but not found in worktree list: ${worktreePath}`);
  }
  return created;
}

/**
 * Remove an existing worktree at the given absolute path.
 */
export async function removeWorktree(
  dirPath: string,
  worktreePath: string,
  force?: boolean,
): Promise<void> {
  if (!worktreePath.startsWith('/')) {
    throw new Error(`Worktree path must be an absolute path: ${worktreePath}`);
  }

  const resolved = resolve(worktreePath);
  const worktrees = await listWorktrees(dirPath);
  const match = worktrees.find((w) => resolve(w.path) === resolved);
  if (!match) {
    throw new Error(`Path is not a worktree of this repository: ${worktreePath}`);
  }

  const args = ['worktree', 'remove'];
  if (force) {
    args.push('--force');
  }
  args.push(worktreePath);

  const proc = Bun.spawn(['git', ...args], {
    cwd: dirPath,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(' ')} failed (exit ${proc.exitCode}): ${stderr.trim()}`);
  }
}

/**
 * Helper to run a git command and return its exit code and stderr.
 */
async function gitRaw(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

/**
 * Merge a worktree's branch into a target branch in the main worktree.
 * Optionally removes the worktree after a successful merge.
 */
export async function mergeWorktree(
  dirPath: string,
  worktreePath: string,
  options?: { targetBranch?: string; deleteAfterMerge?: boolean },
): Promise<{ success: boolean; message: string; worktreeRemoved: boolean }> {
  const resolved = resolve(worktreePath);

  // 1. Find the worktree's branch name
  const worktrees = await listWorktrees(dirPath);
  const match = worktrees.find((w) => resolve(w.path) === resolved);
  if (!match) {
    throw new Error(`Path is not a worktree of this repository: ${worktreePath}`);
  }
  if (!match.branch) {
    return {
      success: false,
      message: 'Worktree is in a detached HEAD state and cannot be merged',
      worktreeRemoved: false,
    };
  }
  const worktreeBranch = match.branch;

  // 2. Determine target branch
  let targetBranch: string;
  if (options?.targetBranch) {
    targetBranch = options.targetBranch;
  } else {
    // Detect main/master
    const detectResult = await gitRaw(['symbolic-ref', 'refs/heads/main'], dirPath);
    if (detectResult.exitCode === 0) {
      targetBranch = 'main';
    } else {
      const detectMaster = await gitRaw(['symbolic-ref', 'refs/heads/master'], dirPath);
      targetBranch = detectMaster.exitCode === 0 ? 'master' : 'main';
    }
  }

  // 2b. Validate target branch
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(targetBranch) || targetBranch.includes('..')) {
    throw new Error(`Invalid target branch: ${targetBranch}`);
  }

  // 3. Check if main worktree is clean
  const statusOutput = await spawnGit(['status', '--porcelain'], dirPath);
  if (statusOutput.trim().length > 0) {
    return {
      success: false,
      message: 'Main worktree has uncommitted changes. Please commit or stash them first.',
      worktreeRemoved: false,
    };
  }

  // 4. Checkout target branch
  const checkoutResult = await gitRaw(['checkout', '--', targetBranch], dirPath);
  if (checkoutResult.exitCode !== 0) {
    return {
      success: false,
      message: `Failed to checkout ${targetBranch}: ${checkoutResult.stderr.trim()}`,
      worktreeRemoved: false,
    };
  }

  // 5. Merge the worktree branch
  const mergeResult = await gitRaw(['merge', '--', worktreeBranch], dirPath);
  if (mergeResult.exitCode !== 0) {
    return {
      success: false,
      message: `Merge conflict: ${mergeResult.stderr.trim() || mergeResult.stdout.trim()}`,
      worktreeRemoved: false,
    };
  }

  // 6. Remove worktree if requested
  if (options?.deleteAfterMerge) {
    try {
      await removeWorktree(dirPath, worktreePath, true);
      return {
        success: true,
        message: 'Merged and removed worktree',
        worktreeRemoved: true,
      };
    } catch (err) {
      return {
        success: true,
        message: `Merged successfully but failed to remove worktree: ${err instanceof Error ? err.message : String(err)}`,
        worktreeRemoved: false,
      };
    }
  }

  return {
    success: true,
    message: 'Merged successfully',
    worktreeRemoved: false,
  };
}

/**
 * List untracked files in the given directory (respecting .gitignore).
 * Excludes `.worktreecopy` from the result.
 */
export async function listUntrackedFiles(dirPath: string): Promise<string[]> {
  const proc = Bun.spawn(['git', 'ls-files', '--others', '--exclude-standard'], {
    cwd: dirPath,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(
      `git ls-files --others --exclude-standard failed (exit ${proc.exitCode}): ${stderr.trim()}`,
    );
  }
  const stdout = await new Response(proc.stdout).text();
  return stdout.split('\n').filter((line) => line.length > 0 && line !== '.worktreecopy');
}

/**
 * Read the `.worktreecopy` config file from the given directory.
 * Returns an empty array if the file does not exist.
 */
export async function readWorktreeCopyConfig(dirPath: string): Promise<string[]> {
  try {
    const content = await readFile(join(dirPath, '.worktreecopy'), 'utf-8');
    return content.split('\n').filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Write the `.worktreecopy` config file to the given directory.
 */
export async function writeWorktreeCopyConfig(dirPath: string, files: string[]): Promise<void> {
  await writeFile(join(dirPath, '.worktreecopy'), files.join('\n'));
}
