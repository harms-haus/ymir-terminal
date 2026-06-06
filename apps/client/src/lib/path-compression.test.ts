import { describe, test, expect } from 'bun:test';
import { compressPath, compressPathToWidth } from './path-compression';
import type { CwdCompression } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const alphaMap: CwdCompression = {
  segments: ['', 'home', 'user', 'alpha'],
  uniquePrefixes: ['', 'h', 'u', 'alpha'],
  compressibleCount: 2,
};

const tildaMap: CwdCompression = {
  segments: ['~', 'Documents', 'project'],
  uniquePrefixes: ['~', 'Do', 'project'],
  compressibleCount: 1,
};

const noCompressMap: CwdCompression = {
  segments: ['~', 'project'],
  uniquePrefixes: ['~', 'project'],
  compressibleCount: 0,
};

// Mock measureText: fixed 7 px per character
const measureText = (text: string): number => text.length * 7;

// ---------------------------------------------------------------------------
// compressPath
// ---------------------------------------------------------------------------

describe('compressPath', () => {
  describe('alphaMap (segments: ["", "home", "user", "alpha"], compressibleCount: 2)', () => {
    test('level 0 → no compression', () => {
      expect(compressPath(alphaMap, 0)).toBe('/home/user/alpha');
    });

    test('level 1 → first middle segment compressed', () => {
      expect(compressPath(alphaMap, 1)).toBe('/h/user/alpha');
    });

    test('level 2 → all middle segments compressed', () => {
      expect(compressPath(alphaMap, 2)).toBe('/h/u/alpha');
    });
  });

  describe('tildaMap (segments: ["~", "Documents", "project"], compressibleCount: 1)', () => {
    test('level 0 → no compression', () => {
      expect(compressPath(tildaMap, 0)).toBe('~/Documents/project');
    });

    test('level 1 → middle segment compressed', () => {
      expect(compressPath(tildaMap, 1)).toBe('~/Do/project');
    });
  });

  describe('noCompressMap (compressibleCount: 0)', () => {
    test('level 0 → original path', () => {
      expect(compressPath(noCompressMap, 0)).toBe('~/project');
    });

    test('level 5 → still original path', () => {
      expect(compressPath(noCompressMap, 5)).toBe('~/project');
    });
  });

  describe('level clamping', () => {
    test('level exceeds compressibleCount → same as max level', () => {
      expect(compressPath(alphaMap, 999)).toBe('/h/u/alpha');
    });

    test('negative level → treated as 0', () => {
      expect(compressPath(alphaMap, -5)).toBe('/home/user/alpha');
    });
  });
});

// ---------------------------------------------------------------------------
// compressPathToWidth
// ---------------------------------------------------------------------------

describe('compressPathToWidth', () => {
  describe('alphaMap (60 chars uncompressed at 7px/char = 420px)', () => {
    test('large maxWidth → level 0 fits, returns full path', () => {
      const result = compressPathToWidth(alphaMap, 500, measureText);
      expect(result).toBe('/home/user/alpha');
    });

    test('medium maxWidth → progressive compression applied', () => {
      // "/h/user/alpha" = 13 chars × 7 = 91px → fits at level 1
      // "/h/u/alpha" = 10 chars × 7 = 70px → fits at level 2
      const result = compressPathToWidth(alphaMap, 80, measureText);
      expect(result).toBe('/h/u/alpha');
    });

    test('small maxWidth → progressive compression applied', () => {
      // "/h/user/alpha" = 13 chars × 7 = 91px
      const result = compressPathToWidth(alphaMap, 91, measureText);
      expect(result).toBe('/h/user/alpha');
    });

    test('extremely small maxWidth → returns max compression as best effort', () => {
      const result = compressPathToWidth(alphaMap, 1, measureText);
      expect(result).toBe('/h/u/alpha');
    });
  });

  describe('noCompressMap (compressibleCount: 0)', () => {
    test('always returns original regardless of width', () => {
      expect(compressPathToWidth(noCompressMap, 1, measureText)).toBe('~/project');
      expect(compressPathToWidth(noCompressMap, 1000, measureText)).toBe('~/project');
    });
  });

  describe('tildaMap', () => {
    test('exact width match at level 1', () => {
      // "~/Do/project" = 12 chars × 7 = 84px
      const result = compressPathToWidth(tildaMap, 84, measureText);
      expect(result).toBe('~/Do/project');
    });

    test('width too small for level 0 but fits level 1', () => {
      // "~/Documents/project" = 19 chars × 7 = 133px
      // "~/Do/project" = 12 chars × 7 = 84px
      const result = compressPathToWidth(tildaMap, 100, measureText);
      expect(result).toBe('~/Do/project');
    });
  });
});
