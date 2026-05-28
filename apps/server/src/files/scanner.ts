import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface ScanFileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: ScanFileNode[];
}

export interface ScanOptions {
  maxDepth?: number; // default 10
  includeHidden?: boolean; // default false
  excludeDirs?: string[]; // default ['node_modules', '.git']
}

export function scanDirectory(
  dirPath: string,
  options: ScanOptions = {},
): ScanFileNode[] {
  const maxDepth = options.maxDepth ?? 10;
  const includeHidden = options.includeHidden ?? false;
  const excludeDirs = options.excludeDirs ?? ['node_modules', '.git'];

  return scan(dirPath, maxDepth, includeHidden, excludeDirs, 0);
}

function scan(
  dirPath: string,
  maxDepth: number,
  includeHidden: boolean,
  excludeDirs: string[],
  currentDepth: number,
): ScanFileNode[] {
  let entries;
  try {
    entries = readdirSync(dirPath);
  } catch {
    return [];
  }

  const nodes: ScanFileNode[] = [];

  for (const entry of entries) {
    // Skip hidden files/dirs unless includeHidden
    if (!includeHidden && entry.startsWith('.')) {
      continue;
    }

    const fullPath = join(dirPath, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    const isDirectory = stat.isDirectory();

    if (isDirectory && excludeDirs.includes(entry)) {
      continue;
    }

    const node: ScanFileNode = {
      name: entry,
      path: fullPath,
      isDirectory,
    };

    if (isDirectory && currentDepth < maxDepth) {
      node.children = scan(
        fullPath,
        maxDepth,
        includeHidden,
        excludeDirs,
        currentDepth + 1,
      );
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
