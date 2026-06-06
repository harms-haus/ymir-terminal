/**
 * Server-side path compression utilities.
 *
 * Computes shortest unique prefixes for path segments by reading sibling
 * directories from the filesystem, enabling compact CWD display in the
 * workspace panel.
 */

import { readdirSync, type Dirent } from 'node:fs';
import type { CwdCompression } from '@ymir/shared';

// ---------------------------------------------------------------------------
// getSiblingDirs
// ---------------------------------------------------------------------------

/**
 * Read sibling directories of `parentAbsPath`.
 *
 * Returns names of non-hidden directories only. On any filesystem error
 * (ENOENT, EACCES, etc.) returns an empty array for graceful degradation.
 */
export function getSiblingDirs(parentAbsPath: string): string[] {
  try {
    const entries: Dirent[] = readdirSync(parentAbsPath, { withFileTypes: true });
    const result: string[] = [];
    for (const d of entries) {
      if (d.isDirectory() && !d.name.startsWith('.')) {
        result.push(d.name);
      }
    }
    return result;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// shortestUniquePrefix
// ---------------------------------------------------------------------------

/**
 * Find the shortest prefix of `name` that is NOT a prefix of any other
 * sibling (excluding `name` itself).  Case-sensitive.
 */
export function shortestUniquePrefix(name: string, siblings: string[]): string {
  if (!name) return '';
  if (siblings.length === 0) return name.slice(0, 1);

  for (let len = 1; len <= name.length; len++) {
    const prefix = name.slice(0, len);
    if (!siblings.some((s) => s !== name && s.startsWith(prefix))) {
      return prefix;
    }
  }
  return name;
}

// ---------------------------------------------------------------------------
// buildCompressionMap
// ---------------------------------------------------------------------------

/**
 * Build a {@link CwdCompression} map for a shortened (tilde-relative) path.
 *
 * Middle segments are compressed to their shortest unique prefix by reading
 * actual sibling directories from the filesystem.  The root (`~` / `/`) and
 * leaf segments are always kept in full.
 */
export function buildCompressionMap(shortenedPath: string): CwdCompression {
  const normalized = shortenedPath.replace(/\/+$/, '');
  const segments = normalized.split('/');
  const uniquePrefixes: string[] = new Array(segments.length).fill('');
  const home = process.env.HOME || '';

  const compressibleCount = segments.length <= 2 ? 0 : segments.length - 2;

  // Index 0 (root / ~) is never compressed
  uniquePrefixes[0] = segments[0] ?? '';

  // Compressible segments: index 1 through segments.length - 2
  for (let i = 1; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (seg === undefined) continue;

    // Reconstruct absolute parent path
    const parentParts = segments.slice(0, i);
    const parentPath = parentParts.map((s) => (s === '~' ? home : s)).join('/') || '/';
    const siblings = getSiblingDirs(parentPath);
    uniquePrefixes[i] = shortestUniquePrefix(seg, siblings);
  }

  // Last segment is never compressed
  if (segments.length > 1) {
    uniquePrefixes[segments.length - 1] = segments[segments.length - 1] ?? '';
  }

  return { segments, uniquePrefixes, compressibleCount };
}

// ---------------------------------------------------------------------------
// shortenPath
// ---------------------------------------------------------------------------

/**
 * Replace an absolute `fullPath` with a tilde-relative form when it falls
 * under `homeDir`.
 */
export function shortenPath(fullPath: string, homeDir: string): string {
  if (fullPath === homeDir) return '~';
  if (fullPath.startsWith(homeDir + '/')) return '~' + fullPath.slice(homeDir.length);
  return fullPath;
}
