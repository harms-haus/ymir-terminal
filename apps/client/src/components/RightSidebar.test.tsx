/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, afterEach, mock, spyOn } from 'bun:test';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock send-request before importing the component
// ---------------------------------------------------------------------------

const sendRequestModule = await import('../lib/send-request');
const sendRequestSpy = spyOn(sendRequestModule, 'sendRequest').mockResolvedValue(
  {} as Record<string, unknown>,
);

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------

const { RightSidebar } = await import('./RightSidebar');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderRightSidebar(
  workspaceId: string | null = 'ws-1',
  onFileSelect: (path: string) => void = mock(() => {}),
) {
  return render(React.createElement(RightSidebar, { workspaceId, onFileSelect }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RightSidebar', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. RightSidebar renders file tree section and git status section
  // -----------------------------------------------------------------------
  test('renders file tree section and git status section', () => {
    const { getByTestId, getByText } = renderRightSidebar();

    expect(getByTestId('right-sidebar-content')).toBeTruthy();
    // Explorer header
    expect(getByText('Explorer')).toBeTruthy();
    // Git panel (null status → "Not a git repository")
    expect(getByTestId('git-panel')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. File tree shows files for the active workspace
  // -----------------------------------------------------------------------
  test('file tree is rendered when workspace is active', () => {
    const { getByTestId, queryByText } = renderRightSidebar('ws-1');

    // FileTree component should be mounted
    expect(getByTestId('file-tree')).toBeTruthy();
    // Should NOT show "No workspace selected"
    expect(queryByText('No workspace selected')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. Git status shows below the file tree
  // -----------------------------------------------------------------------
  test('git panel is rendered below the file tree', () => {
    const { getByTestId } = renderRightSidebar();

    const sidebar = getByTestId('right-sidebar-content');
    const fileTree = getByTestId('file-tree');
    const gitPanel = getByTestId('git-panel');

    // Both are in the sidebar
    expect(sidebar.contains(fileTree)).toBe(true);
    expect(sidebar.contains(gitPanel)).toBe(true);

    // Git panel comes after file tree in DOM order
    const allElements = Array.from(sidebar.querySelectorAll('*'));
    const fileTreeIndex = allElements.indexOf(fileTree);
    const gitPanelIndex = allElements.indexOf(gitPanel);
    expect(gitPanelIndex).toBeGreaterThan(fileTreeIndex);
  });

  // -----------------------------------------------------------------------
  // 4. Clicking a file triggers onFileSelect callback
  // -----------------------------------------------------------------------
  test('clicking a file triggers onFileSelect callback', async () => {
    const onFileSelect = mock(() => {});

    // Mock file tree response
    sendRequestSpy.mockResolvedValueOnce({
      tree: [
        {
          name: 'src',
          path: '/src',
          isDirectory: true,
          children: [{ name: 'hello.ts', path: '/src/hello.ts', isDirectory: false }],
        },
      ],
    });
    // Mock git status response
    sendRequestSpy.mockResolvedValueOnce({
      branch: 'main',
      changes: [],
      staged: [],
    });

    const { getByTestId } = renderRightSidebar('ws-1', onFileSelect);

    // Wait for the directory node to appear after async data loads
    await waitFor(() => {
      expect(getByTestId('tree-node-/src')).toBeTruthy();
    });

    // Expand the directory first
    fireEvent.click(getByTestId('tree-node-/src'));

    // Now click the nested file
    fireEvent.click(getByTestId('tree-node-/src/hello.ts'));
    expect(onFileSelect).toHaveBeenCalledWith('/src/hello.ts');
  });

  // -----------------------------------------------------------------------
  // 5. Context menu wraps file tree nodes
  // -----------------------------------------------------------------------
  test('shows no workspace selected when workspaceId is null', () => {
    const { getByText, queryByTestId } = renderRightSidebar(null);

    expect(getByText('No workspace selected')).toBeTruthy();
    // FileTree should not be rendered
    expect(queryByTestId('file-tree')).toBeNull();
  });
});
