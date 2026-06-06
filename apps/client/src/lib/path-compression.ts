import type { CwdCompression } from '@ymir/shared';

/**
 * Apply progressive path compression using server-provided compression data.
 *
 * Compression is applied left-to-right: level 1 compresses the leftmost
 * compressible segment, level 2 compresses the two leftmost, etc.
 * The root segment (index 0) and last segment (most-specific directory)
 * are always preserved whole.
 *
 * @param compression - Server-provided compression metadata
 * @param levels - Number of levels to compress (0 = no compression)
 * @returns The path with the specified compression level applied
 */
export function compressPath(compression: CwdCompression, levels: number): string {
  const { segments, uniquePrefixes, compressibleCount } = compression;

  // Nothing compressible → return original
  if (compressibleCount === 0) {
    return segments.join('/');
  }

  // Clamp levels to [0, compressibleCount]
  const clamped = Math.max(0, Math.min(levels, compressibleCount));

  const result = segments.map((seg, i) => {
    // Compressible range: indices 1 through 1 + compressibleCount (exclusive).
    // Within that range, compress the first `clamped` segments.
    if (i >= 1 && i < 1 + clamped) {
      return uniquePrefixes[i];
    }
    return seg;
  });

  return result.join('/');
}

/**
 * Find the lowest compression level that fits within a maximum display width.
 *
 * Tries levels from 0 upward and returns the first path whose measured
 * width is ≤ maxWidth. If nothing fits, returns the max-compressed path
 * as a best effort.
 *
 * @param compression - Server-provided compression metadata
 * @param maxWidth - Maximum allowed display width
 * @param measureText - Function that returns the width of a string
 * @returns The compressed path that fits (or the most compressed variant)
 */
export function compressPathToWidth(
  compression: CwdCompression,
  maxWidth: number,
  measureText: (text: string) => number,
): string {
  const { compressibleCount } = compression;

  // Nothing compressible → return original immediately
  if (compressibleCount === 0) {
    return compression.segments.join('/');
  }

  // Try each level from 0 upward; return the first that fits
  let lastCandidate = '';
  for (let level = 0; level <= compressibleCount; level++) {
    lastCandidate = compressPath(compression, level);
    if (measureText(lastCandidate) <= maxWidth) {
      return lastCandidate;
    }
  }

  // No level fit → return max-compressed path as best effort
  return lastCandidate;
}
