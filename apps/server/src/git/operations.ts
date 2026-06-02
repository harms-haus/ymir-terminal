import { spawnGit, spawnGitChecked } from './status';

export async function stageFiles(dirPath: string, files: string[]): Promise<void> {
  if (!files.length) throw new Error('No files specified');
  await spawnGitChecked(['add', '--', ...files], dirPath);
}

export async function unstageFiles(dirPath: string, files: string[]): Promise<void> {
  if (!files.length) throw new Error('No files specified');
  await spawnGitChecked(['restore', '--staged', '--', ...files], dirPath);
}

export async function discardChanges(dirPath: string, files: string[]): Promise<void> {
  if (!files.length) throw new Error('No files specified');
  await spawnGitChecked(['restore', '--', ...files], dirPath);
}

export async function commitChanges(dirPath: string, message: string): Promise<string> {
  if (!message.trim()) throw new Error('Commit message cannot be empty');
  if (message.length > 10000) throw new Error('Commit message exceeds maximum length of 10000 characters');
  await spawnGitChecked(['commit', '-m', message], dirPath);
  const hash = await spawnGit(['rev-parse', 'HEAD'], dirPath);
  return hash.trim();
}

export async function stageAllFiles(dirPath: string): Promise<void> {
  await spawnGitChecked(['add', '-A'], dirPath);
}

export async function unstageAllFiles(dirPath: string): Promise<void> {
  await spawnGitChecked(['reset', 'HEAD'], dirPath);
}

export async function discardAllChanges(dirPath: string): Promise<void> {
  await spawnGitChecked(['restore', '.'], dirPath);
}

export async function commitAmend(
  dirPath: string,
  options?: { message?: string; noEdit?: boolean },
): Promise<string> {
  const args = ['commit', '--amend'];
  if (options?.noEdit) {
    args.push('--no-edit');
  } else if (options?.message) {
    args.push('-m', options.message);
  } else {
    args.push('--no-edit');
  }
  await spawnGitChecked(args, dirPath);
  const hash = await spawnGit(['rev-parse', 'HEAD'], dirPath);
  return hash.trim();
}

export async function commitAll(
  dirPath: string,
  message: string,
  options?: { includeUntracked?: boolean; amend?: boolean },
): Promise<string> {
  if (message.length > 10000) throw new Error('Commit message exceeds maximum length of 10000 characters');
  if (options?.includeUntracked) {
    await spawnGitChecked(['add', '-A'], dirPath);
  } else {
    await spawnGitChecked(['add', '-u'], dirPath);
  }
  const args = ['commit'];
  if (options?.amend) args.push('--amend');
  args.push('-m', message);
  await spawnGitChecked(args, dirPath);
  const hash = await spawnGit(['rev-parse', 'HEAD'], dirPath);
  return hash.trim();
}

const REF_PATTERN = /^[0-9a-f]{4,64}$|^(HEAD~?\d*)$|^[a-zA-Z0-9\/. _-]+$/;

export async function resetSoft(dirPath: string, ref?: string): Promise<void> {
  if (ref !== undefined && !REF_PATTERN.test(ref)) {
    throw new Error(`Invalid ref: ${ref}`);
  }
  await spawnGitChecked(['reset', '--soft', ref ?? 'HEAD~1'], dirPath);
}
