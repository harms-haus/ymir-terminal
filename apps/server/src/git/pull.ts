import { spawnGitChecked } from './status';
import { fetchRemote, pushBranch } from './remote';

export async function pullRemote(dirPath: string, rebase?: boolean): Promise<void> {
  const args = ['pull'];
  if (rebase) args.push('--rebase');
  await spawnGitChecked(args, dirPath);
}

export async function syncRemote(dirPath: string, branch: string): Promise<void> {
  await fetchRemote(dirPath);
  await spawnGitChecked(['pull', '--rebase'], dirPath);
  await pushBranch(dirPath, branch);
}
