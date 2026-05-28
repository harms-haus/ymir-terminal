import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileNode } from '@ymir/shared';

export interface ScanOptions {
  maxDepth?: number; // default 10
  includeHidden?: boolean; // default false
  excludeDirs?: string[]; // default ['node_modules', '.git']
}

export async function scanDirectory(dirPath: string, options: ScanOptions = {}): Promise<FileNode[]> {
  const maxDepth = options.maxDepth ?? 10;
  const includeHidden = options.includeHidden ?? false;
  const excludeDirs = options.excludeDirs ?? ['node_modules', '.git'];

  return scan(dirPath, maxDepth, includeHidden, excludeDirs, 0);
}

async function scan(
  dirPath: string,
  maxDepth: number,
  includeHidden: boolean,
  excludeDirs: string[],
  currentDepth: number,
): Promise<FileNode[]> {
  let entries;
  try {
    entries = await readdir(dirPath);
  } catch {
    return [];
  }

  const nodes: FileNode[] = [];

  for (const entry of entries) {
    // Skip hidden files/dirs unless includeHidden
    if (!includeHidden && entry.startsWith('.')) {
      continue;
    }

    const fullPath = join(dirPath, entry);
    let entryStat;
    try {
      entryStat = await stat(fullPath);
    } catch {
      continue;
    }

    const isDirectory = entryStat.isDirectory();

    if (isDirectory && excludeDirs.includes(entry)) {
      continue;
    }

    const node: FileNode = {
      name: entry,
      path: fullPath,
      isDirectory,
    };

    if (isDirectory && currentDepth < maxDepth) {
      node.children = await scan(fullPath, maxDepth, includeHidden, excludeDirs, currentDepth + 1);
    }

    nodes.push(node);
  }

  // Sort: directories first, then files, alphabetically within each group
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}
