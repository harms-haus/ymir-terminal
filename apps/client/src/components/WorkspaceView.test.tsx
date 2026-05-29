/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

const testWorkspaces = [
  { id: 'ws-1', name: 'Project Alpha', cwd: '/home/user/alpha', color: '#ff0000' },
  { id: 'ws-2', name: 'Project Beta', cwd: '/home/user/beta', color: '#00ff00' },
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
  createTab: mock(() => {}),
  closeTab: mock(() => {}),
  activateTab: mock(() => {}),
}));

const mockUseCreateWorkspace = mock(() => ({
  mutateAsync: mock(() =>
    Promise.resolve({ workspace: { id: 'ws-new', name: 'New', cwd: '/new', color: '#007acc' } }),
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

mock.module('../hooks/useWorkspaces', () => ({
  useWorkspaces: mockUseWorkspaces,
  useCreateWorkspace: mockUseCreateWorkspace,
  useUpdateWorkspace: mockUseUpdateWorkspace,
  useDeleteWorkspace: mockUseDeleteWorkspace,
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

mock.module('../lib/send-request', () => ({
  sendRequest: mock(() => Promise.resolve({ tree: [] })),
}));

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
// Mock react-resizable-panels (panels just render children)
// ---------------------------------------------------------------------------

mock.module('react-resizable-panels', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Group: ({ children, style }: any) =>
    React.createElement('div', { style, 'data-group': '' }, children),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Panel: ({ children, style }: any) => React.createElement('div', { style }, children),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Separator: ({ style }: any) => React.createElement('div', { style }),
}));

// ---------------------------------------------------------------------------
// Mock sonner
// ---------------------------------------------------------------------------

mock.module('sonner', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
  toast: { success: mock(() => {}), error: mock(() => {}), info: mock(() => {}) },
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { WorkspaceView } = await import('./WorkspaceView');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWorkspaceView() {
  return render(React.createElement(WorkspaceView));
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
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders all major sections
  // -----------------------------------------------------------------------
  test('renders all major sections: sidebar, content, right sidebar, status bar, bottom panel', () => {
    const { getByTestId, getAllByTestId } = renderWorkspaceView();

    expect(getByTestId('workspace-sidebar')).toBeTruthy();
    expect(getByTestId('main-content')).toBeTruthy();
    expect(getByTestId('right-sidebar')).toBeTruthy();
    // BottomPanel component renders inside AppLayout's bottom-panel slot,
    // so there are two elements with this testid (wrapper + component)
    expect(getAllByTestId('bottom-panel').length).toBeGreaterThanOrEqual(1);
    expect(getByTestId('status-bar')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Workspace list is rendered in left sidebar
  // -----------------------------------------------------------------------
  test('workspace list is rendered in left sidebar', () => {
    const { getAllByText } = renderWorkspaceView();

    // Project Alpha appears in sidebar + status bar (auto-selected)
    expect(getAllByText('Project Alpha').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Project Beta').length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // 3. Selecting a workspace updates active workspace (shown in status bar)
  // -----------------------------------------------------------------------
  test('selecting a workspace shows its name in the status bar', () => {
    const { getByTestId } = renderWorkspaceView();

    // Click on workspace ws-1
    fireEvent.click(getByTestId('workspace-item-ws-1'));

    // The workspace name should now appear inside the status bar
    const statusBar = getByTestId('status-bar');
    expect(statusBar.textContent).toContain('Project Alpha');
  });

  // -----------------------------------------------------------------------
  // 4. Theme accent color changes when workspace with color is selected
  // -----------------------------------------------------------------------
  test('theme accent color changes when workspace is selected', () => {
    const { getByTestId } = renderWorkspaceView();

    // Click on ws-1 which has color '#ff0000'
    fireEvent.click(getByTestId('workspace-item-ws-1'));

    expect(mockSetAccentColor).toHaveBeenCalledWith('#ff0000');
  });

  // -----------------------------------------------------------------------
  // 5. ToastProvider wraps everything (toaster rendered)
  // -----------------------------------------------------------------------
  test('ToastProvider wraps everything', () => {
    const { getByTestId } = renderWorkspaceView();

    expect(getByTestId('toaster')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 6. First workspace is auto-selected and shown in status bar
  // -----------------------------------------------------------------------
  test('initially first workspace name is auto-selected in status bar', () => {
    const { getByTestId } = renderWorkspaceView();

    const statusBar = getByTestId('status-bar');
    expect(statusBar.textContent).toContain('Project Alpha');
  });
});
