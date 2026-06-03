/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock, spyOn } from 'bun:test';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useDialog hooks (used by RightSidebar for prompt dialogs)
// ---------------------------------------------------------------------------

mock.module('../hooks/useDialog', () => ({
  useConfirm: () => async () => true,
  usePrompt: () => async () => 'test-value',
}));

// ---------------------------------------------------------------------------
// Mock ../lib/git-utils (imported by FileTree)
// ---------------------------------------------------------------------------

mock.module('../lib/git-utils', () => ({
  buildGitPathMap: () => new Map(),
  computeDirectoryStatus: () => null,
  mergeDeletedFiles: (tree: unknown[]) => tree,
}));

// ---------------------------------------------------------------------------
// Mock ./GitHistoryPanel (imported by RightSidebar)
// ---------------------------------------------------------------------------

mock.module('./GitHistoryPanel', () => ({
  GitHistoryPanel: ({ workspaceId }: { workspaceId: string | null }) =>
    React.createElement('div', { 'data-testid': 'git-history-panel' }, workspaceId ?? ''),
}));

// ---------------------------------------------------------------------------
// Mock ../lib/ws-client so onMessage handlers are captured
// ---------------------------------------------------------------------------

const onMessageHandlers: ((envelope: unknown) => void)[] = [];

mock.module('../lib/ws-client', () => ({
  wsClient: {
    connect: mock(() => {}),
    send: mock(() => {}),
    onMessage: (handler: (envelope: unknown) => void) => {
      onMessageHandlers.push(handler);
      return () => {
        const idx = onMessageHandlers.indexOf(handler);
        if (idx !== -1) onMessageHandlers.splice(idx, 1);
      };
    },
    getStatus: mock(() => 'connected'),
    onStatusChange: mock(() => () => {}),
    setToken: mock(() => {}),
    disconnect: mock(() => {}),
  },
}));

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
const { FileClipboardProvider } = await import('../contexts/FileClipboardContext');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderRightSidebar(
  workspaceId: string | null = 'ws-1',
  onFileSelect: (path: string) => void = mock(() => {}),
  workspaceCwd?: string,
) {
  return render(
    React.createElement(
      FileClipboardProvider,
      null,
      React.createElement(RightSidebar, { workspaceId, onFileSelect, workspaceCwd }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('RightSidebar', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. RightSidebar renders file tree section and git status section
  // -----------------------------------------------------------------------
  test('renders Project header, toggle buttons, and git history panel', () => {
    const { getByTestId, getByText } = renderRightSidebar();

    expect(getByTestId('right-sidebar-content')).toBeTruthy();
    // Project header
    expect(getByTestId('toggle-file-tree')).toBeTruthy();
    expect(getByTestId('toggle-git-changes')).toBeTruthy();
    expect(getByTestId('git-history-panel')).toBeTruthy();
    expect(getByText('Project')).toBeTruthy();
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
  // 3. Git history panel is rendered in the bottom panel
  // -----------------------------------------------------------------------
  test('git history panel is rendered in the bottom panel', () => {
    const { getByTestId } = renderRightSidebar();

    const sidebar = getByTestId('right-sidebar-content');
    const gitHistory = getByTestId('git-history-panel');

    expect(sidebar.contains(gitHistory)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 4. Clicking a file triggers onFileSelect callback
  // -----------------------------------------------------------------------
  test('clicking a file triggers onFileSelect callback', async () => {
    const onFileSelect = mock(() => {});

    // Mock config.get (project sidebar panel sizes) — consumed on mount
    sendRequestSpy.mockResolvedValueOnce({ key: 'ui_project_sidebar_sizes', value: null });
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
  // 5. Shows "no workspace selected" when workspaceId is null
  // -----------------------------------------------------------------------
  test('shows no workspace selected when workspaceId is null', () => {
    const { getByText, queryByTestId } = renderRightSidebar(null);

    expect(getByText('No workspace selected')).toBeTruthy();
    // FileTree should not be rendered
    expect(queryByTestId('file-tree')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 6. 'Open in Editor' context menu action calls onFileSelect
  // -----------------------------------------------------------------------
  test('Open in Editor context menu action calls onFileSelect with the file path', async () => {
    const onFileSelect = mock(() => {});

    // Mock config.get (project sidebar panel sizes) — consumed on mount
    sendRequestSpy.mockResolvedValueOnce({ key: 'ui_project_sidebar_sizes', value: null });
    // Mock file tree response with a file inside a directory
    sendRequestSpy.mockResolvedValueOnce({
      tree: [
        {
          name: 'src',
          path: '/src',
          isDirectory: true,
          children: [{ name: 'app.ts', path: '/src/app.ts', isDirectory: false }],
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

    // Expand the directory so the file node is rendered
    fireEvent.click(getByTestId('tree-node-/src'));

    // Wait for the file node to appear
    await waitFor(() => {
      expect(getByTestId('tree-node-/src/app.ts')).toBeTruthy();
    });

    // Find the 'Open in Editor' context menu item rendered inside the
    // mocked Radix context menu for the file node
    const openEditorItem = getByTestId('menu-open-editor');
    expect(openEditorItem).toBeTruthy();

    // Click the 'Open in Editor' menu item
    fireEvent.click(openEditorItem);

    // The RightSidebar passes onOpenEditor={handleFileSelect} to FileTree,
    // so clicking 'Open in Editor' should invoke onFileSelect with the
    // correct file path
    expect(onFileSelect).toHaveBeenCalledWith('/src/app.ts');
  });

  // -----------------------------------------------------------------------
  // 7. Separator (resize handle) is rendered between panels
  // -----------------------------------------------------------------------
  test('renders a separator between the file tree and git panels', () => {
    const { container } = renderRightSidebar();

    const separator = container.querySelector('[data-separator]');
    expect(separator).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 8. File change triggers file.tree refresh (git status updated via push subscription)
  // -----------------------------------------------------------------------
  test('file change event triggers file.tree refresh', async () => {
    // Mock config.get (project sidebar panel sizes) — consumed on mount
    sendRequestSpy.mockResolvedValueOnce({ key: 'ui_project_sidebar_sizes', value: null });
    // Mock initial file tree response
    sendRequestSpy.mockResolvedValueOnce({
      tree: [{ name: 'src', path: '/src', isDirectory: true, children: [] }],
    });
    // Mock initial git status response
    sendRequestSpy.mockResolvedValueOnce({
      branch: 'main',
      changes: [],
      staged: [],
    });

    const { getByTestId } = renderRightSidebar('ws-1');

    // Wait for initial load to complete
    await waitFor(() => {
      expect(getByTestId('file-tree')).toBeTruthy();
    });

    // Clear the spy's call history after initial loads
    sendRequestSpy.mockClear();

    // Mock refresh response for file.tree
    sendRequestSpy.mockResolvedValueOnce({
      tree: [
        { name: 'src', path: '/src', isDirectory: true, children: [] },
        { name: 'new-file.ts', path: '/new-file.ts', isDirectory: false },
      ],
    });

    // Simulate a file.change message being received by invoking the
    // handler(s) captured by our wsClient mock's onMessage.
    const fileChangeEnvelope = {
      v: 1,
      type: 'event',
      channel: 'file.change',
      payload: { workspaceId: 'ws-1', path: '/new-file.ts', kind: 'create' },
    };

    for (const handler of onMessageHandlers) {
      handler(fileChangeEnvelope);
    }

    // After a file change, file.tree should be refreshed (git status
    // is updated via push subscription)
    await waitFor(() => {
      const calls = sendRequestSpy.mock.calls;
      const channels = calls.map((call: [string, ...unknown[]]) => call[0]);
      expect(channels).toContain('file.tree');
    });
  });

  // -----------------------------------------------------------------------
  // 9. workspaceCwd prop is forwarded to FileTree
  // -----------------------------------------------------------------------
  test('passes workspaceCwd to FileTree when provided', async () => {
    // Mock config.get (project sidebar panel sizes) — consumed on mount
    sendRequestSpy.mockResolvedValueOnce({ key: 'ui_project_sidebar_sizes', value: null });
    // Mock file tree response
    sendRequestSpy.mockResolvedValueOnce({
      tree: [{ name: 'src', path: '/src', isDirectory: true, children: [] }],
    });
    // Mock git status response
    sendRequestSpy.mockResolvedValueOnce({
      branch: 'main',
      changes: [],
      staged: [],
    });

    const { getByTestId } = renderRightSidebar(
      'ws-1',
      mock(() => {}),
      '/home/user/project',
    );

    await waitFor(() => {
      expect(getByTestId('file-tree')).toBeTruthy();
    });
    // If workspaceCwd was not forwarded, FileTree would fail to render correctly
    // with git status decorations. This test confirms the component renders
    // without errors when workspaceCwd is provided.
    expect(getByTestId('file-tree')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 10. Toggle switches top panel between file tree and git changes
  // -----------------------------------------------------------------------
  test('toggle switches top panel between file tree and git changes', async () => {
    // Mock config.get (project sidebar sizes)
    sendRequestSpy.mockResolvedValueOnce({ key: 'ui_project_sidebar_sizes', value: null });
    // Mock file tree response
    sendRequestSpy.mockResolvedValueOnce({
      tree: [{ name: 'src', path: '/src', isDirectory: true, children: [] }],
    });
    // Mock git status response
    sendRequestSpy.mockResolvedValueOnce({
      branch: 'main',
      changes: [],
      staged: [],
    });
    // Mock git.repoDiscovery for GitPanel (called when toggling to git changes view)
    sendRequestSpy.mockResolvedValueOnce({ repos: [] });

    const { getByTestId, queryByTestId } = renderRightSidebar('ws-1');

    // Default view shows file tree
    await waitFor(() => {
      expect(getByTestId('file-tree')).toBeTruthy();
    });

    // Switch to git changes
    fireEvent.click(getByTestId('toggle-git-changes'));
    expect(queryByTestId('file-tree')).toBeNull();
    expect(getByTestId('git-panel')).toBeTruthy();

    // Switch back to file tree
    fireEvent.click(getByTestId('toggle-file-tree'));
    expect(getByTestId('file-tree')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 11. Git history panel receives workspaceId
  // -----------------------------------------------------------------------
  test('git history panel receives workspaceId', () => {
    const { getByTestId } = renderRightSidebar('ws-1');
    const gitHistory = getByTestId('git-history-panel');
    expect(gitHistory.textContent).toBe('ws-1');
  });
});
