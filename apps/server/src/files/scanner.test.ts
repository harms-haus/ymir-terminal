import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanDirectory, type ScanFileNode } from './scanner';

let tempRoot: string;

function makeTempDir() {
  tempRoot = mkdtempSync(join(tmpdir(), 'ymir-scanner-test-'));
}

function cleanup() {
  rmSync(tempRoot, { recursive: true, force: true });
}

beforeEach(() => {
  makeTempDir();
});

afterEach(() => {
  cleanup();
});

// ─── 1. Returns FileNode[] with correct shape ────────────────────────────

describe('scanDirectory', () => {
  test('returns FileNode[] with name, path, isDirectory, children', () => {
    // Single file
    writeFileSync(join(tempRoot, 'a.txt'), 'hello');

    const result = scanDirectory(tempRoot);

    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);

    const node = result[0];
    expect(node.name).toBe('a.txt');
    expect(node.path).toBe(join(tempRoot, 'a.txt'));
    expect(node.isDirectory).toBe(false);
    expect(node.children).toBeUndefined();
  });

  // ─── 2. Top-level files and directories are listed ─────────────────────

  test('lists top-level files and directories', () => {
    writeFileSync(join(tempRoot, 'file1.txt'), 'a');
    writeFileSync(join(tempRoot, 'file2.txt'), 'b');
    mkdirSync(join(tempRoot, 'dir1'));
    writeFileSync(join(tempRoot, 'dir1', 'inner.txt'), 'c');
    mkdirSync(join(tempRoot, 'dir2'));

    const result = scanDirectory(tempRoot);

    // directories first, then files, alphabetical within each group
    const names = result.map((n) => n.name);
    expect(names).toEqual(['dir1', 'dir2', 'file1.txt', 'file2.txt']);

    const dir1 = result.find((n) => n.name === 'dir1')!;
    expect(dir1.isDirectory).toBe(true);
    expect(dir1.children).toBeInstanceOf(Array);
    expect(dir1.children!.map((c) => c.name)).toEqual(['inner.txt']);

    const dir2 = result.find((n) => n.name === 'dir2')!;
    expect(dir2.isDirectory).toBe(true);
    // empty dir has empty children array
    expect(dir2.children).toEqual([]);
  });

  // ─── 3. Directories have children populated (recursive) ────────────────

  test('recursively populates children for nested directories', () => {
    mkdirSync(join(tempRoot, 'src'), { recursive: true });
    mkdirSync(join(tempRoot, 'src', 'utils'), { recursive: true });
    writeFileSync(join(tempRoot, 'src', 'index.ts'), '');
    writeFileSync(join(tempRoot, 'src', 'utils', 'helpers.ts'), '');

    const result = scanDirectory(tempRoot);

    expect(result).toHaveLength(1);
    const src = result[0];
    expect(src.name).toBe('src');
    expect(src.isDirectory).toBe(true);
    expect(src.children).toHaveLength(2);

    const utils = src.children!.find((n) => n.name === 'utils')!;
    expect(utils.isDirectory).toBe(true);
    expect(utils.children).toHaveLength(1);
    expect(utils.children![0].name).toBe('helpers.ts');
    expect(utils.children![0].isDirectory).toBe(false);

    const index = src.children!.find((n) => n.name === 'index.ts')!;
    expect(index.isDirectory).toBe(false);
  });

  // ─── 4. Hidden files/folders excluded by default, included when flag set

  test('excludes hidden files and folders by default', () => {
    writeFileSync(join(tempRoot, '.env'), 'SECRET=1');
    mkdirSync(join(tempRoot, '.hidden-dir'));
    writeFileSync(join(tempRoot, '.hidden-dir', 'secret.txt'), '');
    writeFileSync(join(tempRoot, 'visible.txt'), '');

    const result = scanDirectory(tempRoot);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('visible.txt');
  });

  test('includes hidden files and folders when includeHidden=true', () => {
    writeFileSync(join(tempRoot, '.env'), 'SECRET=1');
    mkdirSync(join(tempRoot, '.hidden-dir'));
    writeFileSync(join(tempRoot, '.hidden-dir', 'secret.txt'), '');
    writeFileSync(join(tempRoot, 'visible.txt'), '');

    const result = scanDirectory(tempRoot, { includeHidden: true });

    const names = result.map((n) => n.name);
    expect(names).toContain('.env');
    expect(names).toContain('.hidden-dir');
    expect(names).toContain('visible.txt');

    const hiddenDir = result.find((n) => n.name === '.hidden-dir')!;
    expect(hiddenDir.children!.map((c) => c.name)).toEqual(['secret.txt']);
  });

  // ─── 5. node_modules directories are excluded ──────────────────────────

  test('excludes node_modules directories by default', () => {
    mkdirSync(join(tempRoot, 'node_modules'), { recursive: true });
    mkdirSync(join(tempRoot, 'node_modules', 'some-pkg'), { recursive: true });
    writeFileSync(join(tempRoot, 'node_modules', 'some-pkg', 'index.js'), '');
    writeFileSync(join(tempRoot, 'package.json'), '{}');

    const result = scanDirectory(tempRoot);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('package.json');
  });

  test('excludes node_modules even when includeHidden=true', () => {
    mkdirSync(join(tempRoot, 'node_modules'));
    writeFileSync(join(tempRoot, 'visible.txt'), '');

    const result = scanDirectory(tempRoot, { includeHidden: true });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('visible.txt');
  });

  // ─── 6. Max depth limits recursion ─────────────────────────────────────

  test('respects maxDepth option', () => {
    mkdirSync(join(tempRoot, 'a', 'b', 'c'), { recursive: true });
    writeFileSync(join(tempRoot, 'a', 'a1.txt'), '');
    writeFileSync(join(tempRoot, 'a', 'b', 'b1.txt'), '');
    writeFileSync(join(tempRoot, 'a', 'b', 'c', 'c1.txt'), '');

    // maxDepth=0 means only the immediate children of tempRoot
    const r0 = scanDirectory(tempRoot, { maxDepth: 0 });
    expect(r0).toHaveLength(1); // just 'a' directory
    expect(r0[0].name).toBe('a');
    // children should NOT be populated (depth exhausted)
    expect(r0[0].children).toBeUndefined();

    // maxDepth=1: tempRoot -> a (depth 1), but a's children not expanded
    const r1 = scanDirectory(tempRoot, { maxDepth: 1 });
    expect(r1).toHaveLength(1);
    const a = r1[0];
    expect(a.children).toHaveLength(2); // 'b' (dir) and 'a1.txt' (file)

    // Wait — at depth 1, we should see 'a' expanded, and inside 'a' we see
    // both 'a1.txt' and 'b'. But 'b' should NOT have children because that
    // would require depth 2.
    // Actually let me reconsider: depth 0 = top level only, depth 1 = one level deeper
    // Let me just verify b has no children
    const b = a.children!.find((n) => n.name === 'b')!;
    expect(b.children).toBeUndefined();
  });

  test('default maxDepth is 10 — deep structures are scanned', () => {
    let current = tempRoot;
    for (let i = 0; i < 8; i++) {
      current = join(current, `level${i}`);
      mkdirSync(current, { recursive: true });
    }
    writeFileSync(join(current, 'deep.txt'), 'found');

    const result = scanDirectory(tempRoot);

    // Walk down the chain
    let node: ScanFileNode | undefined = result[0];
    for (let i = 0; i < 8; i++) {
      expect(node).toBeDefined();
      expect(node!.name).toBe(`level${i}`);
      expect(node!.isDirectory).toBe(true);
      node = node!.children?.[0];
    }
    // At the bottom we should find deep.txt
    expect(node).toBeDefined();
    expect(node!.name).toBe('deep.txt');
    expect(node!.isDirectory).toBe(false);
  });

  // ─── 7. Returns empty array for nonexistent directory ──────────────────

  test('returns empty array for nonexistent directory', () => {
    const result = scanDirectory('/this/path/does/not/exist');
    expect(result).toEqual([]);
  });

  // ─── 8. Files are sorted: directories first, then files, alphabetically

  test('sorts directories first, then files, alphabetically', () => {
    mkdirSync(join(tempRoot, 'zebra-dir'));
    mkdirSync(join(tempRoot, 'alpha-dir'));
    writeFileSync(join(tempRoot, 'beta.txt'), '');
    writeFileSync(join(tempRoot, 'alpha.txt'), '');
    mkdirSync(join(tempRoot, 'mid-dir'));
    writeFileSync(join(tempRoot, 'gamma.txt'), '');

    const result = scanDirectory(tempRoot);
    const names = result.map((n) => n.name);

    expect(names).toEqual([
      'alpha-dir',
      'mid-dir',
      'zebra-dir',
      'alpha.txt',
      'beta.txt',
      'gamma.txt',
    ]);
  });

  test('sorting applies recursively within subdirectories', () => {
    mkdirSync(join(tempRoot, 'sub'));
    writeFileSync(join(tempRoot, 'sub', 'z-file.txt'), '');
    writeFileSync(join(tempRoot, 'sub', 'a-file.txt'), '');
    mkdirSync(join(tempRoot, 'sub', 'z-dir'));
    mkdirSync(join(tempRoot, 'sub', 'a-dir'));

    const result = scanDirectory(tempRoot);
    const sub = result[0];
    expect(sub.name).toBe('sub');

    const names = sub.children!.map((n) => n.name);
    expect(names).toEqual(['a-dir', 'z-dir', 'a-file.txt', 'z-file.txt']);
  });

  // ─── custom excludeDirs ────────────────────────────────────────────────

  test('supports custom excludeDirs', () => {
    mkdirSync(join(tempRoot, 'dist'));
    mkdirSync(join(tempRoot, 'build'));
    writeFileSync(join(tempRoot, 'src.ts'), '');

    const result = scanDirectory(tempRoot, { excludeDirs: ['dist', 'build'] });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('src.ts');
  });

  test('default excludeDirs includes .git', () => {
    mkdirSync(join(tempRoot, '.git'));
    writeFileSync(join(tempRoot, '.git', 'config'), '');
    writeFileSync(join(tempRoot, 'code.ts'), '');

    const result = scanDirectory(tempRoot);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('code.ts');
  });
});
