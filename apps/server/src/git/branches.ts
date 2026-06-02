import { spawnGit, spawnGitChecked } from './status';
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
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(name)) {
    throw new Error(`Invalid branch name: ${name}`);
  }
  await spawnGit(['checkout', '-b', name], dirPath);
}

export async function checkoutBranch(dirPath: string, name: string): Promise<void> {
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(name)) {
    throw new Error('Invalid branch name');
  }
  await spawnGit(['switch', '--', name], dirPath);
}

export async function renameBranch(
  dirPath: string,
  oldName: string,
  newName: string,
): Promise<void> {
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(oldName)) {
    throw new Error(`Invalid branch name: ${oldName}`);
  }
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(newName)) {
    throw new Error(`Invalid branch name: ${newName}`);
  }
  await spawnGitChecked(['branch', '-m', oldName, newName], dirPath);
}

export async function deleteBranch(
  dirPath: string,
  name: string,
  force?: boolean,
): Promise<void> {
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(name)) {
    throw new Error(`Invalid branch name: ${name}`);
  }
  await spawnGitChecked(['branch', force ? '-D' : '-d', name], dirPath);
}

export async function deleteRemoteBranch(
  dirPath: string,
  remote: string,
  branch: string,
): Promise<void> {
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(remote)) {
    throw new Error(`Invalid name: ${remote}`);
  }
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }
  await spawnGitChecked(['push', remote, '--delete', branch], dirPath);
}

export async function publishBranch(
  dirPath: string,
  remote?: string,
): Promise<void> {
  if (remote !== undefined && !/^[a-zA-Z0-9._-]+$/.test(remote)) {
    throw new Error(`Invalid remote name: ${remote}`);
  }
  await spawnGitChecked(['push', '-u', remote ?? 'origin', 'HEAD'], dirPath);
}

export async function listRemoteBranches(
  dirPath: string,
): Promise<{ branches: GitBranch[]; current: string | null }> {
  const output = await spawnGit(['branch', '-r', '--no-color'], dirPath);

  const branches: GitBranch[] = [];

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const name = line.trim();
    if (name.includes('->')) continue;
    branches.push({ name, isCurrent: false, isRemote: true });
  }

  return { branches, current: null };
}

export async function createBranchFrom(
  dirPath: string,
  name: string,
  startPoint: string,
): Promise<void> {
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(name)) {
    throw new Error(`Invalid branch name: ${name}`);
  }
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(startPoint)) {
    throw new Error(`Invalid start point: ${startPoint}`);
  }
  await spawnGitChecked(['checkout', '-b', name, startPoint], dirPath);
}
