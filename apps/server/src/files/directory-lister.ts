import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AutocompleteDirectoryEntry } from '@ymir/shared';

const MAX_ENTRIES = 256;

export async function listDirectories(dirPath: string): Promise<AutocompleteDirectoryEntry[]> {
  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      console.error(`[directory-lister] Unexpected error reading ${dirPath}:`, err);
    }
    return [];
  }

  let directories: AutocompleteDirectoryEntry[] = [];

  for (const entry of entries) {
    try {
      const entryStat = await stat(join(dirPath, entry));
      if (entryStat.isDirectory()) {
        directories.push({ name: entry });
      }
    } catch {
      continue;
    }
  }

  directories.sort((a, b) => a.name.localeCompare(b.name));

  if (directories.length > MAX_ENTRIES) {
    directories = directories.slice(0, MAX_ENTRIES);
  }

  return directories;
}
