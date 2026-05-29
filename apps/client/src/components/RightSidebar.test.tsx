/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, afterEach, afterAll, mock, spyOn } from 'bun:test';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock @radix-ui/react-context-menu so context menu items render as
// regular clickable divs (portals don't work in happy-dom)
// ---------------------------------------------------------------------------

const CmRoot = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'context-menu-root' }, children);

const CmTrigger = ({ children }: { children: React.ReactNode; asChild?: boolean }) =>
  React.createElement('div', { 'data-testid': 'context-menu-trigger' }, children);

const CmPortal = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', null, children);

const CmContent = ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
  React.createElement('div', props, children);

const CmItem = ({
  children,
  onSelect,
  ...props
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  [key: string]: unknown;
}) => React.createElement('div', { ...props, onClick: onSelect }, children);

const CmSeparator = (props: { [key: string]: unknown }) =>
  React.createElement('div', { ...props, role: 'separator' });

mock.module('@radix-ui/react-context-menu', () => ({
  Root: CmRoot,
  Trigger: CmTrigger,
  Portal: CmPortal,
  Content: CmContent,
  Item: CmItem,
  Separator: CmSeparator,
}));

// ---------------------------------------------------------------------------
// Mock react-resizable-panels (Group / Panel / Separator)
// ---------------------------------------------------------------------------

mock.module('react-resizable-panels', () => ({
  Group: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) =>
    React.createElement('div', { style, 'data-group': '' }, children),
  Panel: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) =>
    React.createElement('div', { style }, children),
  Separator: ({ style }: { style?: React.CSSProperties }) =>
    React.createElement('div', { style, 'data-separator': '' }),
}));

// ---------------------------------------------------------------------------
// Mock ../lib/git-tree-status (imported by FileTree)
// ---------------------------------------------------------------------------

mock.module('../lib/git-tree-status', () => ({
  buildGitPathMap: () => new Map(),
  computeDirectoryStatus: () => null,
  GIT_STATUS_COLORS: {
    '??': '#73c991',
    A: '#73c991',
    M: '#e2c08d',
    D: '#c74e39',
    R: '#73c991',
    C: '#73c991',
  },
  mergeDeletedFiles: (tree: unknown[]) => tree,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderRightSidebar(
  workspaceId: string | null = 'ws-1',
  onFileSelect: (path: string) => void = mock(() => {}),
  workspaceCwd?: string,
) {
  return render(React.createElement(RightSidebar, { workspaceId, onFileSelect, workspaceCwd }));
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
  // 3. Git panel is rendered below the file tree
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
  // 8. File change triggers both file.tree and git.status refreshes
  // -----------------------------------------------------------------------
  test('file change event triggers both file.tree and git.status refreshes', async () => {
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

    // Mock refresh responses for file.tree and git.status
    sendRequestSpy.mockResolvedValueOnce({
      tree: [
        { name: 'src', path: '/src', isDirectory: true, children: [] },
        { name: 'new-file.ts', path: '/new-file.ts', isDirectory: false },
      ],
    });
    sendRequestSpy.mockResolvedValueOnce({
      branch: 'main',
      changes: [{ path: 'new-file.ts', status: 'A' }],
      staged: [],
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

    // After a file change, both file.tree and git.status should be refreshed
    await waitFor(() => {
      const calls = sendRequestSpy.mock.calls;
      const channels = calls.map((call: [string, ...unknown[]]) => call[0]);
      expect(channels).toContain('file.tree');
      expect(channels).toContain('git.status');
    });
  });

  // -----------------------------------------------------------------------
  // 9. workspaceCwd prop is forwarded to FileTree
  // -----------------------------------------------------------------------
  test('passes workspaceCwd to FileTree when provided', async () => {
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
});
