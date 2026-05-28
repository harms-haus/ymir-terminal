import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface GitFileChange {
  path: string;
  status: string;
}

export interface GitStatusResult {
  branch: string;
  changes: GitFileChange[];
  staged: GitFileChange[];
}

export function isGitRepo(dirPath: string): boolean {
  return existsSync(join(dirPath, '.git'));
}

export function getCurrentBranch(dirPath: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: dirPath, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

export function getGitStatus(dirPath: string): GitStatusResult | null {
  if (!isGitRepo(dirPath)) return null;

  const branch = getCurrentBranch(dirPath) || 'unknown';
  const changes: GitFileChange[] = [];
  const staged: GitFileChange[] = [];

  let output: string;
  try {
    output = execSync('git status --porcelain=v1', { cwd: dirPath, encoding: 'utf-8' });
  } catch {
    return { branch, changes: [], staged: [] };
  }

  const lines = output.split('\n').filter((l) => l.length >= 3);
  for (const line of lines) {
    const stagedStatus = line[0];
    const unstagedStatus = line[1];
    let filePath = line.slice(3);

    // For renames/copies, porcelain shows "old -> new" — extract new name
    const arrowIdx = filePath.indexOf(' -> ');
    if (arrowIdx !== -1) {
      filePath = filePath.slice(arrowIdx + 4);
    }

    // Untracked files: "?? file"
    if (stagedStatus === '?') {
      changes.push({ path: filePath, status: '??' });
      continue;
    }

    if (stagedStatus !== ' ') {
      staged.push({ path: filePath, status: stagedStatus });
    }

    if (unstagedStatus !== ' ') {
      changes.push({ path: filePath, status: unstagedStatus });
    }
  }

  return { branch, changes, staged };
}
