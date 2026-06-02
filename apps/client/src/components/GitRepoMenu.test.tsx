/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useDialog hooks — GitRepoMenu uses confirm/prompt for many actions
// ---------------------------------------------------------------------------

mock.module('../hooks/useDialog', () => ({
  useConfirm: () => async () => true,
  usePrompt: () => async () => null,
}));

// ---------------------------------------------------------------------------
// Mock sonner — GitRepoMenu uses toast for feedback
// ---------------------------------------------------------------------------

mock.module('sonner', () => ({
  toast: {
    info: mock(() => {}),
    error: mock(() => {}),
    success: mock(() => {}),
  },
}));

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------

const { GitRepoMenu } = await import('./GitRepoMenu');

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockRepoInfo = {
  path: '.',
  name: 'project',
  branch: 'main',
  hasRemote: true,
  ahead: 0,
  behind: 0,
};

const mockBranches = [
  { name: 'main', isCurrent: true, isRemote: false },
  { name: 'develop', isCurrent: false, isRemote: false },
  { name: 'feature/x', isCurrent: false, isRemote: false },
];

const noop = async () => {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderGitRepoMenu() {
  return render(
    React.createElement(
      GitRepoMenu,
      {
        repoInfo: mockRepoInfo,
        branches: mockBranches,
        status: undefined,
        isRebaseInProgress: false,
        onPull: noop,
        onPush: noop,
        onFetch: noop,
        onSync: noop,
        onCommitAmend: noop,
        onCommitAll: noop,
        onResetSoft: noop,
        onRebaseAbort: noop,
        onStageAll: noop,
        onUnstageAll: noop,
        onDiscardAll: noop,
        onMerge: noop,
        onRebase: noop,
        onCreateBranch: noop,
        onCreateBranchFrom: noop,
        onRenameBranch: noop,
        onDeleteBranch: noop,
        onDeleteRemoteBranch: noop,
        onPublishBranch: noop,
        onRemoteAdd: noop,
        onRemoteRemove: noop,
        onStashPush: noop,
        onStashApply: noop,
        onStashPop: noop,
        onStashDrop: noop,
        onStashClear: noop,
        onFetchStashList: noop,
        onFetchRemoteList: noop,
        onFetchRemoteBranches: noop,
      },
      React.createElement('button', { 'data-testid': 'trigger' }, '⋯'),
    ),
  );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitRepoMenu', () => {
  // -----------------------------------------------------------------------
  // Renders all submenu labels
  // -----------------------------------------------------------------------
  test('renders submenu labels: Commit, Changes, Pull Push, Branch, Remote, Stash', () => {
    const { getByTestId } = renderGitRepoMenu();

    expect(getByTestId('git-repo-menu-commit-sub')).toBeTruthy();
    expect(getByTestId('git-repo-menu-changes-sub')).toBeTruthy();
    expect(getByTestId('git-repo-menu-pull-push-sub')).toBeTruthy();
    expect(getByTestId('git-repo-menu-branch-sub')).toBeTruthy();
    expect(getByTestId('git-repo-menu-remote-sub')).toBeTruthy();
    expect(getByTestId('git-repo-menu-stash-sub')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Verify key items exist inside submenus
  // -----------------------------------------------------------------------
  test('renders key items in submenus', () => {
    const { getByTestId } = renderGitRepoMenu();

    // Commit submenu items
    expect(getByTestId('git-repo-menu-commit')).toBeTruthy();
    expect(getByTestId('git-repo-menu-commit-staged')).toBeTruthy();
    expect(getByTestId('git-repo-menu-commit-all')).toBeTruthy();
    expect(getByTestId('git-repo-menu-undo-commit')).toBeTruthy();
    expect(getByTestId('git-repo-menu-abort-rebase')).toBeTruthy();
    expect(getByTestId('git-repo-menu-commit-amend')).toBeTruthy();

    // Changes submenu items
    expect(getByTestId('git-repo-menu-stage-all')).toBeTruthy();
    expect(getByTestId('git-repo-menu-unstage-all')).toBeTruthy();
    expect(getByTestId('git-repo-menu-discard-all')).toBeTruthy();

    // Pull, Push submenu items
    expect(getByTestId('git-repo-menu-sync')).toBeTruthy();
    expect(getByTestId('git-repo-menu-pull')).toBeTruthy();
    expect(getByTestId('git-repo-menu-pull-rebase')).toBeTruthy();
    expect(getByTestId('git-repo-menu-push')).toBeTruthy();
    expect(getByTestId('git-repo-menu-fetch')).toBeTruthy();

    // Branch submenu items
    expect(getByTestId('git-repo-menu-merge')).toBeTruthy();
    expect(getByTestId('git-repo-menu-rebase')).toBeTruthy();
    expect(getByTestId('git-repo-menu-branch-create')).toBeTruthy();
    expect(getByTestId('git-repo-menu-branch-create-from')).toBeTruthy();
    expect(getByTestId('git-repo-menu-branch-rename')).toBeTruthy();
    expect(getByTestId('git-repo-menu-branch-delete')).toBeTruthy();
    expect(getByTestId('git-repo-menu-branch-delete-remote')).toBeTruthy();
    expect(getByTestId('git-repo-menu-branch-publish')).toBeTruthy();

    // Remote submenu items
    expect(getByTestId('git-repo-menu-remote-add')).toBeTruthy();
    expect(getByTestId('git-repo-menu-remote-remove')).toBeTruthy();

    // Stash submenu items
    expect(getByTestId('git-repo-menu-stash-push')).toBeTruthy();
    expect(getByTestId('git-repo-menu-stash-push-all')).toBeTruthy();
    expect(getByTestId('git-repo-menu-stash-apply-latest')).toBeTruthy();
    expect(getByTestId('git-repo-menu-stash-apply')).toBeTruthy();
    expect(getByTestId('git-repo-menu-stash-pop-latest')).toBeTruthy();
    expect(getByTestId('git-repo-menu-stash-pop')).toBeTruthy();
    expect(getByTestId('git-repo-menu-stash-drop')).toBeTruthy();
    expect(getByTestId('git-repo-menu-stash-clear')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Verify destructive items are labeled correctly
  // -----------------------------------------------------------------------
  test('destructive items are rendered', () => {
    const { getByText } = renderGitRepoMenu();

    expect(getByText('Undo Last Commit')).toBeTruthy();
    expect(getByText('Discard All')).toBeTruthy();
    expect(getByText('Drop All Stashes...')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Abort Rebase is disabled when not rebasing
  // -----------------------------------------------------------------------
  test('abort rebase is disabled when not rebasing', () => {
    const { getByTestId } = renderGitRepoMenu();

    const el = getByTestId('git-repo-menu-abort-rebase');
    expect(el.getAttribute('aria-disabled')).toBe('true');
  });
});
