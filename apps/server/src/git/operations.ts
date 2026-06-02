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
  await spawnGitChecked(['commit', '-m', message], dirPath);
  const hash = await spawnGit(['rev-parse', 'HEAD'], dirPath);
  return hash.trim();
}
