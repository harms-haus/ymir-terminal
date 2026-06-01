import { spawnGit } from './status';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface DiffDataResult {
  originalContent: string;
  modifiedContent: string;
  additions: number;
  deletions: number;
}

async function gitShow(ref: string, repoDir: string): Promise<string> {
  return spawnGit(['show', ref], repoDir);
}

const MAX_DIFF_CONTENT_SIZE = 2 * 1024 * 1024; // 2 MB per side

export async function getDiffData(
  repoDir: string,
  filePath: string,
  staged: boolean,
): Promise<DiffDataResult> {
  // --- Parallel fetch of original, modified, and stats ---
  const originalRef = staged ? 'HEAD:' + filePath : ':' + filePath;
  const modifiedTask = staged
    ? gitShow(':' + filePath, repoDir)
    : readFile(join(repoDir, filePath), 'utf-8').catch(() => '');
  const numstatArgs = staged
    ? ['diff', '--numstat', '--cached', '--', filePath]
    : ['diff', '--numstat', '--', filePath];

  const [originalContent, modifiedContent, numstatOutput] = await Promise.all([
    gitShow(originalRef, repoDir),
    modifiedTask,
    spawnGit(numstatArgs, repoDir),
  ]);

  // --- Size guard ---
  const totalSize = originalContent.length + modifiedContent.length;
  if (totalSize > MAX_DIFF_CONTENT_SIZE) {
    return {
      originalContent: '',
      modifiedContent: '',
      additions: 0,
      deletions: 0,
    };
  }

  // --- Parse stats ---
  let additions = 0;
  let deletions = 0;

  const trimmed = numstatOutput.trim();
  if (trimmed) {
    const parts = trimmed.split('\t');
    if (parts.length >= 2 && parts[0] !== '-' && parts[1] !== '-') {
      additions = parseInt(parts[0], 10) || 0;
      deletions = parseInt(parts[1], 10) || 0;
    } else if (parts.length >= 2 && parts[0] === '-' && parts[1] === '-') {
      // Binary file — leave at 0
    }
    // Any other parse failure: leave at 0
  } else {
    // No output (e.g. untracked file) — estimate from modified content
    if (modifiedContent) {
      additions = modifiedContent.split('\n').length;
      if (modifiedContent.endsWith('\n')) {
        additions -= 1;
      }
    }
  }

  return { originalContent, modifiedContent, additions, deletions };
}

export async function getCommitFileDiff(
  repoDir: string,
  commitSha: string,
  parentSha: string,
  filePath: string,
): Promise<DiffDataResult> {
  // --- Fetch original and modified content ---
  let originalContent: string;
  let modifiedContent: string;

  if (parentSha === '') {
    // Root commit with no parent
    originalContent = '';
    modifiedContent = await gitShow(commitSha + ':' + filePath, repoDir).catch(() => '');
  } else {
    [originalContent, modifiedContent] = await Promise.all([
      gitShow(parentSha + ':' + filePath, repoDir).catch(() => ''),
      gitShow(commitSha + ':' + filePath, repoDir).catch(() => ''),
    ]);
  }

  // --- Fetch numstat ---
  const numstatArgs =
    parentSha === ''
      ? ['diff', '--numstat', '--root', commitSha, '--', filePath]
      : ['diff', '--numstat', parentSha, commitSha, '--', filePath];
  const numstatOutput = await spawnGit(numstatArgs, repoDir);

  // --- Size guard ---
  const totalSize = originalContent.length + modifiedContent.length;
  if (totalSize > MAX_DIFF_CONTENT_SIZE) {
    return {
      originalContent: '',
      modifiedContent: '',
      additions: 0,
      deletions: 0,
    };
  }

  // --- Parse stats ---
  let additions = 0;
  let deletions = 0;

  const trimmed = numstatOutput.trim();
  if (trimmed) {
    const parts = trimmed.split('\t');
    if (parts.length >= 2 && parts[0] !== '-' && parts[1] !== '-') {
      additions = parseInt(parts[0], 10) || 0;
      deletions = parseInt(parts[1], 10) || 0;
    }
    // Binary file or parse failure: leave at 0
  } else {
    // No output (e.g. new file in root commit) — estimate from modified content
    if (modifiedContent) {
      additions = modifiedContent.split('\n').length - 1;
    }
  }

  return { originalContent, modifiedContent, additions, deletions };
}
