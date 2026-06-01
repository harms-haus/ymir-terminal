/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import type { GitWorktreeInfo } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

const { WorktreeItem } = await import('./WorktreeItem');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockWorktree: GitWorktreeInfo = {
  path: '/path/to/worktree',
  branch: 'feature-branch',
  isMain: false,
  isDetached: false,
};

const detachedWorktree: GitWorktreeInfo = {
  path: '/path/to/detached',
  branch: null,
  isMain: false,
  isDetached: true,
};

function renderWorktreeItem(
  overrides: {
    worktree?: GitWorktreeInfo;
    isActive?: boolean;
    workspaceId?: string;
    wtIndex?: number;
    onClick?: () => void;
    onCopyPath?: () => void;
    onRemove?: () => void;
  } = {},
) {
  const onClick = overrides.onClick ?? mock(() => {});
  const onCopyPath = overrides.onCopyPath ?? mock(() => {});
  const onRemove = overrides.onRemove ?? mock(() => {});

  const result = render(
    React.createElement(WorktreeItem, {
      worktree: overrides.worktree ?? mockWorktree,
      workspaceId: overrides.workspaceId ?? 'ws-1',
      wtIndex: overrides.wtIndex ?? 0,
      isActive: overrides.isActive ?? false,
      onClick,
      onCopyPath,
      onRemove,
    }),
  );

  return { ...result, onClick, onCopyPath, onRemove };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('WorktreeItem', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders branch name
  // -----------------------------------------------------------------------
  test('renders branch name', () => {
    const { getByText } = renderWorktreeItem();

    expect(getByText('feature-branch')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Renders worktree path
  // -----------------------------------------------------------------------
  test('renders worktree path', () => {
    const { getByText } = renderWorktreeItem();

    expect(getByText('/path/to/worktree')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Clicking calls onClick
  // -----------------------------------------------------------------------
  test('clicking calls onClick', () => {
    const onClick = mock(() => {});
    const { getByRole } = renderWorktreeItem({ onClick });

    fireEvent.click(getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 4. Keyboard Enter triggers onClick
  // -----------------------------------------------------------------------
  test('keyboard Enter triggers onClick', () => {
    const onClick = mock(() => {});
    const { getByRole } = renderWorktreeItem({ onClick });

    fireEvent.keyDown(getByRole('button'), { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 5. Keyboard Space triggers onClick
  // -----------------------------------------------------------------------
  test('keyboard Space triggers onClick', () => {
    const onClick = mock(() => {});
    const { getByRole } = renderWorktreeItem({ onClick });

    fireEvent.keyDown(getByRole('button'), { key: ' ' });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 6. Shows "detached" when isDetached is true
  // -----------------------------------------------------------------------
  test('shows detached when isDetached is true', () => {
    const { getByText } = renderWorktreeItem({ worktree: detachedWorktree });

    expect(getByText('detached')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 7. Active item has highlighted background
  // -----------------------------------------------------------------------
  test('active item has highlighted background', () => {
    const { getByRole } = renderWorktreeItem({ isActive: true });
    const button = getByRole('button') as HTMLElement;

    expect(button.style.background).toBe('#37373d');
  });

  // -----------------------------------------------------------------------
  // 8. Inactive item has transparent background
  // -----------------------------------------------------------------------
  test('inactive item has transparent background', () => {
    const { getByRole } = renderWorktreeItem({ isActive: false });
    const button = getByRole('button') as HTMLElement;

    expect(button.style.background).toBe('transparent');
  });

  // -----------------------------------------------------------------------
  // 9. Has correct aria-label for branch worktree
  // -----------------------------------------------------------------------
  test('has correct aria-label for branch worktree', () => {
    const { getByRole } = renderWorktreeItem();

    expect(getByRole('button').getAttribute('aria-label')).toBe('Worktree: feature-branch');
  });

  // -----------------------------------------------------------------------
  // 10. Has correct aria-label for detached worktree
  // -----------------------------------------------------------------------
  test('has correct aria-label for detached worktree', () => {
    const { getByRole } = renderWorktreeItem({ worktree: detachedWorktree });

    expect(getByRole('button').getAttribute('aria-label')).toBe('Worktree: detached');
  });

  // -----------------------------------------------------------------------
  // 11. Has correct data-testid based on path
  // -----------------------------------------------------------------------
  test('has correct data-testid based on path', () => {
    const { getByTestId } = renderWorktreeItem();

    expect(getByTestId('worktree-item--path-to-worktree')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 12. Renders the branch icon (⑂)
  // -----------------------------------------------------------------------
  test('renders the branch icon', () => {
    const { getByText } = renderWorktreeItem();

    expect(getByText('⑂')).toBeTruthy();
  });
});
