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
// Mock useWorkspaces hook
// ---------------------------------------------------------------------------

let mockWorkspacesData:
  | Array<{ id: string; name: string; cwd: string; color: string }>
  | undefined = undefined;
let mockIsLoading = false;

const mockUseWorkspaces = mock(() => ({
  data: mockWorkspacesData,
  isLoading: mockIsLoading,
}));

mock.module('../hooks/useWorkspaces', () => ({
  useWorkspaces: mockUseWorkspaces,
}));

// ---------------------------------------------------------------------------
// Mock WorkspaceItem component
// ---------------------------------------------------------------------------

mock.module('./WorkspaceItem', () => ({
  WorkspaceItem: ({
    workspace,
    isActive,
    onSelect,
  }: {
    workspace: { id: string; name: string; color: string };
    isActive: boolean;
    onSelect: (id: string) => void;
  }) => {
    return React.createElement(
      'div',
      {
        'data-testid': `workspace-item-${workspace.id}`,
        onClick: () => onSelect(workspace.id),
        style: { background: isActive ? '#37373d' : 'transparent' },
      },
      [
        React.createElement('div', {
          key: 'dot',
          'data-testid': `ws-color-${workspace.id}`,
          style: { background: workspace.color },
        }),
        workspace.name,
      ],
    );
  },
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { WorkspaceSidebar } = await import('./WorkspaceSidebar');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testWorkspaces = [
  { id: 'ws-1', name: 'Project Alpha', cwd: '/home/user/alpha', color: '#ff0000' },
  { id: 'ws-2', name: 'Project Beta', cwd: '/home/user/beta', color: '#00ff00' },
  { id: 'ws-3', name: 'Project Gamma', cwd: '/home/user/gamma', color: '#0000ff' },
];

function renderSidebar(
  options: {
    activeWorkspaceId?: string | null;
    workspaces?: Array<{ id: string; name: string; cwd: string; color: string }>;
    isLoading?: boolean;
  } = {},
) {
  const { activeWorkspaceId = null, workspaces = testWorkspaces, isLoading = false } = options;

  mockWorkspacesData = workspaces;
  mockIsLoading = isLoading;
  mockUseWorkspaces.mockClear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onWorkspaceSelect: any = mock(() => {});
  const onAddWorkspace = mock(() => {});
  const onRenameWorkspace = mock(() => {});
  const onSetCwdWorkspace = mock(() => {});
  const onRemoveWorkspace = mock(() => {});
  const onChangeColorWorkspace = mock(() => {});

  const result = render(
    React.createElement(WorkspaceSidebar, {
      activeWorkspaceId,
      onWorkspaceSelect,
      onAddWorkspace,
      onRenameWorkspace,
      onSetCwdWorkspace,
      onRemoveWorkspace,
      onChangeColorWorkspace,
    }),
  );

  return { ...result, onWorkspaceSelect, onAddWorkspace };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('WorkspaceSidebar', () => {
  beforeEach(() => {
    mockWorkspacesData = undefined;
    mockIsLoading = false;
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders workspace list with names
  // -----------------------------------------------------------------------
  test('renders workspace list with names', () => {
    const { getByText } = renderSidebar();

    expect(getByText('Project Alpha')).toBeTruthy();
    expect(getByText('Project Beta')).toBeTruthy();
    expect(getByText('Project Gamma')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Each workspace shows a color indicator dot
  // -----------------------------------------------------------------------
  test('each workspace shows a color indicator dot', () => {
    const { getByTestId } = renderSidebar();

    const dot1 = getByTestId('ws-color-ws-1') as HTMLElement;
    const dot2 = getByTestId('ws-color-ws-2') as HTMLElement;
    const dot3 = getByTestId('ws-color-ws-3') as HTMLElement;

    expect(dot1.style.background).toBe('#ff0000');
    expect(dot2.style.background).toBe('#00ff00');
    expect(dot3.style.background).toBe('#0000ff');
  });

  // -----------------------------------------------------------------------
  // 3. Active workspace is highlighted
  // -----------------------------------------------------------------------
  test('active workspace is highlighted', () => {
    const { getByTestId } = renderSidebar({ activeWorkspaceId: 'ws-2' });

    const activeWs = getByTestId('workspace-item-ws-2') as HTMLElement;
    const inactiveWs = getByTestId('workspace-item-ws-1') as HTMLElement;

    expect(activeWs.style.background).toBe('#37373d');
    expect(inactiveWs.style.background).toBe('transparent');
  });

  // -----------------------------------------------------------------------
  // 4. Clicking a workspace sets it as active
  // -----------------------------------------------------------------------
  test('clicking a workspace calls onWorkspaceSelect', () => {
    const { getByTestId, onWorkspaceSelect } = renderSidebar();

    fireEvent.click(getByTestId('workspace-item-ws-2'));

    expect(onWorkspaceSelect).toHaveBeenCalledTimes(1);
    expect(onWorkspaceSelect).toHaveBeenCalledWith('ws-2');
  });

  // -----------------------------------------------------------------------
  // 5. 'Add workspace' button exists
  // -----------------------------------------------------------------------
  test('add workspace button exists', () => {
    const { getByTestId, onAddWorkspace } = renderSidebar();

    const btn = getByTestId('add-workspace-btn');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('+');

    fireEvent.click(btn);
    expect(onAddWorkspace).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 6. Shows empty state when no workspaces
  // -----------------------------------------------------------------------
  test('shows empty state when no workspaces', () => {
    const { getByText, queryByText } = renderSidebar({ workspaces: [] });

    expect(getByText('No workspaces')).toBeTruthy();
    // Workspace names should not be rendered
    expect(queryByText('Project Alpha')).toBeNull();
  });
});
