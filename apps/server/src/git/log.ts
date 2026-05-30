import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { GitLogItem } from '@ymir/shared';

const execFileAsync = promisify(execFile);

/**
 * Fetches a paginated page of git commit history from a repository.
 * Uses `git log --pretty=format` with NUL-delimited fields for safe parsing.
 *
 * @param dirPath - Absolute path to the git repository
 * @param skip - Number of commits to skip (clamped to ≥ 0 by caller)
 * @param limit - Maximum number of commits to return (clamped to [1, 100] by caller)
 * @returns Array of git log items, or empty array on error/not-a-repo
 */
export async function getGitLog(dirPath: string, skip: number, limit: number): Promise<GitLogItem[]> {
  if (!existsSync(join(dirPath, '.git'))) return [];

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--topo-order', `--pretty=format:%H%x00%P%x00%an%x00%at%x00%s`, `--skip=${skip}`, `-n`, `${limit}`],
      { cwd: dirPath, maxBuffer: 10 * 1024 * 1024 },
    );

    return stdout
      .split('\n')
      .filter((l) => l.length > 0)
      .map((line) => {
        const fields = line.split('\x00');
        return {
          id: fields[0],
          parents: fields[1] ? fields[1].split(' ').filter(Boolean) : [],
          author: fields[2] || '',
          date: Number(fields[3]) || 0,
          message: fields[4] || '',
        } satisfies GitLogItem;
      });
  } catch {
    return [];
  }
}
