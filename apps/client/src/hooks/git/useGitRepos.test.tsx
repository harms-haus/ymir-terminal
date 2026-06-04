/// <reference lib="dom" />
import { setupTestDom } from '../../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { MessageEnvelope, GitRepoInfo } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

type MessageHandler = (envelope: MessageEnvelope) => void;
let messageHandlers: MessageHandler[] = [];

const mockOnMessage = mock((handler: MessageHandler) => {
  messageHandlers.push(handler);
  return () => {
    messageHandlers = messageHandlers.filter((h) => h !== handler);
  };
});

mock.module('../../lib/ws-client', () => ({
  wsClient: {
    onMessage: mockOnMessage,
  },
}));

// ---------------------------------------------------------------------------
// Mock send-request module
// ---------------------------------------------------------------------------

// We control these resolve functions to sequence the test flow.
let discoverResolve: ((value: unknown) => void) | null = null;

const sendRequestMock = mock((channel: string, _payload: unknown) => {
  if (channel === 'git.repoDiscovery') {
    return new Promise((resolve) => {
      discoverResolve = resolve;
    });
  }
  if (channel === 'git.status') {
    return Promise.resolve({
      branch: 'main',
      changes: [],
      staged: [],
      hasRemote: true,
      ahead: 0,
      behind: 0,
    });
  }
  if (channel === 'git.branches') {
    return Promise.resolve({
      branches: [{ name: 'main', isCurrent: true, isRemote: false }],
      current: 'main',
    });
  }
  return Promise.resolve({});
});

mock.module('../../lib/send-request', () => ({
  sendRequest: sendRequestMock,
}));

// Import after mocking
const { useGitRepos } = await import('./index');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simulateIncoming(envelope: MessageEnvelope) {
  for (const handler of [...messageHandlers]) {
    handler(envelope);
  }
}

function makeProgressEvent(
  workspaceId: string,
  repos: GitRepoInfo[],
  depth: number,
  done: boolean,
): MessageEnvelope {
  return {
    v: 1,
    type: 'event',
    channel: 'git.repoDiscovery.progress',
    payload: {
      workspaceId,
      repos,
      depth,
      done,
    },
  };
}

function makeRepo(path: string, name?: string): GitRepoInfo {
  return {
    path,
    name: name ?? path.split('/').pop() ?? path,
    branch: 'main',
    hasRemote: true,
    ahead: 0,
    behind: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('useGitRepos – progressive discovery', () => {
  beforeEach(() => {
    messageHandlers = [];
    mockOnMessage.mockClear();
    sendRequestMock.mockClear();
    discoverResolve = null;
  });

  afterEach(() => {
    messageHandlers = [];
    discoverResolve = null;
  });

  // -------------------------------------------------------------------------
  // a. Progressive repo addition
  // -------------------------------------------------------------------------
  test('progressively adds repos as progress events arrive', async () => {
    const { result } = renderHook(() => useGitRepos('ws-1', null));

    // Wait for loadData to fire the discovery request
    await waitFor(() => {
      expect(sendRequestMock).toHaveBeenCalledWith(
        'git.repoDiscovery',
        expect.anything(),
        expect.anything(),
      );
    });

    // --- Progress event with repoA at depth 1 ---
    const repoA = makeRepo('packages/a', 'a');
    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoA], 1, false));
    });

    await waitFor(() => {
      expect(result.current.repos).toHaveLength(1);
      expect(result.current.repos[0].path).toBe('packages/a');
    });

    // --- Progress event with repoB at depth 2 ---
    const repoB = makeRepo('packages/b', 'b');
    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoB], 2, false));
    });

    await waitFor(() => {
      expect(result.current.repos).toHaveLength(2);
      expect(result.current.repos.map((r) => r.path).sort()).toEqual(['packages/a', 'packages/b']);
    });

    // --- Resolve the final discovery response ---
    act(() => {
      discoverResolve?.({ repos: [repoA, repoB] });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.repos).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // b. Final response reconciliation (no prior progress events)
  // -------------------------------------------------------------------------
  test('sets repos from discovery response when no progress events arrive', async () => {
    const { result } = renderHook(() => useGitRepos('ws-1', null));

    await waitFor(() => {
      expect(sendRequestMock).toHaveBeenCalledWith(
        'git.repoDiscovery',
        expect.anything(),
        expect.anything(),
      );
    });

    const repoA = makeRepo('packages/a', 'a');
    const repoB = makeRepo('packages/b', 'b');

    act(() => {
      discoverResolve?.({ repos: [repoA, repoB] });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.repos).toHaveLength(2);
      expect(result.current.repos.map((r) => r.path).sort()).toEqual(['packages/a', 'packages/b']);
    });
  });

  // -------------------------------------------------------------------------
  // c. Workspace filtering
  // -------------------------------------------------------------------------
  test('ignores progress events for a different workspaceId', async () => {
    const { result } = renderHook(() => useGitRepos('ws-1', null));

    await waitFor(() => {
      expect(sendRequestMock).toHaveBeenCalledWith(
        'git.repoDiscovery',
        expect.anything(),
        expect.anything(),
      );
    });

    // Event for a different workspace – should be ignored
    const repoA = makeRepo('packages/a', 'a');
    act(() => {
      simulateIncoming(makeProgressEvent('ws-other', [repoA], 1, false));
    });

    expect(result.current.repos).toHaveLength(0);

    // Event for the correct workspace – should be accepted
    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoA], 1, false));
    });

    await waitFor(() => {
      expect(result.current.repos).toHaveLength(1);
      expect(result.current.repos[0].path).toBe('packages/a');
    });
  });

  // -------------------------------------------------------------------------
  // d. Stale event handling – after discovery completes, progress ignored
  // -------------------------------------------------------------------------
  test('ignores progress events after discovery completes until next refresh', async () => {
    const { result } = renderHook(() => useGitRepos('ws-1', null));

    await waitFor(() => {
      expect(sendRequestMock).toHaveBeenCalledWith(
        'git.repoDiscovery',
        expect.anything(),
        expect.anything(),
      );
    });

    // Add repoA via progress event
    const repoA = makeRepo('packages/a', 'a');
    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoA], 1, false));
    });

    await waitFor(() => {
      expect(result.current.repos).toHaveLength(1);
    });

    // Resolve the discovery – marks complete
    act(() => {
      discoverResolve?.({ repos: [repoA] });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Progress event after completion should be ignored
    const repoB = makeRepo('packages/b', 'b');
    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoB], 2, false));
    });

    expect(result.current.repos).toHaveLength(1);

    // --- refresh() bumps generation and re-enables progress events ---
    act(() => {
      result.current.refresh();
    });

    // Wait for the new discovery request
    await waitFor(() => {
      const discoveryCalls = sendRequestMock.mock.calls.filter(
        ([channel]: [string]) => channel === 'git.repoDiscovery',
      );
      // Initial call + refresh call
      expect(discoveryCalls.length).toBe(2);
    });

    // Now a progress event should be accepted again.
    // (loadData cleared repos, so only repoB is present.)
    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoB], 1, false));
    });

    await waitFor(() => {
      expect(result.current.repos).toHaveLength(1);
      expect(result.current.repos[0].path).toBe('packages/b');
    });
  });

  // -------------------------------------------------------------------------
  // e. Status & branches fetched per repo on progress event
  // -------------------------------------------------------------------------
  test('fetches status and branches for each newly discovered repo', async () => {
    const { result } = renderHook(() => useGitRepos('ws-1', null));

    await waitFor(() => {
      expect(sendRequestMock).toHaveBeenCalledWith(
        'git.repoDiscovery',
        expect.anything(),
        expect.anything(),
      );
    });

    // Simulate progress with 2 repos
    const repoA = makeRepo('packages/a', 'a');
    const repoB = makeRepo('packages/b', 'b');

    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoA, repoB], 1, false));
    });

    // Wait for repos to appear
    await waitFor(() => {
      expect(result.current.repos).toHaveLength(2);
    });

    // Verify sendRequest was called for status and branches for each repo
    const statusCalls = sendRequestMock.mock.calls.filter(
      ([channel]: [string]) => channel === 'git.status',
    );
    const branchesCalls = sendRequestMock.mock.calls.filter(
      ([channel]: [string]) => channel === 'git.branches',
    );

    expect(statusCalls).toHaveLength(2);
    expect(branchesCalls).toHaveLength(2);

    // Verify the correct repo paths were used
    const statusPaths = statusCalls.map(
      ([_, payload]: [string, { repoPath: string }]) => payload.repoPath,
    );
    const branchesPaths = branchesCalls.map(
      ([_, payload]: [string, { repoPath: string }]) => payload.repoPath,
    );

    expect(statusPaths.sort()).toEqual(['packages/a', 'packages/b']);
    expect(branchesPaths.sort()).toEqual(['packages/a', 'packages/b']);

    // Wait for statuses/branches to appear in state
    await waitFor(() => {
      expect(result.current.repoStatuses.has('packages/a')).toBe(true);
      expect(result.current.repoStatuses.has('packages/b')).toBe(true);
      expect(result.current.repoBranches.has('packages/a')).toBe(true);
      expect(result.current.repoBranches.has('packages/b')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // f. Duplicate repos from progress events are deduplicated
  // -------------------------------------------------------------------------
  test('deduplicates repos when progress events contain already-known paths', async () => {
    const { result } = renderHook(() => useGitRepos('ws-1', null));

    await waitFor(() => {
      expect(sendRequestMock).toHaveBeenCalledWith(
        'git.repoDiscovery',
        expect.anything(),
        expect.anything(),
      );
    });

    const repoA = makeRepo('packages/a', 'a');

    // First event has repoA
    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoA], 1, false));
    });

    await waitFor(() => {
      expect(result.current.repos).toHaveLength(1);
    });

    // Second event has repoA again (same path, potentially updated info)
    // Should not duplicate
    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoA], 1, false));
    });

    // Still only 1 repo
    expect(result.current.repos).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // g. Status / branches are fetched for repos in final response that were
  //    missed by progress events
  // -------------------------------------------------------------------------
  test('fetches status/branches for repos in final response not yet fetched', async () => {
    // Count how many times git.status was called before discovery resolves
    const { result } = renderHook(() => useGitRepos('ws-1', null));

    await waitFor(() => {
      expect(sendRequestMock).toHaveBeenCalledWith(
        'git.repoDiscovery',
        expect.anything(),
        expect.anything(),
      );
    });

    const repoA = makeRepo('packages/a', 'a');
    const repoB = makeRepo('packages/b', 'b');
    const repoC = makeRepo('packages/c', 'c');

    // Progress event delivers repoA and repoB
    act(() => {
      simulateIncoming(makeProgressEvent('ws-1', [repoA, repoB], 1, false));
    });

    await waitFor(() => {
      expect(result.current.repos).toHaveLength(2);
    });

    // Resolve discovery with all 3 repos (repoC is new)
    act(() => {
      discoverResolve?.({ repos: [repoA, repoB, repoC] });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.repos).toHaveLength(3);
    });

    // sendRequest should have been called for status+branches for repoC as well
    // (because it wasn't in the progress events)
    const statusCalls = sendRequestMock.mock.calls.filter(
      ([channel]: [string]) => channel === 'git.status',
    );
    const statusPaths = statusCalls.map(
      ([_, payload]: [string, { repoPath: string }]) => payload.repoPath,
    );

    // All 3 repos should have had status fetched
    expect(statusPaths.sort()).toEqual(['packages/a', 'packages/b', 'packages/c']);
  });

  // -------------------------------------------------------------------------
  // h. Non-progress events are ignored
  // -------------------------------------------------------------------------
  test('ignores non-git.repoDiscovery.progress messages', async () => {
    const { result } = renderHook(() => useGitRepos('ws-1', null));

    await waitFor(() => {
      expect(sendRequestMock).toHaveBeenCalledWith(
        'git.repoDiscovery',
        expect.anything(),
        expect.anything(),
      );
    });

    // A non-progress event should not affect repos
    act(() => {
      simulateIncoming({
        v: 1,
        type: 'event',
        channel: 'terminal.output',
        payload: { data: 'hello' },
      });
    });

    expect(result.current.repos).toHaveLength(0);
  });
});
