import { describe, test, expect } from 'bun:test';
import { buildChangeTree, type ChangeTreeNode } from './git-change-tree';
import type { GitFileChange } from '@ymir/shared';

// ── Helpers ─────────────────────────────────────────────────────────────────

function file(path: string, status: GitFileChange['status'] = 'M'): GitFileChange {
  return { path, status };
}

function dir(name: string, path: string, children: ChangeTreeNode[]): ChangeTreeNode {
  return { name, path, isDirectory: true, children };
}

function leaf(name: string, path: string, status: GitFileChange['status'] = 'M'): ChangeTreeNode {
  return { name, path, isDirectory: false, status };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildChangeTree', () => {
  test('returns empty array for empty input', () => {
    expect(buildChangeTree([])).toEqual([]);
  });

  test('single file → single file node', () => {
    const result = buildChangeTree([file('readme.md', 'A')]);
    expect(result).toEqual([leaf('readme.md', 'readme.md', 'A')]);
  });

  test('flat files → single-level tree', () => {
    const changes = [file('b.ts'), file('a.ts')];
    const result = buildChangeTree(changes);

    // Sorted alphabetically
    expect(result).toEqual([leaf('a.ts', 'a.ts', 'M'), leaf('b.ts', 'b.ts', 'M')]);
  });

  test('nested paths → multi-level tree', () => {
    const changes = [file('src/lib/a.ts', 'A'), file('src/b.ts', 'D')];
    const result = buildChangeTree(changes);

    expect(result).toEqual([
      dir('src', 'src', [
        dir('lib', 'src/lib', [leaf('a.ts', 'src/lib/a.ts', 'A')]),
        leaf('b.ts', 'src/b.ts', 'D'),
      ]),
    ]);
  });

  test('files in same directory → grouped under one directory node', () => {
    const changes = [file('src/a.ts'), file('src/b.ts'), file('src/c.ts')];
    const result = buildChangeTree(changes);

    expect(result).toEqual([
      dir('src', 'src', [
        leaf('a.ts', 'src/a.ts', 'M'),
        leaf('b.ts', 'src/b.ts', 'M'),
        leaf('c.ts', 'src/c.ts', 'M'),
      ]),
    ]);

    // Only one directory node, not three
    expect(result).toHaveLength(1);
  });

  test('sorting: directories before files, alphabetical within groups', () => {
    const changes = [
      file('root.txt'),
      file('src/main.ts'),
      file('alpha.txt'),
      file('src/util.ts'),
      file('docs/guide.md'),
    ];
    const result = buildChangeTree(changes);

    // Top level: docs (dir), src (dir), alpha.txt (file), root.txt (file)
    expect(result.map((n) => n.name)).toEqual(['docs', 'src', 'alpha.txt', 'root.txt']);

    // Inside src: files sorted alphabetically
    const srcNode = result.find((n) => n.name === 'src')!;
    expect(srcNode.children!.map((n) => n.name)).toEqual(['main.ts', 'util.ts']);
  });

  test('mixed depths', () => {
    const changes = [file('a.ts', 'M'), file('src/b.ts', 'A'), file('src/lib/c.ts', 'D')];
    const result = buildChangeTree(changes);

    expect(result).toEqual([
      dir('src', 'src', [
        dir('lib', 'src/lib', [leaf('c.ts', 'src/lib/c.ts', 'D')]),
        leaf('b.ts', 'src/b.ts', 'A'),
      ]),
      leaf('a.ts', 'a.ts', 'M'),
    ]);
  });

  test('status preserved correctly on file nodes', () => {
    const changes = [
      file('added.ts', 'A'),
      file('modified.ts', 'M'),
      file('deleted.ts', 'D'),
      file('renamed.ts', 'R'),
      file('copied.ts', 'C'),
      file('untracked.ts', '?'),
      file('unknown.ts', '??'),
    ];
    const result = buildChangeTree(changes);

    const statuses = result.map((n) => n.status);
    expect(statuses).toEqual(['A', 'C', 'D', 'M', 'R', '??', '?']);
  });
});
