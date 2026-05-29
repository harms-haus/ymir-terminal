import { describe, test, expect } from 'bun:test';
import {
  buildGitPathMap,
  computeDirectoryStatus,
  mergeDeletedFiles,
  GIT_STATUS_COLORS,
} from './git-tree-status';
import type { FileNode, GitStatusResponse } from '@ymir/shared';

// ---------------------------------------------------------------------------
// GIT_STATUS_COLORS
// ---------------------------------------------------------------------------

describe('GIT_STATUS_COLORS', () => {
  test('has all expected keys', () => {
    expect(Object.keys(GIT_STATUS_COLORS).sort()).toEqual(['??', 'A', 'C', 'D', 'M', 'R'].sort());
  });

  test('green colors for added, renamed, copied', () => {
    const green = '#73c991';
    expect(GIT_STATUS_COLORS['A']).toBe(green);
    expect(GIT_STATUS_COLORS['R']).toBe(green);
    expect(GIT_STATUS_COLORS['C']).toBe(green);
  });

  test('muted color for untracked', () => {
    expect(GIT_STATUS_COLORS['??']).toBe('#888');
  });

  test('gold color for modified', () => {
    expect(GIT_STATUS_COLORS['M']).toBe('#e2c08d');
  });

  test('red color for deleted', () => {
    expect(GIT_STATUS_COLORS['D']).toBe('#c74e39');
  });
});

// ---------------------------------------------------------------------------
// buildGitPathMap
// ---------------------------------------------------------------------------

describe('buildGitPathMap', () => {
  test('returns empty Map for null input', () => {
    const map = buildGitPathMap(null);
    expect(map.size).toBe(0);
  });

  test('maps changes with staged: false', () => {
    const input: GitStatusResponse = {
      branch: 'main',
      changes: [{ path: 'a.ts', status: 'M' }],
      staged: [],
    };
    const map = buildGitPathMap(input);
    expect(map.has('a.ts')).toBe(true);
    expect(map.get('a.ts')).toEqual({ status: 'M', staged: false });
  });

  test('maps staged entries with staged: true', () => {
    const input: GitStatusResponse = {
      branch: 'main',
      changes: [],
      staged: [{ path: 'b.ts', status: 'A' }],
    };
    const map = buildGitPathMap(input);
    expect(map.has('b.ts')).toBe(true);
    expect(map.get('b.ts')).toEqual({ status: 'A', staged: true });
  });

  test('staged overwrites changes for the same file', () => {
    const input: GitStatusResponse = {
      branch: 'main',
      changes: [{ path: 'same.ts', status: 'M' }],
      staged: [{ path: 'same.ts', status: 'A' }],
    };
    const map = buildGitPathMap(input);
    expect(map.size).toBe(1);
    expect(map.get('same.ts')).toEqual({ status: 'A', staged: true });
  });

  test('multiple files in changes are all present', () => {
    const input: GitStatusResponse = {
      branch: 'main',
      changes: [
        { path: 'a.ts', status: 'M' },
        { path: 'b.ts', status: 'A' },
        { path: 'c.ts', status: 'D' },
      ],
      staged: [],
    };
    const map = buildGitPathMap(input);
    expect(map.size).toBe(3);
    expect(map.get('a.ts')).toEqual({ status: 'M', staged: false });
    expect(map.get('b.ts')).toEqual({ status: 'A', staged: false });
    expect(map.get('c.ts')).toEqual({ status: 'D', staged: false });
  });

  test('untracked files (?? status) work correctly', () => {
    const input: GitStatusResponse = {
      branch: 'main',
      changes: [{ path: 'new-file.ts', status: '??' }],
      staged: [],
    };
    const map = buildGitPathMap(input);
    expect(map.get('new-file.ts')).toEqual({ status: '??', staged: false });
  });
});

// ---------------------------------------------------------------------------
// computeDirectoryStatus
// ---------------------------------------------------------------------------

describe('computeDirectoryStatus', () => {
  const workspaceRoot = '/root';

  test('file with change returns M', () => {
    const node: FileNode = { name: 'a.ts', path: '/root/a.ts', isDirectory: false };
    const gitPathMap = buildGitPathMap({
      branch: 'main',
      changes: [{ path: 'a.ts', status: 'M' }],
      staged: [],
    });
    expect(computeDirectoryStatus(node, gitPathMap, workspaceRoot)).toBe('M');
  });

  test('file without change returns null', () => {
    const node: FileNode = { name: 'a.ts', path: '/root/a.ts', isDirectory: false };
    const gitPathMap = new Map<string, { status: string; staged: boolean }>();
    expect(computeDirectoryStatus(node, gitPathMap, workspaceRoot)).toBeNull();
  });

  test('directory with changed child returns M', () => {
    const node: FileNode = {
      name: 'src',
      path: '/root/src',
      isDirectory: true,
      children: [
        { name: 'a.ts', path: '/root/src/a.ts', isDirectory: false },
        { name: 'b.ts', path: '/root/src/b.ts', isDirectory: false },
      ],
    };
    const gitPathMap = buildGitPathMap({
      branch: 'main',
      changes: [{ path: 'src/a.ts', status: 'M' }],
      staged: [],
    });
    expect(computeDirectoryStatus(node, gitPathMap, workspaceRoot)).toBe('M');
  });

  test('directory with no changes returns null', () => {
    const node: FileNode = {
      name: 'src',
      path: '/root/src',
      isDirectory: true,
      children: [{ name: 'a.ts', path: '/root/src/a.ts', isDirectory: false }],
    };
    const gitPathMap = new Map<string, { status: string; staged: boolean }>();
    expect(computeDirectoryStatus(node, gitPathMap, workspaceRoot)).toBeNull();
  });

  test('nested directory with deep change returns M', () => {
    const node: FileNode = {
      name: 'src',
      path: '/root/src',
      isDirectory: true,
      children: [
        {
          name: 'deep',
          path: '/root/src/deep',
          isDirectory: true,
          children: [
            {
              name: 'deeper',
              path: '/root/src/deep/deeper',
              isDirectory: true,
              children: [
                { name: 'file.ts', path: '/root/src/deep/deeper/file.ts', isDirectory: false },
              ],
            },
          ],
        },
      ],
    };
    const gitPathMap = buildGitPathMap({
      branch: 'main',
      changes: [{ path: 'src/deep/deeper/file.ts', status: 'M' }],
      staged: [],
    });
    expect(computeDirectoryStatus(node, gitPathMap, workspaceRoot)).toBe('M');
  });

  test('empty directory returns null', () => {
    const node: FileNode = {
      name: 'empty',
      path: '/root/empty',
      isDirectory: true,
      children: [],
    };
    const gitPathMap = new Map<string, { status: string; staged: boolean }>();
    expect(computeDirectoryStatus(node, gitPathMap, workspaceRoot)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mergeDeletedFiles
// ---------------------------------------------------------------------------

describe('mergeDeletedFiles', () => {
  const workspaceRoot = '/root';

  test('inserts synthetic FileNode into existing parent directory', () => {
    const tree: FileNode[] = [
      {
        name: 'src',
        path: '/root/src',
        isDirectory: true,
        children: [{ name: 'index.ts', path: '/root/src/index.ts', isDirectory: false }],
      },
    ];
    const gitStatus: GitStatusResponse = {
      branch: 'main',
      changes: [{ path: 'src/old.ts', status: 'D' }],
      staged: [],
    };
    const result = mergeDeletedFiles(tree, gitStatus, workspaceRoot);
    const srcDir = result.find((n) => n.name === 'src')!;
    expect(srcDir.children!.some((c) => c.name === 'old.ts')).toBe(true);
    const synthetic = srcDir.children!.find((c) => c.name === 'old.ts')!;
    expect(synthetic.path).toBe('/root/src/old.ts');
    expect(synthetic.isDirectory).toBe(false);
  });

  test('returns tree unchanged when parent directory does not exist', () => {
    const tree: FileNode[] = [
      {
        name: 'src',
        path: '/root/src',
        isDirectory: true,
        children: [],
      },
    ];
    const gitStatus: GitStatusResponse = {
      branch: 'main',
      changes: [{ path: 'nonexistent/old.ts', status: 'D' }],
      staged: [],
    };
    const result = mergeDeletedFiles(tree, gitStatus, workspaceRoot);
    expect(result).toEqual(tree);
  });

  test('inserts multiple deleted files under the same parent', () => {
    const tree: FileNode[] = [
      {
        name: 'src',
        path: '/root/src',
        isDirectory: true,
        children: [{ name: 'index.ts', path: '/root/src/index.ts', isDirectory: false }],
      },
    ];
    const gitStatus: GitStatusResponse = {
      branch: 'main',
      changes: [
        { path: 'src/old1.ts', status: 'D' },
        { path: 'src/old2.ts', status: 'D' },
      ],
      staged: [],
    };
    const result = mergeDeletedFiles(tree, gitStatus, workspaceRoot);
    const srcDir = result.find((n) => n.name === 'src')!;
    // index.ts + 2 deleted files
    expect(srcDir.children!.length).toBe(3);
    expect(srcDir.children!.map((c) => c.name).sort()).toEqual(['index.ts', 'old1.ts', 'old2.ts']);
  });

  test('inserts root-level deleted file at top level of tree', () => {
    const tree: FileNode[] = [
      { name: 'existing.ts', path: '/root/existing.ts', isDirectory: false },
    ];
    const gitStatus: GitStatusResponse = {
      branch: 'main',
      changes: [{ path: 'root-file.ts', status: 'D' }],
      staged: [],
    };
    const result = mergeDeletedFiles(tree, gitStatus, workspaceRoot);
    const names = result.map((n) => n.name);
    expect(names).toContain('root-file.ts');
    const synthetic = result.find((n) => n.name === 'root-file.ts')!;
    expect(synthetic.path).toBe('/root/root-file.ts');
    expect(synthetic.isDirectory).toBe(false);
  });

  test('returns tree unchanged when git status is null', () => {
    const tree: FileNode[] = [{ name: 'a.ts', path: '/root/a.ts', isDirectory: false }];
    const result = mergeDeletedFiles(tree, null, workspaceRoot);
    expect(result).toBe(tree);
  });

  test('returns tree unchanged when no deleted files in status', () => {
    const tree: FileNode[] = [{ name: 'a.ts', path: '/root/a.ts', isDirectory: false }];
    const gitStatus: GitStatusResponse = {
      branch: 'main',
      changes: [{ path: 'a.ts', status: 'M' }],
      staged: [{ path: 'b.ts', status: 'A' }],
    };
    const result = mergeDeletedFiles(tree, gitStatus, workspaceRoot);
    expect(result).toBe(tree);
  });

  test('does not mutate the input tree or its children arrays', () => {
    const originalChildren: FileNode[] = [
      { name: 'index.ts', path: '/root/src/index.ts', isDirectory: false },
    ];
    const originalTree: FileNode[] = [
      {
        name: 'src',
        path: '/root/src',
        isDirectory: true,
        children: originalChildren,
      },
    ];
    const gitStatus: GitStatusResponse = {
      branch: 'main',
      changes: [{ path: 'src/old.ts', status: 'D' }],
      staged: [],
    };

    // Deep-clone the originals so we can compare later
    const treeSnapshot = JSON.parse(JSON.stringify(originalTree));
    const childrenSnapshot = JSON.parse(JSON.stringify(originalChildren));

    mergeDeletedFiles(originalTree, gitStatus, workspaceRoot);

    // The original tree array reference should not have been mutated
    expect(originalTree).toEqual(treeSnapshot);
    // The original children array reference should not have been mutated
    expect(originalChildren).toEqual(childrenSnapshot);
  });
});
