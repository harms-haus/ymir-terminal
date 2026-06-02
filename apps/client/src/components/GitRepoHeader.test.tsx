/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import type { UseGitReposReturn } from '../hooks/useGitRepos';

// ---------------------------------------------------------------------------
// Mock useDialog hooks — GitRepoMenu (used inside GitRepoHeader) uses them
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

const { GitRepoHeader } = await import('./GitRepoHeader');

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockRepoInfo = {
  path: '.',
  name: 'my-project',
  branch: 'main',
  hasRemote: true,
  ahead: 0,
  behind: 0,
};

const mockBranches = [
  { name: 'main', isCurrent: true, isRemote: false },
  { name: 'develop', isCurrent: false, isRemote: false },
];

const noop = async () => {};

function createMockGitOps(): UseGitReposReturn {
  return {
    repos: [mockRepoInfo],
    repoStatuses: new Map(),
    repoBranches: new Map([['.', mockBranches]]),
    loading: false,
    error: null,
    refresh: () => {},
    refreshRepo: () => {},
    stageFiles: noop,
    unstageFiles: noop,
    discardChanges: noop,
    commit: noop,
    checkout: noop,
    push: noop,
    fetch: noop,
    pushLoading: new Map(),
    fetchLoading: new Map(),
    stashPush: noop,
    stashList: async () => [],
    stashApply: noop,
    stashPop: noop,
    stashDrop: noop,
    stashClear: noop,
    pull: noop,
    sync: noop,
    merge: async () => '',
    rebase: async () => '',
    rebaseAbort: noop,
    isRebaseInProgress: async () => false,
    commitAmend: async () => '',
    commitAll: async () => '',
    resetSoft: noop,
    stageAll: noop,
    unstageAll: noop,
    discardAll: noop,
    branchRename: noop,
    branchDelete: noop,
    branchDeleteRemote: noop,
    branchPublish: noop,
    listRemoteBranches: async () => [],
    createBranchFrom: noop,
    remoteList: async () => [],
    remoteAdd: noop,
    remoteRemove: noop,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderGitRepoHeader(overrides: Record<string, unknown> = {}) {
  const gitOps = (overrides.gitOps as UseGitReposReturn) ?? createMockGitOps();

  return render(
    React.createElement(GitRepoHeader, {
      repoInfo: mockRepoInfo,
      branches: mockBranches,
      gitOps,
      onCheckout: () => {},
      onCreateBranch: () => {},
      onPush: () => {},
      onFetch: () => {},
      ...overrides,
    }),
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

describe('GitRepoHeader', () => {
  // -----------------------------------------------------------------------
  // 1. Renders repo name and branch selector
  // -----------------------------------------------------------------------
  test('renders repo name and branch selector', () => {
    const { getByText, getByTestId } = renderGitRepoHeader();

    expect(getByText('my-project')).toBeTruthy();
    expect(getByTestId('git-branch-selector')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Renders ⋯ more button
  // -----------------------------------------------------------------------
  test('renders more actions button', () => {
    const { getByTestId } = renderGitRepoHeader();

    expect(getByTestId('git-more-menu')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Clicking ⋯ opens dropdown with submenu labels
  // -----------------------------------------------------------------------
  test('clicking more button opens dropdown with submenu labels', () => {
    const { getByTestId } = renderGitRepoHeader();

    // Click the more button to open the dropdown
    fireEvent.click(getByTestId('git-more-menu'));

    // The dropdown content is always rendered by the mock;
    // verify key submenu testIds are present
    expect(getByTestId('git-repo-menu-commit-sub')).toBeTruthy();
    expect(getByTestId('git-repo-menu-changes-sub')).toBeTruthy();
    expect(getByTestId('git-repo-menu-branch-sub')).toBeTruthy();
    expect(getByTestId('git-repo-menu-stash-sub')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 4. Renders fetch and push buttons when repo has remote
  // -----------------------------------------------------------------------
  test('renders fetch and push buttons when repo has remote', () => {
    const { getByTestId } = renderGitRepoHeader();

    expect(getByTestId('git-fetch-button')).toBeTruthy();
    expect(getByTestId('git-push-button')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 5. Does not render fetch/push buttons when no remote
  // -----------------------------------------------------------------------
  test('does not render fetch/push buttons when no remote', () => {
    const noRemoteRepo = {
      path: '.',
      name: 'local-only',
      branch: 'main',
      hasRemote: false,
      ahead: 0,
      behind: 0,
    };

    const { queryByTestId, getByText } = renderGitRepoHeader({
      repoInfo: noRemoteRepo,
    });

    expect(queryByTestId('git-fetch-button')).toBeNull();
    expect(queryByTestId('git-push-button')).toBeNull();
    // Still shows the repo name
    expect(getByText('local-only')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 6. Renders git graph button
  // -----------------------------------------------------------------------
  test('renders git graph button', () => {
    const { getByTestId } = renderGitRepoHeader();

    expect(getByTestId('git-graph-button')).toBeTruthy();
  });
});
