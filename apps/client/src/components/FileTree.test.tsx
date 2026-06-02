/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useDialog hooks (used by FileTreeContextMenu for confirm dialogs)
// ---------------------------------------------------------------------------

mock.module('../hooks/useDialog', () => ({
  useConfirm: () => async () => true,
  usePrompt: () => async () => null,
}));

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
      gitStatus: gitStatus as Parameters<typeof FileTree>[0]['gitStatus'],
      workspaceRoot,
    }),
  );
}

// ---------------------------------------------------------------------------
// Helper – query by data-testid within an element (avoids CSS attribute selector
// issues on Ubuntu's happy-dom)
// ---------------------------------------------------------------------------
function queryChildByTestId(parent: HTMLElement, testId: string): HTMLElement | null {
  const all = parent.querySelectorAll('*');
  for (const el of all) {
    if ((el as HTMLElement).getAttribute?.('data-testid') === testId) {
      return el as HTMLElement;
    }
  }
  return null;
}

function queryAllByTestId(container: HTMLElement, testId: string): HTMLElement[] {
  const result: HTMLElement[] = [];
  const all = container.querySelectorAll('*');
  for (const el of all) {
    if ((el as HTMLElement).getAttribute?.('data-testid') === testId) {
      result.push(el as HTMLElement);
    }
  }
  return result;
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
  // 4. Nested directories can be expanded to show deep children
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
  // 5. Clicking a nested file calls onFileSelect
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
  // 6. File alignment spacer
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
  // 7. Modified file git status circle
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
    const circle = queryChildByTestId(node, 'git-status-dot');
    expect(circle).toBeTruthy();
    expect(circle!.style.backgroundColor).toContain('#e2c08d');
  });

  // -----------------------------------------------------------------------
  // 8. Deleted file styling
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
    const circle = queryChildByTestId(node, 'git-status-dot');
    expect(circle).toBeTruthy();
    expect(circle!.style.backgroundColor).toContain('#c74e39');

    // Strikethrough name
    const nameSpan = Array.from(node.querySelectorAll('span')).find(
      (s) => s.textContent?.includes('gone.ts') && s.style.textDecoration,
    );
    expect(nameSpan).toBeTruthy();
    expect(nameSpan!.style.color).toContain('#c74e39');
    expect(nameSpan!.style.textDecoration).toBe('line-through');
  });

  // -----------------------------------------------------------------------
  // 9. Directory git status circle
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
    const circle = queryChildByTestId(node, 'dir-status-dot');
    expect(circle).toBeTruthy();
    expect(circle!.style.backgroundColor).toContain('#e2c08d');
  });

  // -----------------------------------------------------------------------
  // 10. No git status — no circles
  // -----------------------------------------------------------------------
  test('no git status renders no status circles', () => {
    const { container } = renderFileTree();

    expect(queryAllByTestId(container, 'git-status-dot').length).toBe(0);
    expect(queryAllByTestId(container, 'dir-status-dot').length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 11. Green circle for untracked files
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
    const circle = queryChildByTestId(node, 'git-status-dot');
    expect(circle).toBeTruthy();
    expect(circle!.style.backgroundColor).toContain('#888');
  });

  // -----------------------------------------------------------------------
  // 12. Inner directory expand state is preserved when parent collapsed
  //     and re-expanded
  // -----------------------------------------------------------------------
  test('inner directory expand state is preserved when parent collapsed and re-expanded', () => {
    const { getByTestId, getByText, queryByText } = renderFileTree();

    // Expand /src
    fireEvent.click(getByTestId('tree-node-/src'));

    // Expand /src/utils
    fireEvent.click(getByTestId('tree-node-/src/utils'));

    // helpers.ts should be visible
    expect(getByText(/helpers\.ts/)).toBeTruthy();

    // Collapse /src
    fireEvent.click(getByTestId('tree-node-/src'));

    // helpers.ts should NOT be visible (parent collapsed)
    expect(queryByText(/helpers\.ts/)).toBeNull();

    // Re-expand /src
    fireEvent.click(getByTestId('tree-node-/src'));

    // helpers.ts should be visible again (proves /src/utils was preserved as expanded)
    expect(getByText(/helpers\.ts/)).toBeTruthy();

    // /src/utils should still be marked as expanded
    expect(getByTestId('tree-node-/src/utils').getAttribute('aria-expanded')).toBe('true');
  });
});
