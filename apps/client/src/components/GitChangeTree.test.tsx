/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';

await setupTestDom();
setupAllMocks();

import { describe, it, expect, mock, afterEach } from 'bun:test';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import type { GitFileChange } from '@ymir/shared';

// Mock GitChangeContextMenu before importing GitChangeTree
mock.module('./GitChangeContextMenu', () => ({
  GitChangeContextMenu: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'mock-context-menu' }, children),
}));

const { GitChangeTree } = await import('./GitChangeTree');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTree(changes: GitFileChange[]) {
  return render(React.createElement(GitChangeTree, { changes }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitChangeTree', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders flat file changes', () => {
    const changes: GitFileChange[] = [
      { path: 'README.md', status: 'M' },
      { path: 'package.json', status: 'A' },
    ];

    const { getByTestId } = renderTree(changes);

    expect(getByTestId('git-change-tree')).toBeTruthy();
    expect(getByTestId('change-file-README.md')).toBeTruthy();
    expect(getByTestId('change-file-package.json')).toBeTruthy();
  });

  it('renders nested paths as tree with directories', () => {
    const changes: GitFileChange[] = [
      { path: 'src/index.ts', status: 'M' },
      { path: 'src/utils/helper.ts', status: 'A' },
    ];

    const { getByTestId } = renderTree(changes);

    // Directory nodes should be present
    expect(getByTestId('change-dir-src')).toBeTruthy();
    expect(getByTestId('change-dir-src/utils')).toBeTruthy();

    // File nodes should be present
    expect(getByTestId('change-file-src/index.ts')).toBeTruthy();
    expect(getByTestId('change-file-src/utils/helper.ts')).toBeTruthy();
  });

  it('directory nodes expand/collapse on click', () => {
    const changes: GitFileChange[] = [
      { path: 'src/index.ts', status: 'M' },
    ];

    const { getByTestId, queryByTestId } = renderTree(changes);

    const dirNode = getByTestId('change-dir-src');
    // Initially expanded
    expect(dirNode.getAttribute('aria-expanded')).toBe('true');

    // Click to collapse
    fireEvent.click(dirNode);
    expect(dirNode.getAttribute('aria-expanded')).toBe('false');

    // The child file should no longer be visible
    expect(queryByTestId('change-file-src/index.ts')).toBeNull();

    // Click again to expand
    fireEvent.click(dirNode);
    expect(dirNode.getAttribute('aria-expanded')).toBe('true');
    expect(getByTestId('change-file-src/index.ts')).toBeTruthy();
  });

  it('shows correct status colors', () => {
    const changes: GitFileChange[] = [
      { path: 'modified.ts', status: 'M' },
      { path: 'added.ts', status: 'A' },
      { path: 'deleted.ts', status: 'D' },
      { path: 'untracked.ts', status: '??' },
    ];

    const { getByTestId } = renderTree(changes);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GIT_STATUS_COLORS } = require('../lib/theme');

    // Each file node should have a status dot with the correct color
    for (const change of changes) {
      const fileNode = getByTestId(`change-file-${change.path}`);
      // The first span child is the status dot
      const dot = fileNode.querySelector('span') as HTMLElement;
      expect(dot).toBeTruthy();
      const expectedColor = GIT_STATUS_COLORS[change.status];
      expect(expectedColor).toBeDefined();
      expect((dot.style as CSSStyleDeclaration).color).toBe(expectedColor);
    }
  });
});
