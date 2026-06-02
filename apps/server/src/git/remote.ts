import { spawnGitChecked } from './status';

export async function pushBranch(dirPath: string, branch: string): Promise<void> {
  try {
    await spawnGitChecked(['push', 'origin', branch], dirPath);
  } catch (error) {
    throw new Error(`Push failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function fetchRemote(dirPath: string): Promise<void> {
  try {
    await spawnGitChecked(['fetch'], dirPath);
  } catch (error) {
    throw new Error(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
