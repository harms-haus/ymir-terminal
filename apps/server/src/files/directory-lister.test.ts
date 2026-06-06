import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listDirectories } from './directory-lister';

// Track temp dirs for cleanup
let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dir-lister-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

// ─── 1. Lists only directories (not files) ──────────────────────────────

describe('listDirectories', () => {
  test('lists only directories, not files', async () => {
    const root = makeTempDir();
    mkdirSync(join(root, 'alpha'));
    mkdirSync(join(root, 'beta'));
    writeFileSync(join(root, 'file.txt'), 'hello');
    writeFileSync(join(root, 'another.md'), 'world');

    const result = await listDirectories(root);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.name)).toEqual(['alpha', 'beta']);
    // Files should not appear
    expect(result.find((e) => e.name === 'file.txt')).toBeUndefined();
    expect(result.find((e) => e.name === 'another.md')).toBeUndefined();
  });

  // ─── 2. Includes hidden directories ────────────────────────────────────

  test('includes hidden directories (starting with .)', async () => {
    const root = makeTempDir();
    mkdirSync(join(root, '.config'));
    mkdirSync(join(root, '.local'));
    mkdirSync(join(root, 'visible'));

    const result = await listDirectories(root);

    expect(result).toHaveLength(3);
    const names = result.map((e) => e.name);
    expect(names).toContain('.config');
    expect(names).toContain('.local');
    expect(names).toContain('visible');
  });

  // ─── 3. Returns entries sorted alphabetically ──────────────────────────

  test('returns entries sorted alphabetically by name', async () => {
    const root = makeTempDir();
    mkdirSync(join(root, 'zebra'));
    mkdirSync(join(root, 'alpha'));
    mkdirSync(join(root, 'mid'));
    mkdirSync(join(root, '.hidden'));

    const result = await listDirectories(root);

    expect(result).toHaveLength(4);
    expect(result.map((e) => e.name)).toEqual(['.hidden', 'alpha', 'mid', 'zebra']);
  });

  // ─── 4. Returns empty array for non-existent path ──────────────────────

  test('returns empty array for a non-existent path', async () => {
    const result = await listDirectories('/this/path/does/not/exist');
    expect(result).toEqual([]);
  });

  // ─── 5. Returns empty array for a path that is a file ──────────────────

  test('returns empty array when given a file path', async () => {
    const root = makeTempDir();
    const filePath = join(root, 'not-a-dir.txt');
    writeFileSync(filePath, 'content');

    const result = await listDirectories(filePath);
    expect(result).toEqual([]);
  });

  // ─── 7. Follows symlinks to directories ────────────────────────────────

  test('follows symlinks to directories', async () => {
    const root = makeTempDir();
    const realDir = join(root, 'real-dir');
    mkdirSync(realDir);
    writeFileSync(join(realDir, 'inner.txt'), '');

    const symlinkPath = join(root, 'link-to-dir');
    symlinkSync(realDir, symlinkPath);

    const result = await listDirectories(root);

    expect(result).toHaveLength(2);
    const names = result.map((e) => e.name);
    expect(names).toContain('real-dir');
    expect(names).toContain('link-to-dir');
  });
});
