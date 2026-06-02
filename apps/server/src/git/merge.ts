import { spawnGit, spawnGitChecked } from './status';

const BRANCH_NAME_RE = /^[a-zA-Z0-9\/. _-]+$/;

function validateBranchName(branch: string): void {
  if (!BRANCH_NAME_RE.test(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }
}

export async function mergeBranch(dirPath: string, branch: string): Promise<string> {
  validateBranchName(branch);
  return await spawnGitChecked(['merge', branch], dirPath);
}

export async function rebaseBranch(dirPath: string, branch: string): Promise<string> {
  validateBranchName(branch);
  return await spawnGitChecked(['rebase', branch], dirPath);
}

export async function rebaseAbort(dirPath: string): Promise<void> {
  await spawnGitChecked(['rebase', '--abort'], dirPath);
}

export async function isRebaseInProgress(dirPath: string): Promise<boolean> {
  const output = await spawnGit(['rev-parse', '--verify', 'REBASE_HEAD'], dirPath);
  return output.trim().length > 0;
}
