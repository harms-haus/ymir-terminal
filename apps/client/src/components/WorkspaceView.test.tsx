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
// Mock @dnd-kit
// ---------------------------------------------------------------------------

let mockOnDragOver: ((event: unknown) => void) | null = null;
let mockOnDragEnd: ((event: unknown) => void) | null = null;

mock.module('@dnd-kit/react', () => ({
  DragDropProvider: ({ children, onDragOver, onDragEnd }: { children: React.ReactNode; onDragOver?: (e: unknown) => void; onDragEnd?: (e: unknown) => void }) => {
    mockOnDragOver = onDragOver ?? null;
    mockOnDragEnd = onDragEnd ?? null;
    return children;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => children,
  useDroppable: () => ({ ref: () => {}, droppable: {}, isDropTarget: false }),
}));

mock.module('@dnd-kit/react/sortable', () => ({
  useSortable: () => ({
    ref: () => {},
    isDragging: false,
    isDropping: false,
    isDragSource: false,
    isDropTarget: false,
    sortable: {},
    handleRef: () => {},
    sourceRef: () => {},
    targetRef: () => {},
  }),
}));

mock.module('@dnd-kit/helpers', () => ({
  move: (items: unknown[]) => items,
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
  test('renders all major sections: sidebar, content, right sidebar, bottom panel', () => {
    const { getByTestId, getAllByTestId } = renderWorkspaceView();

    expect(getByTestId('workspace-sidebar')).toBeTruthy();
    expect(getByTestId('main-content')).toBeTruthy();
    expect(getByTestId('right-sidebar')).toBeTruthy();
    // BottomPanel component renders inside AppLayout's bottom-panel slot,
    // so there are two elements with this testid (wrapper + component)
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
    expect(mockOnDragOver).toBeTruthy();
    expect(mockOnDragEnd).toBeTruthy();
  });
});
