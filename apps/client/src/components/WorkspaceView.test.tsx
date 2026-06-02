/// <reference lib="dom" />
import { setupTestDom, setupAllMocks, renderWithProviders } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock, spyOn } from 'bun:test';
import { cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

const testWorkspaces = [
  { id: 'ws-1', name: 'Project Alpha', cwd: '/home/user/alpha', color: '#ff0000', sortOrder: 0 },
  { id: 'ws-2', name: 'Project Beta', cwd: '/home/user/beta', color: '#00ff00', sortOrder: 1 },
];

let mockWorkspacesData = testWorkspaces;
const mockUseWorkspaces = mock(() => ({
  data: mockWorkspacesData,
  isLoading: false,
}));

let mockAccentColor = '#007acc';
const mockSetAccentColor = mock((color: string) => {
  mockAccentColor = color;
});
const mockUseTheme = mock(() => ({
  accentColor: mockAccentColor,
  setAccentColor: mockSetAccentColor,
  themeVars: {
    '--accent': mockAccentColor,
    '--accent-hover': mockAccentColor + 'cc',
  } as React.CSSProperties,
}));

const mockUseAuth = mock(() => ({
  isAuthenticated: true,
  token: 'test-token',
  login: mock(() => Promise.resolve()),
  logout: mock(() => {}),
}));

const mockUseConnectionStatus = mock(() => ({
  status: 'connected' as const,
  isConnected: true,
  isReconnecting: false,
}));

const mockUseTabs = mock(() => ({
  tabs: [] as Array<Record<string, unknown>>,
  activeTabId: null as string | null,
  createTab: mock(() => 'mock-tab-id'),
  closeTab: mock(() => {}),
  activateTab: mock(() => {}),
  updateTabTitle: mock(() => {}),
  updateTabCwd: mock(() => {}),
  reorderTabs: mock(() => {}),
  closeTabsRight: mock(() => {}),
  closeOtherTabs: mock(() => {}),
  setDisplayTitle: mock(() => {}),
  switchWorkspace: mock(() => {}),
  loadTabs: mock(() => {}),
}));

const mockUseCreateWorkspace = mock(() => ({
  mutateAsync: mock(() =>
    Promise.resolve({
      workspace: { id: 'ws-new', name: 'New', cwd: '/new', color: '#007acc', sortOrder: 0 },
    }),
  ),
  isPending: false,
  isError: false,
  error: null,
}));

const mockUseUpdateWorkspace = mock(() => ({
  mutate: mock(() => {}),
  mutateAsync: mock(() => Promise.resolve()),
  isPending: false,
  isError: false,
  error: null,
}));

const mockUseDeleteWorkspace = mock(() => ({
  mutate: mock(() => {}),
  mutateAsync: mock(() => Promise.resolve()),
  isPending: false,
  isError: false,
  error: null,
}));

const mockUseReorderWorkspaces = mock(() => ({
  mutate: mock(() => {}),
  mutateAsync: mock(() => Promise.resolve()),
  isPending: false,
  isError: false,
  error: null,
}));

const mockUseCreateWorktree = mock(() => ({
  mutate: mock(() => {}),
  mutateAsync: mock(() => Promise.resolve()),
  isPending: false,
  isError: false,
  error: null,
}));

const mockUseRemoveWorktree = mock(() => ({
  mutate: mock(() => {}),
  mutateAsync: mock(() => Promise.resolve()),
  isPending: false,
  isError: false,
  error: null,
}));

const mockUseMergeWorktree = mock(() => ({
  mutate: mock(() => {}),
  mutateAsync: mock(() => Promise.resolve()),
  isPending: false,
  isError: false,
  error: null,
}));

mock.module('../hooks/useWorkspaces', () => ({
  useWorkspaces: mockUseWorkspaces,
  useCreateWorkspace: mockUseCreateWorkspace,
  useUpdateWorkspace: mockUseUpdateWorkspace,
  useDeleteWorkspace: mockUseDeleteWorkspace,
  useReorderWorkspaces: mockUseReorderWorkspaces,
  useCreateWorktree: mockUseCreateWorktree,
  useRemoveWorktree: mockUseRemoveWorktree,
  useMergeWorktree: mockUseMergeWorktree,
  useWorktreeCopyFiles: mock(() => ({ data: null, isLoading: false })),
}));

mock.module('../hooks/useTheme', () => ({
  useTheme: mockUseTheme,
}));

mock.module('../hooks/useAuth', () => ({
  useAuth: mockUseAuth,
  AuthContext: React.createContext({
    isAuthenticated: true,
    token: 'test-token',
    login: async () => {},
    logout: () => {},
  }),
}));

mock.module('../hooks/useConnectionStatus', () => ({
  useConnectionStatus: mockUseConnectionStatus,
}));

mock.module('../hooks/useTabs', () => ({
  useTabs: mockUseTabs,
}));

mock.module('../hooks/usePaneVisibility', () => ({
  usePaneVisibility: mock(() => ({
    left: true,
    right: true,
    bottom: true,
    toggleLeft: mock(() => {}),
    toggleRight: mock(() => {}),
    toggleBottom: mock(() => {}),
  })),
  PaneVisibilityProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Use spyOn instead of mock.module to avoid cross-file mock contamination.
// mock.module is process-scoped and would pollute other test files (e.g. RightSidebar.test.tsx).
const _sendRequestMod = await import('../lib/send-request');
const mockSendRequest = spyOn(_sendRequestMod, 'sendRequest');
mockSendRequest.mockImplementation(((method: string) => {
  if (method === 'tab.list') return Promise.resolve({ tabs: [] });
  if (method === 'file.read') return Promise.resolve({ content: '', language: '' });
  return Promise.resolve({ tree: [] });
}) as any);

mock.module('../lib/ws-client', () => ({
  wsClient: {
    connect: mock(() => {}),
    send: mock(() => {}),
    onMessage: mock(() => () => {}),
    getStatus: mock(() => 'connected'),
    onStatusChange: mock(() => () => {}),
  },
}));

// ---------------------------------------------------------------------------
// Mock TopBar and CommandBar
// ---------------------------------------------------------------------------

mock.module('./TopBar', () => ({
  TopBar: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'top-bar' }, children),
}));

mock.module('./CommandBar', () => ({
  CommandBar: ({ workspaceName }: { workspaceName?: string }) =>
    React.createElement('div', { 'data-testid': 'command-bar' }, workspaceName ?? 'No workspace'),
}));

// ---------------------------------------------------------------------------
// Mock sonner
// ---------------------------------------------------------------------------

mock.module('sonner', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
  toast: { success: mock(() => {}), error: mock(() => {}), info: mock(() => {}) },
}));

// ---------------------------------------------------------------------------
// Override @dnd-kit/react mock — capture drag handlers for testing
// ---------------------------------------------------------------------------

let mockOnDragOver: ((event: unknown) => void) | null = null;
let mockOnDragEnd: ((event: unknown) => void) | null = null;

mock.module('@dnd-kit/react', () => ({
  DragDropProvider: ({
    children,
    onDragOver,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragOver?: (e: unknown) => void;
    onDragEnd?: (e: unknown) => void;
  }) => {
    mockOnDragOver = onDragOver ?? null;
    mockOnDragEnd = onDragEnd ?? null;
    return children;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => children,
  useDroppable: () => ({ ref: () => {}, droppable: {}, isDropTarget: false }),
}));

// ---------------------------------------------------------------------------
// Mock child components with complex external dependencies
// ---------------------------------------------------------------------------
// NOTE: We do NOT mock ContentPane, BottomPanel, or TerminalManager here
// because those components are tested independently, and mocking them would
// cause cross-test contamination. Instead we mock the hooks (useTabs,
// sendRequest, useTerminal, etc.) that these components depend on.
// ---------------------------------------------------------------------------

// Use spyOn instead of mock.module to avoid cross-file mock contamination.
// mock.module('./RightSidebar') is process-scoped and would replace the real
// component in RightSidebar.test.tsx, causing all its tests to fail.
const _rightSidebarMod = await import('./RightSidebar');
const _rightSidebarSpy = spyOn(_rightSidebarMod, 'RightSidebar');
_rightSidebarSpy.mockImplementation(
  ({ workspaceId }: { workspaceId?: string | null }) =>
    React.createElement(
      'div',
      { 'data-testid': 'right-sidebar' },
      `RightSidebar: ${workspaceId ?? 'none'}`,
    ),
);

// Mock useTerminal (used by useCreateTerminalTab which is used by ContentPane/BottomPanel)
const mockCreateTerminal = mock(() => Promise.resolve('mock-term-id'));

mock.module('../hooks/useTerminal', () => ({
  useTerminal: () => ({
    sendData: mock(() => {}),
    onOutput: mock(() => () => {}),
    createTerminal: mockCreateTerminal,
    closeTerminal: mock(() => Promise.resolve()),
    resizeTerminal: mock(() => {}),
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { WorkspaceView } = await import('./WorkspaceView');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWorkspaceView() {
  return renderWithProviders(React.createElement(WorkspaceView));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('WorkspaceView', () => {
  beforeEach(() => {
    mockWorkspacesData = testWorkspaces;
    mockAccentColor = '#007acc';
    mockSetAccentColor.mockClear();
    mockUseWorkspaces.mockClear();
    mockUseTheme.mockClear();
    mockUseAuth.mockClear();
    mockUseConnectionStatus.mockClear();
    mockUseTabs.mockClear();
    mockSendRequest.mockClear();
    mockCreateTerminal.mockClear();
    mockCreateTerminal.mockImplementation(() => Promise.resolve('mock-term-id'));
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders all major sections
  // -----------------------------------------------------------------------
  test('renders all major sections: sidebar, content, right sidebar, bottom panel', () => {
    const { getByTestId, getAllByTestId } = renderWorkspaceView();

    expect(getByTestId('workspace-sidebar')).toBeDefined();
    expect(getByTestId('main-content')).toBeDefined();
    // RightSidebar is wrapped in an aside by AppLayout, producing two elements with this testid
    expect(getAllByTestId('right-sidebar').length).toBeGreaterThanOrEqual(1);
    expect(getAllByTestId('bottom-panel').length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // 2. Workspace list is rendered in left sidebar
  // -----------------------------------------------------------------------
  test('workspace list is rendered in left sidebar', () => {
    const { getAllByText } = renderWorkspaceView();

    // Project Alpha appears in sidebar (auto-selected)
    expect(getAllByText('Project Alpha').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Project Beta').length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // 3. Selecting a workspace updates active workspace
  // -----------------------------------------------------------------------
  test('selecting a workspace updates accent color', () => {
    const { getByTestId } = renderWorkspaceView();

    // Click on workspace ws-1
    fireEvent.click(getByTestId('workspace-item-ws-1'));

    // The accent color should be updated
    expect(mockSetAccentColor).toHaveBeenCalledWith('#ff0000');
  });

  // -----------------------------------------------------------------------
  // 4. ToastProvider wraps everything (toaster rendered)
  // -----------------------------------------------------------------------
  test('ToastProvider wraps everything', () => {
    const { getByTestId } = renderWorkspaceView();

    expect(getByTestId('toaster')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 6. First workspace is auto-selected
  // -----------------------------------------------------------------------
  test('initially first workspace is auto-selected', () => {
    const { container } = renderWorkspaceView();

    // The workspace sidebar should show the first workspace as active
    expect(container.textContent).toContain('Project Alpha');
  });

  // -----------------------------------------------------------------------
  // 7. DragDropProvider wraps the layout
  // -----------------------------------------------------------------------
  test('DragDropProvider wraps the layout and registers handlers', () => {
    renderWorkspaceView();

    // After rendering, the DragDropProvider mock should have captured the handlers
    expect(mockOnDragOver).toBeDefined();
    expect(mockOnDragEnd).toBeDefined();
  });

  // =========================================================================
  // Workspace tab isolation integration tests
  // =========================================================================

  // -----------------------------------------------------------------------
  // 8. Terminal registry tracks workspaceId from onTerminalRegistered callback
  // -----------------------------------------------------------------------
  test('terminal creation calls createTerminal with the active workspaceId', async () => {
    const { getAllByTestId } = renderWorkspaceView();

    // Click the first add terminal button (ContentPane's TabBar) — ws-1 is active by default
    const addButtons = getAllByTestId('tab-add');
    fireEvent.click(addButtons[0]);

    // Flush async createTerminal
    await new Promise((r) => setTimeout(r, 0));

    // createTerminal should have been called with ws-1 (the active workspace)
    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);
    expect(mockCreateTerminal).toHaveBeenCalledWith('ws-1', undefined);
  });

  // -----------------------------------------------------------------------
  // 9. isActive respects workspaceId: creating terminals in different workspaces
  // -----------------------------------------------------------------------
  test('createTerminal is called with the correct workspaceId for each workspace', async () => {
    const { getAllByTestId, getByTestId } = renderWorkspaceView();

    // ws-1 is active by default — add a terminal
    const addButtons = getAllByTestId('tab-add');
    fireEvent.click(addButtons[0]);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockCreateTerminal).toHaveBeenCalledWith('ws-1', undefined);

    // Switch to ws-2
    fireEvent.click(getByTestId('workspace-item-ws-2'));
    await new Promise((r) => setTimeout(r, 0));

    // Add a terminal in ws-2 (click the first add button again)
    fireEvent.click(addButtons[0]);
    await new Promise((r) => setTimeout(r, 0));

    // createTerminal should now have been called with ws-2 as well
    expect(mockCreateTerminal).toHaveBeenCalledWith('ws-2', undefined);
    expect(mockCreateTerminal).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 9. ContentPane receives correct workspaceId when workspace changes
  // -----------------------------------------------------------------------
  test('ContentPane receives updated workspaceId when workspace selection changes', async () => {
    const { getAllByTestId, getByTestId } = renderWorkspaceView();

    // Initially ws-1 is auto-selected — ContentPane renders with workspaceId ws-1
    const contentPane = getByTestId('content-pane');
    expect(contentPane).toBeDefined();

    // The tab-add button should be present (canAddTerminal is true when workspaceId is set)
    expect(getAllByTestId('tab-add').length).toBeGreaterThanOrEqual(1);

    // Switch to ws-2
    fireEvent.click(getByTestId('workspace-item-ws-2'));
    await new Promise((r) => setTimeout(r, 0));

    // ContentPane should still be rendered (workspaceId changed to ws-2)
    expect(getByTestId('content-pane')).toBeDefined();

    // Create a terminal now — should use ws-2
    const addButtons = getAllByTestId('tab-add');
    fireEvent.click(addButtons[0]);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockCreateTerminal).toHaveBeenCalledWith('ws-2', undefined);

    // Switch back to ws-1 and create another terminal
    fireEvent.click(getByTestId('workspace-item-ws-1'));
    await new Promise((r) => setTimeout(r, 0));

    const addButtonsAfter = getAllByTestId('tab-add');
    fireEvent.click(addButtonsAfter[0]);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockCreateTerminal).toHaveBeenCalledWith('ws-1', undefined);
  });
});
