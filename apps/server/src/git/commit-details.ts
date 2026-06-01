import type { GitFileChangeStatus } from '@ymir/shared';
import { spawnGit } from './status';

export interface CommitFileChange {
  filePath: string;
  status: GitFileChangeStatus;
  additions: number;
  deletions: number;
}

export interface CommitDetails {
  body: string;
  files: CommitFileChange[];
}

/**
 * Fetches full commit details: the commit message body and a list of changed files
 * with their status, additions, and deletions.
 *
 * Returns null if the commit SHA is invalid or the directory is not a git repo.
 */
export async function getCommitDetails(
  dirPath: string,
  commitSha: string,
): Promise<CommitDetails | null> {
  try {
    const body = await spawnGit(['show', '-s', '--format=%B', commitSha], dirPath);
    if (!body) return null;
    const trimmedBody = body.trimEnd();

    // Fetch file statuses and numstat in parallel
    const [statusOutput, numstatOutput] = await Promise.all([
      spawnGit(
        ['diff-tree', '--no-commit-id', '-r', '--name-status', '--root', commitSha],
        dirPath,
      ),
      spawnGit(['diff-tree', '--no-commit-id', '--numstat', '-r', '--root', commitSha], dirPath),
    ]);

    // Parse name-status → Map<filePath, status>
    const statusMap = new Map<string, string>();
    const statusLines = statusOutput.split('\n').filter((l) => l.length > 0);
    for (const line of statusLines) {
      const parts = line.split('\t');
      if (parts.length < 2) continue;
      const status = parts[0];
      // For renames/copies the last tab-delimited field is the new path
      const filePath = parts[parts.length - 1];
      statusMap.set(filePath, status);
    }

    // Parse numstat → Map<filePath, {additions, deletions}>
    const numstatMap = new Map<string, { additions: number; deletions: number }>();
    const numstatLines = numstatOutput.split('\n').filter((l) => l.length > 0);
    for (const line of numstatLines) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
      const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
      const filePath = parts[2];
      numstatMap.set(filePath, { additions, deletions });
    }

    // Merge status + numstat into CommitFileChange[]
    const files: CommitFileChange[] = [];
    for (const [filePath, rawStatus] of statusMap) {
      const stats = numstatMap.get(filePath);
      files.push({
        filePath,
        status: rawStatus as GitFileChangeStatus,
        additions: stats?.additions ?? 0,
        deletions: stats?.deletions ?? 0,
      });
    }

    return { body: trimmedBody, files };
  } catch {
    return null;
  }
}
