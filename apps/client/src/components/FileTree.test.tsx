/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

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

function renderFileTree(
  tree = sampleTree,
  onFileSelect: (path: string) => void = mock(() => {}),
) {
  return render(
    React.createElement(FileTree, {
      tree,
      onFileSelect,
      workspaceId: 'ws-1',
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
});
