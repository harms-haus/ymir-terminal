import { spawnGit, spawnGitChecked } from './status';
import type { GitStashEntry } from '@ymir/shared';

export async function stashPush(
  dirPath: string,
  options?: { includeUntracked?: boolean; message?: string },
): Promise<string> {
  const args = ['stash', 'push'];
  if (options?.includeUntracked) args.push('-u');
  if (options?.message) args.push('-m', options.message);
  await spawnGitChecked(args, dirPath);
  return 'stash@{0}';
}

export async function stashList(dirPath: string): Promise<GitStashEntry[]> {
  const output = await spawnGit(['stash', 'list'], dirPath);
  const lines = output.split('\n').filter((l) => l.trim().length > 0);

  return lines.map((line) => {
    // Format: stash@{0}: WIP on main: abc1234 commit msg
    const colonIdx = line.indexOf(':');
    const ref = line.slice(0, colonIdx);
    const index = parseInt(ref.match(/\d+/)?.[0] ?? '0', 10);
    const rest = line.slice(colonIdx + 2); // skip ": "

    // rest = "WIP on main: abc1234 commit msg" or "On main: abc1234 commit msg"
    const onIdx = rest.indexOf(': ');
    let branchName: string | null = null;
    let message: string;

    if (onIdx !== -1) {
      const beforeColon = rest.slice(0, onIdx); // "WIP on main" or "On main"
      message = rest.slice(onIdx + 2);
      const branchMatch = beforeColon.match(/(?:WIP )?[Oo]n (.+)/);
      branchName = branchMatch ? branchMatch[1] : null;
    } else {
      message = rest;
    }

    return { index, ref, message, branchName };
  });
}

const STASH_REF_PATTERN = /^stash@\{\d+\}$/;

export async function stashApply(dirPath: string, stashRef?: string): Promise<void> {
  if (stashRef !== undefined && !STASH_REF_PATTERN.test(stashRef)) {
    throw new Error(`Invalid stash ref: ${stashRef}`);
  }
  const args = ['stash', 'apply', ...(stashRef ? [stashRef] : [])];
  await spawnGitChecked(args, dirPath);
}

export async function stashPop(dirPath: string, stashRef?: string): Promise<void> {
  if (stashRef !== undefined && !STASH_REF_PATTERN.test(stashRef)) {
    throw new Error(`Invalid stash ref: ${stashRef}`);
  }
  const args = ['stash', 'pop', ...(stashRef ? [stashRef] : [])];
  await spawnGitChecked(args, dirPath);
}

export async function stashDrop(dirPath: string, stashRef: string): Promise<void> {
  if (!STASH_REF_PATTERN.test(stashRef)) {
    throw new Error(`Invalid stash ref: ${stashRef}`);
  }
  await spawnGitChecked(['stash', 'drop', stashRef], dirPath);
}

export async function stashClear(dirPath: string): Promise<void> {
  await spawnGitChecked(['stash', 'clear'], dirPath);
}
