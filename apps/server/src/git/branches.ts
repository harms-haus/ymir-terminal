import { spawnGit } from './status';
import type { GitBranch } from '@ymir/shared';

export async function listBranches(
  dirPath: string,
): Promise<{ branches: GitBranch[]; current: string | null }> {
  const output = await spawnGit(['branch', '--no-color', '--list'], dirPath);

  const branches: GitBranch[] = [];
  let current: string | null = null;

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const isCurrent = line.startsWith('*');
    // Default output: "* main" or "  feature-a" — strip leading marker (2 chars)
    const name = line.slice(2).trim();
    const isRemote = name.includes('/');

    branches.push({ name, isCurrent, isRemote });
    if (isCurrent) current = name;
  }

  return { branches, current };
}

export async function createBranch(dirPath: string, name: string): Promise<void> {
  if (!/^[a-zA-Z0-9\/._-]+$/.test(name)) {
    throw new Error(`Invalid branch name: ${name}`);
  }
  await spawnGit(['checkout', '-b', name], dirPath);
}

export async function checkoutBranch(dirPath: string, name: string): Promise<void> {
  await spawnGit(['switch', name], dirPath);
}
