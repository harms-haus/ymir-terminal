/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock, spyOn } from 'bun:test';
import { render, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useDialog hooks (used by GitChangesSection for confirm dialogs)
// ---------------------------------------------------------------------------

mock.module('../hooks/useDialog', () => ({
  useConfirm: () => async () => true,
  usePrompt: () => async () => null,
}));

// ---------------------------------------------------------------------------
// Mock send-request — the GitPanel's hook (useGitRepos) uses it for all
// communication with the backend.
// ---------------------------------------------------------------------------

mock.module('../lib/send-request', () => ({
  sendRequest: mock(() => Promise.resolve({})),
}));

const sendRequestModule = await import('../lib/send-request');
const sendRequestSpy = spyOn(sendRequestModule, 'sendRequest');

// ---------------------------------------------------------------------------
// Mock sonner — GitRepoHeader uses toast.info for unimplemented features
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

const { GitPanel } = await import('./GitPanel');

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

const mockStatus = {
  branch: 'main',
  changes: [
    { path: 'src/new.ts', status: '??' },
    { path: 'README.md', status: 'M' },
  ],
  staged: [{ path: 'src/app.ts', status: 'A' }],
  hasRemote: true,
  ahead: 0,
  behind: 0,
  repoPath: '.',
};

const mockBranches = {
  branches: [
    { name: 'main', isCurrent: true, isRemote: false },
    { name: 'develop', isCurrent: false, isRemote: false },
  ],
  current: 'main',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupMockResponses(responses: Record<string, any>) {
  sendRequestSpy.mockImplementation((channel: string) => {
    if (responses[channel]) return Promise.resolve(responses[channel]);
    return Promise.resolve({});
  });
}

function renderGitPanel(props = {}) {
  return render(
    React.createElement(GitPanel, {
      workspaceId: 'ws-1',
      workspaceCwd: '/project',
      ...props,
    }),
  );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitPanel', () => {
  afterEach(() => {
    cleanup();
    sendRequestSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // 1. Renders git panel with repo info when repos discovered
  // -----------------------------------------------------------------------
  test('renders git panel with repo info when repos discovered', async () => {
    setupMockResponses({
      'git.repoDiscovery': { repos: [mockRepoInfo] },
      'git.status': mockStatus,
      'git.branches': mockBranches,
    });

    const { getByTestId, getByText } = renderGitPanel();

    await waitFor(() => {
      expect(getByTestId('git-panel')).toBeTruthy();
    });

    // Repo header shows the repo name
    expect(getByTestId('git-repo-header')).toBeTruthy();
    expect(getByText('project')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Shows 'Not a git repository' when no repos
  // -----------------------------------------------------------------------
  test('shows not a git repository when no repos', async () => {
    setupMockResponses({
      'git.repoDiscovery': { repos: [] },
    });

    const { getByText } = renderGitPanel();

    await waitFor(() => {
      expect(getByText('Not a git repository')).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Shows 'No workspace selected' when workspaceId is null
  // -----------------------------------------------------------------------
  test('shows no workspace selected when workspaceId is null', () => {
    setupMockResponses({});

    const { getByText } = renderGitPanel({ workspaceId: null });

    expect(getByText('No workspace selected')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 4. Shows loading state while discovering
  // -----------------------------------------------------------------------
  test('shows loading state while discovering', async () => {
    // Return a promise that never resolves so loading stays true
    let resolveDiscovery: (v: unknown) => void;
    const pendingDiscovery = new Promise((resolve) => {
      resolveDiscovery = resolve;
    });

    sendRequestSpy.mockImplementation((() => pendingDiscovery) as () => Promise<unknown>);

    const { getByText } = renderGitPanel();

    await waitFor(() => {
      expect(getByText('Loading...')).toBeTruthy();
    });

    // Resolve so the component can unmount cleanly
    resolveDiscovery!({ repos: [] });
  });

  // -----------------------------------------------------------------------
  // 5. Renders commit input with data-testid git-commit-input
  // -----------------------------------------------------------------------
  test('renders commit input with data-testid git-commit-input', async () => {
    setupMockResponses({
      'git.repoDiscovery': { repos: [mockRepoInfo] },
      'git.status': mockStatus,
      'git.branches': mockBranches,
    });

    const { getByTestId } = renderGitPanel();

    await waitFor(() => {
      expect(getByTestId('git-commit-input')).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Renders staged and unstaged sections
  // -----------------------------------------------------------------------
  test('renders staged and unstaged sections', async () => {
    setupMockResponses({
      'git.repoDiscovery': { repos: [mockRepoInfo] },
      'git.status': mockStatus,
      'git.branches': mockBranches,
    });

    const { getByTestId } = renderGitPanel();

    await waitFor(() => {
      expect(getByTestId('git-staged-section')).toBeTruthy();
      expect(getByTestId('git-unstaged-section')).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Displays file changes in the tree
  // -----------------------------------------------------------------------
  test('displays file changes in the tree', async () => {
    setupMockResponses({
      'git.repoDiscovery': { repos: [mockRepoInfo] },
      'git.status': mockStatus,
      'git.branches': mockBranches,
    });

    const { getByTestId, getByText } = renderGitPanel();

    await waitFor(() => {
      // Both staged (src/app.ts) and unstaged (src/new.ts) create a src dir
      // so there are two change-dir-src elements — use getByTestId for file nodes
      expect(getByTestId('change-file-src/new.ts')).toBeTruthy();
      expect(getByTestId('change-file-README.md')).toBeTruthy();
      expect(getByTestId('change-file-src/app.ts')).toBeTruthy();
    });

    // Verify the file name labels are rendered (basenames)
    expect(getByText('new.ts')).toBeTruthy();
    expect(getByText('app.ts')).toBeTruthy();
    expect(getByText('README.md')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 8. Multi-repo scenario shows multiple repo headers
  // -----------------------------------------------------------------------
  test('multi-repo scenario shows multiple repo headers', async () => {
    const repo1 = {
      path: 'frontend',
      name: 'frontend',
      branch: 'main',
      hasRemote: true,
      ahead: 0,
      behind: 0,
    };
    const repo2 = {
      path: 'backend',
      name: 'backend',
      branch: 'develop',
      hasRemote: false,
      ahead: 1,
      behind: 2,
    };

    setupMockResponses({
      'git.repoDiscovery': { repos: [repo1, repo2] },
      'git.status': mockStatus,
      'git.branches': mockBranches,
    });

    const { getAllByTestId, getByText } = renderGitPanel();

    await waitFor(() => {
      const headers = getAllByTestId('git-repo-header');
      expect(headers.length).toBe(2);
    });

    expect(getByText('frontend')).toBeTruthy();
    expect(getByText('backend')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 9. Error display when request fails
  // -----------------------------------------------------------------------
  test('error display when request fails', async () => {
    sendRequestSpy.mockImplementation(() => {
      throw new Error('Network failure');
    });

    // Even on error, the component renders the panel with the error message.
    // The hook catches the error and sets git.error.
    // But sendRequest throwing means the discovery promise rejects.
    // The hook catches it with setError. However the repos array stays empty,
    // so it will show "Not a git repository" unless repos were already loaded.
    // Let's first resolve discovery with repos, then fail on status.
    sendRequestSpy.mockImplementation(((channel: string) => {
      if (channel === 'git.repoDiscovery') {
        return Promise.resolve({ repos: [mockRepoInfo] });
      }
      return Promise.reject(new Error('Network failure'));
    }) as (channel: string) => Promise<unknown>);

    const { getByText } = renderGitPanel();

    await waitFor(() => {
      expect(getByText('Network failure')).toBeTruthy();
    });
  });
});
