/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import type { GitWorktreeInfo } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock sub-components to test WorkspaceItem in isolation
// ---------------------------------------------------------------------------

mock.module('./WorkspaceItemContextMenu', () => ({
  WorkspaceItemContextMenu: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'mock-ws-ctx-menu' }, children),
}));

mock.module('./WorktreeItemContextMenu', () => ({
  WorktreeItemContextMenu: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'mock-wt-ctx-menu' }, children),
}));

mock.module('./WorktreeItem', () => ({
  WorktreeItem: ({
    worktree,
    isActive,
    onClick,
  }: {
    worktree: GitWorktreeInfo;
    workspaceId: string;
    wtIndex: number;
    isActive: boolean;
    onClick: () => void;
    onCopyPath: () => void;
    onRemove: () => void;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': `mock-wt-item-${worktree.path.replace(/\//g, '-')}`,
        role: 'button',
        onClick,
        style: { background: isActive ? '#37373d' : 'transparent' },
      },
      worktree.isDetached ? 'detached' : worktree.branch,
    ),
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

const { WorkspaceItem } = await import('./WorkspaceItem');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testWorkspace = {
  id: 'ws-1',
  name: 'Project Alpha',
  cwd: '/home/user/alpha',
  color: '#ff0000',
};

const mainWorktree: GitWorktreeInfo = {
  path: '/home/user/alpha',
  branch: 'main',
  isMain: true,
  isDetached: false,
};

const linkedWorktree1: GitWorktreeInfo = {
  path: '/home/user/alpha-wt-feature',
  branch: 'feature-branch',
  isMain: false,
  isDetached: false,
};

const linkedWorktree2: GitWorktreeInfo = {
  path: '/home/user/alpha-wt-fix',
  branch: 'fix-bug',
  isMain: false,
  isDetached: false,
};

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    workspace: testWorkspace,
    wsIndex: 0,
    isActive: false,
    worktrees: [mainWorktree] as GitWorktreeInfo[],
    activeWorktreePath: null as string | null,
    isExpanded: false,
    onSelect: mock(() => {}),
    onToggleExpand: mock(() => {}),
    onRename: mock((_id: string, _newName: string) => {}),
    onSetCwd: mock((_id: string, _newCwd: string) => {}),
    onRemove: mock((_id: string) => {}),
    onChangeColor: mock((_id: string, _newColor: string) => {}),
    onWorktreeSelect: mock((_path: string) => {}),
    onCopyWorktreePath: mock((_path: string) => {}),
    onRemoveWorktree: mock((_path: string) => {}),
    ...overrides,
  };
}

function renderWorkspaceItem(props: Record<string, unknown> = {}) {
  const allProps = defaultProps(props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = render(React.createElement(WorkspaceItem, allProps as any));
  return { ...result, props: allProps };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('WorkspaceItem', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders workspace name
  // -----------------------------------------------------------------------
  test('renders workspace name', () => {
    const { getByText } = renderWorkspaceItem();

    expect(getByText('Project Alpha')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Renders workspace cwd
  // -----------------------------------------------------------------------
  test('renders workspace cwd', () => {
    const { getByText } = renderWorkspaceItem();

    expect(getByText('/home/user/alpha')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. No chevron when workspace has only main worktree
  // -----------------------------------------------------------------------
  test('does not show chevron when workspace has only main worktree', () => {
    const { queryByTestId } = renderWorkspaceItem({
      worktrees: [mainWorktree],
    });

    expect(queryByTestId('ws-expand-ws-1')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 4. Shows expand chevron when workspace has linked worktrees
  // -----------------------------------------------------------------------
  test('shows expand chevron when workspace has linked worktrees', () => {
    const { getByTestId } = renderWorkspaceItem({
      worktrees: [mainWorktree, linkedWorktree1],
    });

    const chevron = getByTestId('ws-expand-ws-1');
    expect(chevron).toBeTruthy();
    expect(chevron.textContent).toBe('▶'); // collapsed state
  });

  // -----------------------------------------------------------------------
  // 5. Chevron shows ▼ when expanded
  // -----------------------------------------------------------------------
  test('chevron shows ▼ when expanded', () => {
    const { getByTestId } = renderWorkspaceItem({
      worktrees: [mainWorktree, linkedWorktree1],
      isExpanded: true,
    });

    const chevron = getByTestId('ws-expand-ws-1');
    expect(chevron.textContent).toBe('▼');
  });

  // -----------------------------------------------------------------------
  // 6. Clicking chevron calls onToggleExpand
  // -----------------------------------------------------------------------
  test('clicking chevron calls onToggleExpand', () => {
    const onToggleExpand = mock(() => {});
    const { getByTestId } = renderWorkspaceItem({
      worktrees: [mainWorktree, linkedWorktree1],
      onToggleExpand,
    });

    fireEvent.click(getByTestId('ws-expand-ws-1'));

    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 7. Keyboard Enter on chevron calls onToggleExpand
  // -----------------------------------------------------------------------
  test('keyboard Enter on chevron calls onToggleExpand', () => {
    const onToggleExpand = mock(() => {});
    const { getByTestId } = renderWorkspaceItem({
      worktrees: [mainWorktree, linkedWorktree1],
      onToggleExpand,
    });

    fireEvent.keyDown(getByTestId('ws-expand-ws-1'), { key: 'Enter' });

    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 8. Keyboard Space on chevron calls onToggleExpand
  // -----------------------------------------------------------------------
  test('keyboard Space on chevron calls onToggleExpand', () => {
    const onToggleExpand = mock(() => {});
    const { getByTestId } = renderWorkspaceItem({
      worktrees: [mainWorktree, linkedWorktree1],
      onToggleExpand,
    });

    fireEvent.keyDown(getByTestId('ws-expand-ws-1'), { key: ' ' });

    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 9. When expanded, renders worktree sub-items
  // -----------------------------------------------------------------------
  test('when expanded, renders worktree sub-items', () => {
    const { getByText, getByTestId } = renderWorkspaceItem({
      worktrees: [mainWorktree, linkedWorktree1, linkedWorktree2],
      isExpanded: true,
    });

    // The worktree list container should be rendered
    expect(getByTestId('ws-worktrees-ws-1')).toBeTruthy();

    // Linked worktree branch names should be visible (via mock WorktreeItem)
    expect(getByText('feature-branch')).toBeTruthy();
    expect(getByText('fix-bug')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 10. Not expanded does not render worktree sub-items
  // -----------------------------------------------------------------------
  test('not expanded does not render worktree sub-items', () => {
    const { queryByTestId, queryByText } = renderWorkspaceItem({
      worktrees: [mainWorktree, linkedWorktree1],
      isExpanded: false,
    });

    expect(queryByTestId('ws-worktrees-ws-1')).toBeNull();
    expect(queryByText('feature-branch')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 11. Clicking workspace row calls onSelect
  // -----------------------------------------------------------------------
  test('clicking workspace row calls onSelect', () => {
    const onSelect = mock(() => {});
    const { getByTestId } = renderWorkspaceItem({ onSelect });

    fireEvent.click(getByTestId('workspace-item-ws-1'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('ws-1');
  });

  // -----------------------------------------------------------------------
  // 12. Active workspace has highlighted background
  // -----------------------------------------------------------------------
  test('active workspace has highlighted background', () => {
    const { getByTestId } = renderWorkspaceItem({ isActive: true });
    const el = getByTestId('workspace-item-ws-1') as HTMLElement;

    expect(el.style.background).toBe('#37373d');
  });

  // -----------------------------------------------------------------------
  // 13. Inactive workspace has transparent background
  // -----------------------------------------------------------------------
  test('inactive workspace has transparent background', () => {
    const { getByTestId } = renderWorkspaceItem({ isActive: false });
    const el = getByTestId('workspace-item-ws-1') as HTMLElement;

    expect(el.style.background).toBe('transparent');
  });

  // -----------------------------------------------------------------------
  // 14. Color dot reflects workspace color
  // -----------------------------------------------------------------------
  test('color dot reflects workspace color', () => {
    const { getByTestId } = renderWorkspaceItem();

    const dot = getByTestId('ws-color-ws-1') as HTMLElement;
    expect(dot.style.background).toBe('#ff0000');
  });

  // -----------------------------------------------------------------------
  // 15. Chevron click does not bubble to workspace select
  // -----------------------------------------------------------------------
  test('chevron click does not bubble to workspace select', () => {
    const onSelect = mock(() => {});
    const onToggleExpand = mock(() => {});
    const { getByTestId } = renderWorkspaceItem({
      worktrees: [mainWorktree, linkedWorktree1],
      onSelect,
      onToggleExpand,
    });

    fireEvent.click(getByTestId('ws-expand-ws-1'));

    // onToggleExpand should be called, but onSelect should NOT
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 16. Has correct aria-label
  // -----------------------------------------------------------------------
  test('has correct aria-label', () => {
    const { getByTestId } = renderWorkspaceItem();

    const el = getByTestId('workspace-item-ws-1');
    expect(el.getAttribute('aria-label')).toBe('Workspace: Project Alpha');
  });

  // -----------------------------------------------------------------------
  // 17. Worktree sub-item click calls onWorktreeSelect
  // -----------------------------------------------------------------------
  test('worktree sub-item click calls onWorktreeSelect', () => {
    const onWorktreeSelect = mock(() => {});
    const { getByText } = renderWorkspaceItem({
      worktrees: [mainWorktree, linkedWorktree1],
      isExpanded: true,
      onWorktreeSelect,
    });

    // Click the branch name text rendered by the mock WorktreeItem
    fireEvent.click(getByText('feature-branch'));

    expect(onWorktreeSelect).toHaveBeenCalledTimes(1);
    expect(onWorktreeSelect).toHaveBeenCalledWith('/home/user/alpha-wt-feature');
  });
});
