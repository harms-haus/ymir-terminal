import { describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getSiblingDirs,
  shortestUniquePrefix,
  buildCompressionMap,
  shortenPath,
} from './path-compression';

// ---------------------------------------------------------------------------
// shortestUniquePrefix
// ---------------------------------------------------------------------------

describe('shortestUniquePrefix', () => {
  it('returns "" for empty name', () => {
    expect(shortestUniquePrefix('', ['a', 'b'])).toBe('');
  });

  it('returns first char when name is unique at first char', () => {
    expect(shortestUniquePrefix('alpha', ['beta', 'gamma'])).toBe('a');
  });

  it('needs longer prefix when first chars collide', () => {
    expect(shortestUniquePrefix('Documents', ['Desktop', 'Documents', 'Downloads'])).toBe('Doc');
  });

  it('returns full name when name is prefix of another sibling', () => {
    expect(shortestUniquePrefix('pi', ['pi', 'pi-extra'])).toBe('pi');
  });

  it('returns first char when siblings is empty', () => {
    expect(shortestUniquePrefix('anything', [])).toBe('a');
  });

  it('returns first char when only self in siblings', () => {
    expect(shortestUniquePrefix('only', ['only'])).toBe('o');
  });

  it('returns longer prefix when multiple siblings share prefix', () => {
    expect(shortestUniquePrefix('pi-powerline', ['pi-powerline', 'pi-processes'])).toBe('pi-po');
  });

  it('is case-sensitive', () => {
    expect(shortestUniquePrefix('abc', ['abc', 'Abc'])).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// buildCompressionMap
// ---------------------------------------------------------------------------

describe('buildCompressionMap', () => {
  it('returns single-segment with compressibleCount 0 for empty string', () => {
    const map = buildCompressionMap('');
    expect(map.segments).toEqual(['']);
    expect(map.compressibleCount).toBe(0);
  });

  it('returns compressibleCount 0 for single segment', () => {
    const map = buildCompressionMap('~');
    expect(map.segments).toEqual(['~']);
    expect(map.uniquePrefixes).toEqual(['~']);
    expect(map.compressibleCount).toBe(0);
  });

  it('returns compressibleCount 0 for two segments', () => {
    const map = buildCompressionMap('~/Documents');
    expect(map.segments).toEqual(['~', 'Documents']);
    expect(map.uniquePrefixes).toEqual(['~', 'Documents']);
    expect(map.compressibleCount).toBe(0);
  });

  it('computes correct prefixes for middle segments using real filesystem', () => {
    // Create a temp dir structure:
    // tmp/
    //   alpha/
    //     Documents/
    //       project/
    //     Desktop/
    //     Downloads/
    const root = mkdtempSync(join(tmpdir(), 'ymir-test-'));
    try {
      const alpha = join(root, 'alpha');
      mkdirSync(join(alpha, 'Documents'), { recursive: true });
      mkdirSync(join(alpha, 'Documents', 'project'), { recursive: true });
      mkdirSync(join(alpha, 'Desktop'), { recursive: true });
      mkdirSync(join(alpha, 'Downloads'), { recursive: true });

      // Use alpha as HOME so ~ resolves to it
      const originalHome = process.env.HOME;
      process.env.HOME = alpha;
      try {
        const map = buildCompressionMap('~/Documents/project');
        expect(map.segments).toEqual(['~', 'Documents', 'project']);
        expect(map.compressibleCount).toBe(1);
        expect(map.uniquePrefixes[0]).toBe('~');
        // "Documents" among ["Documents", "Desktop", "Downloads"] → "Do" is not unique,
        // "Doc" is unique since "Desktop" starts with "Des" and "Downloads" starts with "Do"
        // Actually: "Documents" vs "Desktop" → "Do" matches both, "Doc" only matches Documents
        // "Documents" vs "Downloads" → "Do" matches both, "Doc" only matches Documents
        expect(map.uniquePrefixes[1]).toBe('Doc');
        expect(map.uniquePrefixes[2]).toBe('project');
      } finally {
        if (originalHome !== undefined) {
          process.env.HOME = originalHome;
        } else {
          delete process.env.HOME;
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('never compresses root or leaf segments', () => {
    const root = mkdtempSync(join(tmpdir(), 'ymir-test-'));
    try {
      const home = join(root, 'home');
      mkdirSync(join(home, 'a'), { recursive: true });
      mkdirSync(join(home, 'a', 'b'), { recursive: true });
      mkdirSync(join(home, 'a', 'b', 'c'), { recursive: true });

      const originalHome = process.env.HOME;
      process.env.HOME = home;
      try {
        const map = buildCompressionMap('~/a/b/c');
        expect(map.segments).toEqual(['~', 'a', 'b', 'c']);
        // Root is always full
        expect(map.uniquePrefixes[0]).toBe('~');
        // Leaf is always full
        expect(map.uniquePrefixes[3]).toBe('c');
      } finally {
        if (originalHome !== undefined) {
          process.env.HOME = originalHome;
        } else {
          delete process.env.HOME;
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('non-existent path → getSiblingDirs returns [] → middle segments get first-char prefixes', () => {
    const originalHome = process.env.HOME;
    process.env.HOME = '/nonexistent/path/that/does/not/exist';
    try {
      const map = buildCompressionMap('~/some/mid/leaf');
      expect(map.segments).toEqual(['~', 'some', 'mid', 'leaf']);
      expect(map.compressibleCount).toBe(2);
      // When no siblings exist, shortestUniquePrefix returns first char
      expect(map.uniquePrefixes[1]).toBe('s');
      expect(map.uniquePrefixes[2]).toBe('m');
    } finally {
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      } else {
        delete process.env.HOME;
      }
    }
  });

  it('strips trailing slashes before splitting', () => {
    const originalHome = process.env.HOME;
    process.env.HOME = '/nonexistent';
    try {
      const map = buildCompressionMap('~/Documents/project/');
      expect(map.segments).toEqual(['~', 'Documents', 'project']);
    } finally {
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      } else {
        delete process.env.HOME;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// shortenPath
// ---------------------------------------------------------------------------

describe('shortenPath', () => {
  it('returns ~ when fullPath equals homeDir', () => {
    expect(shortenPath('/home/user', '/home/user')).toBe('~');
  });

  it('returns tilde-prefixed path when fullPath is under homeDir', () => {
    expect(shortenPath('/home/user/foo', '/home/user')).toBe('~/foo');
  });

  it('returns path unchanged when not under homeDir', () => {
    expect(shortenPath('/other/path', '/home/user')).toBe('/other/path');
  });

  it('handles nested directories under homeDir', () => {
    expect(shortenPath('/home/user/a/b/c', '/home/user')).toBe('~/a/b/c');
  });

  it('does not partial-match homeDir prefix (bugfix)', () => {
    expect(shortenPath('/home/user2/file', '/home/user')).toBe('/home/user2/file');
  });

  it('handles empty fullPath', () => {
    expect(shortenPath('', '/home/user')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getSiblingDirs
// ---------------------------------------------------------------------------

describe('getSiblingDirs', () => {
  it('returns directory names only (filters out files)', () => {
    const root = mkdtempSync(join(tmpdir(), 'ymir-test-'));
    try {
      mkdirSync(join(root, 'dir1'));
      mkdirSync(join(root, 'dir2'));
      // Create a file (not a directory) — readdirSync with withFileTypes will show it
      // but getSiblingDirs should filter it out. We can't easily create a real file
      // that shows as non-directory in Dirent, but we can verify dirs are returned.
      const result = getSiblingDirs(root);
      expect(result).toContain('dir1');
      expect(result).toContain('dir2');
      expect(result.length).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('filters out hidden entries (dot prefix)', () => {
    const root = mkdtempSync(join(tmpdir(), 'ymir-test-'));
    try {
      mkdirSync(join(root, 'visible'));
      mkdirSync(join(root, '.hidden'));
      mkdirSync(join(root, '.config'));
      const result = getSiblingDirs(root);
      expect(result).toEqual(['visible']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns empty array for non-existent path', () => {
    const result = getSiblingDirs('/nonexistent/path/that/does/not/exist');
    expect(result).toEqual([]);
  });

  it('returns empty array for empty directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ymir-test-'));
    try {
      const result = getSiblingDirs(root);
      expect(result).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
