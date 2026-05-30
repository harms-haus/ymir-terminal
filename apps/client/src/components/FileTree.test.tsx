/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------

const { FileTree } = await import('./FileTree');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleTree = [
  {
    name: 'src',
    path: '/src',
    isDirectory: true,
    children: [
      {
        name: 'index.ts',
        path: '/src/index.ts',
        isDirectory: false,
      },
      {
        name: 'utils',
        path: '/src/utils',
        isDirectory: true,
        children: [
          {
            name: 'helpers.ts',
            path: '/src/utils/helpers.ts',
            isDirectory: false,
          },
        ],
      },
    ],
  },
  {
    name: 'package.json',
    path: '/package.json',
    isDirectory: false,
  },
];

function renderFileTree(tree = sampleTree, onFileSelect: (path: string) => void = mock(() => {})) {
  return render(
    React.createElement(FileTree, {
      tree,
      onFileSelect,
      workspaceId: 'ws-1',
    }),
  );
}

// ---------------------------------------------------------------------------
// Helpers – git status rendering
// ---------------------------------------------------------------------------

function renderFileTreeWithGitStatus(
  tree: typeof sampleTree,
  gitStatus: Record<string, unknown> | null,
  workspaceRoot: string,
  onFileSelect: (path: string) => void = mock(() => {}),
) {
  return render(
    React.createElement(FileTree, {
      tree,
      onFileSelect,
      workspaceId: 'ws-1',
      gitStatus,
      workspaceRoot,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileTree', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. FileTree renders a list of files and directories
  // -----------------------------------------------------------------------
  test('renders a list of files and directories', () => {
    const { getByTestId, getByText } = renderFileTree();

    expect(getByTestId('file-tree')).toBeTruthy();
    // Top-level directory
    expect(getByText(/src/)).toBeTruthy();
    // Top-level file
    expect(getByText(/package\.json/)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Directories can be expanded/collapsed
  // -----------------------------------------------------------------------
  test('directories can be expanded and collapsed', () => {
    const { getByTestId, getByText, queryByText } = renderFileTree();

    // Children should NOT be visible initially
    expect(queryByText(/index\.ts/)).toBeNull();

    // Click the directory to expand
    fireEvent.click(getByTestId('tree-node-/src'));

    // Children should now be visible
    expect(getByText(/index\.ts/)).toBeTruthy();

    // Click again to collapse
    fireEvent.click(getByTestId('tree-node-/src'));

    // Children should be hidden again
    expect(queryByText(/index\.ts/)).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. Clicking a file calls onFileSelect callback with the file path
  // -----------------------------------------------------------------------
  test('clicking a file calls onFileSelect with the file path', () => {
    const onFileSelect = mock(() => {});

    const { getByTestId } = renderFileTree(sampleTree, onFileSelect);

    // Click a top-level file
    fireEvent.click(getByTestId('tree-node-/package.json'));

    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(onFileSelect).toHaveBeenCalledWith('/package.json');
  });

  // -----------------------------------------------------------------------
  // 4. Tree items show file names
  // -----------------------------------------------------------------------
  test('tree items show file names', () => {
    const { getByText } = renderFileTree();

    expect(getByText(/src/)).toBeTruthy();
    expect(getByText(/package\.json/)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 5. Nested directories can be expanded to show deep children
  // -----------------------------------------------------------------------
  test('nested directories expand to show deep children', () => {
    const { getByTestId, getByText, queryByText } = renderFileTree();

    // helpers.ts should NOT be visible initially
    expect(queryByText(/helpers\.ts/)).toBeNull();

    // Expand src
    fireEvent.click(getByTestId('tree-node-/src'));

    // Now expand utils
    fireEvent.click(getByTestId('tree-node-/src/utils'));

    // helpers.ts should now be visible
    expect(getByText(/helpers\.ts/)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 6. Clicking a nested file calls onFileSelect
  // -----------------------------------------------------------------------
  test('clicking a nested file calls onFileSelect', () => {
    const onFileSelect = mock(() => {});

    const { getByTestId } = renderFileTree(sampleTree, onFileSelect);

    // Expand src first
    fireEvent.click(getByTestId('tree-node-/src'));

    // Click the nested file
    fireEvent.click(getByTestId('tree-node-/src/index.ts'));

    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(onFileSelect).toHaveBeenCalledWith('/src/index.ts');
  });

  // -----------------------------------------------------------------------
  // 7. File alignment spacer
  // -----------------------------------------------------------------------
  test('file nodes have an alignment spacer span', () => {
    const singleFileTree = [{ name: 'readme.md', path: '/readme.md', isDirectory: false }];
    const { getByTestId } = renderFileTree(singleFileTree);

    const node = getByTestId('tree-node-/readme.md');
    // The spacer is the first span inside the treeitem row
    const spacer = node.querySelector('span') as HTMLSpanElement;
    expect(spacer).toBeTruthy();
    expect(spacer.style.display).toBe('inline-block');
    expect(spacer.style.width).toBe('10px');
  });

  // -----------------------------------------------------------------------
  // 8. Modified file git status circle
  // -----------------------------------------------------------------------
  test('modified file shows gold git status circle', () => {
    const singleFileTree = [{ name: 'a.txt', path: '/root/a.txt', isDirectory: false }];
    const gitStatus = {
      branch: 'main',
      changes: [{ path: 'a.txt', status: 'M' }],
      staged: [],
    };

    const { getByTestId } = renderFileTreeWithGitStatus(singleFileTree, gitStatus, '/root');

    const node = getByTestId('tree-node-/root/a.txt');
    const circles = Array.from(node.querySelectorAll('span')).filter(
      (s) => s.style.borderRadius === '50%',
    );
    expect(circles.length).toBeGreaterThanOrEqual(1);
    expect(circles[0].style.backgroundColor).toContain('#e2c08d');
  });

  // -----------------------------------------------------------------------
  // 9. Deleted file styling
  // -----------------------------------------------------------------------
  test('deleted file shows red circle and strikethrough name', () => {
    const singleFileTree = [{ name: 'gone.ts', path: '/root/gone.ts', isDirectory: false }];
    const gitStatus = {
      branch: 'main',
      changes: [{ path: 'gone.ts', status: 'D' }],
      staged: [],
    };

    const { getByTestId } = renderFileTreeWithGitStatus(singleFileTree, gitStatus, '/root');

    const node = getByTestId('tree-node-/root/gone.ts');

    // Red circle
    const circles = Array.from(node.querySelectorAll('span')).filter(
      (s) => s.style.borderRadius === '50%',
    );
    expect(circles.length).toBeGreaterThanOrEqual(1);
    expect(circles[0].style.backgroundColor).toContain('#c74e39');

    // Strikethrough name
    const nameSpan = Array.from(node.querySelectorAll('span')).find(
      (s) => s.textContent?.includes('gone.ts') && s.style.textDecoration,
    );
    expect(nameSpan).toBeTruthy();
    expect(nameSpan!.style.color).toContain('#c74e39');
    expect(nameSpan!.style.textDecoration).toBe('line-through');
  });

  // -----------------------------------------------------------------------
  // 10. Directory git status circle
  // -----------------------------------------------------------------------
  test('directory with modified child shows gold git status circle', () => {
    const dirTree = [
      {
        name: 'src',
        path: '/root/src',
        isDirectory: true,
        children: [{ name: 'changed.ts', path: '/root/src/changed.ts', isDirectory: false }],
      },
    ];
    const gitStatus = {
      branch: 'main',
      changes: [{ path: 'src/changed.ts', status: 'M' }],
      staged: [],
    };

    const { getByTestId } = renderFileTreeWithGitStatus(dirTree, gitStatus, '/root');

    const node = getByTestId('tree-node-/root/src');
    const circles = Array.from(node.querySelectorAll('span')).filter(
      (s) => s.style.borderRadius === '50%',
    );
    expect(circles.length).toBeGreaterThanOrEqual(1);
    expect(circles[0].style.backgroundColor).toContain('#e2c08d');
  });

  // -----------------------------------------------------------------------
  // 11. No git status — no circles
  // -----------------------------------------------------------------------
  test('no git status renders no status circles', () => {
    const { container } = renderFileTree();

    const circles = Array.from(container.querySelectorAll('span')).filter(
      (s) => s.style.borderRadius === '50%',
    );
    expect(circles.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 12. Green circle for untracked files
  // -----------------------------------------------------------------------
  test('untracked file shows green circle', () => {
    const singleFileTree = [{ name: 'new.txt', path: '/root/new.txt', isDirectory: false }];
    const gitStatus = {
      branch: 'main',
      changes: [{ path: 'new.txt', status: '??' }],
      staged: [],
    };

    const { getByTestId } = renderFileTreeWithGitStatus(singleFileTree, gitStatus, '/root');

    const node = getByTestId('tree-node-/root/new.txt');
    const circles = Array.from(node.querySelectorAll('span')).filter(
      (s) => s.style.borderRadius === '50%',
    );
    expect(circles.length).toBeGreaterThanOrEqual(1);
    expect(circles[0].style.backgroundColor).toContain('#888');
  });
});
