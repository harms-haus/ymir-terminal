import { spawnGitChecked } from './status';
import { fetchRemote, pushBranch } from './remote';

export async function pullRemote(dirPath: string, rebase?: boolean): Promise<void> {
  const args = ['pull'];
  if (rebase) args.push('--rebase');
  await spawnGitChecked(args, dirPath);
}

export async function syncRemote(dirPath: string, branch: string): Promise<void> {
  if (!/^[a-zA-Z0-9\/. _-]+$/.test(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }
  await fetchRemote(dirPath);
  await spawnGitChecked(['pull', '--rebase'], dirPath);
  await pushBranch(dirPath, branch);
}
