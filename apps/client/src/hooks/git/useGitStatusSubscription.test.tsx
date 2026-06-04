/// <reference lib="dom" />
import { setupTestDom } from '../../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook } from '@testing-library/react';
import type { MessageEnvelope } from '@ymir/shared';
import { createMockWsClient, mockWsClientModule } from '../../test-helpers/mock-ws-client';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

const mockWs = createMockWsClient();
mockWsClientModule(mockWs.wsClient);

// Import after mocking
const { useGitStatusSubscription } = await import('./useGitStatusSubscription');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simulateIncoming(envelope: MessageEnvelope) {
  mockWs.simulateMessage(envelope);
}

function makeGitStatusChangeEvent(
  workspaceId: string,
  repoPath: string,
  branch: string | null = 'main',
): MessageEnvelope {
  return {
    v: 1,
    type: 'event',
    channel: 'git.statusChange',
    payload: {
      workspaceId,
      repoPath,
      status: {
        branch,
        changes: [],
        staged: [],
        hasRemote: true,
        ahead: 0,
        behind: 0,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('useGitStatusSubscription', () => {
  beforeEach(() => {
    mockWs.reset();
  });

  afterEach(() => {
    mockWs.reset();
  });

  // -----------------------------------------------------------------------
  // 1. Ignores non-git.statusChange messages
  // -----------------------------------------------------------------------
  test('ignores non-git.statusChange messages', () => {
    const callback = mock(() => {});

    renderHook(() => useGitStatusSubscription('ws-1', callback));

    simulateIncoming({
      v: 1,
      type: 'event',
      channel: 'terminal.output',
      payload: { data: 'some output' },
    });

    expect(callback).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 2. Filters by workspaceId
  // -----------------------------------------------------------------------
  test('filters by workspaceId', () => {
    const callback = mock(() => {});

    renderHook(() => useGitStatusSubscription('ws-1', callback));

    // Event for a different workspace
    simulateIncoming(makeGitStatusChangeEvent('ws-other', 'packages/server'));

    expect(callback).not.toHaveBeenCalled();

    // Event for the correct workspace
    simulateIncoming(makeGitStatusChangeEvent('ws-1', 'packages/server'));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      'packages/server',
      expect.objectContaining({
        branch: 'main',
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 3. Calls callback for matching events
  // -----------------------------------------------------------------------
  test('calls callback for matching events', () => {
    const callback = mock(() => {});

    renderHook(() => useGitStatusSubscription('ws-1', callback));

    // Multiple matching events with different repo paths
    simulateIncoming(makeGitStatusChangeEvent('ws-1', 'packages/server', 'main'));
    simulateIncoming(makeGitStatusChangeEvent('ws-1', 'packages/client', 'feature-branch'));
    simulateIncoming(makeGitStatusChangeEvent('ws-1', '.', 'main'));

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledWith(
      'packages/server',
      expect.objectContaining({
        branch: 'main',
      }),
    );
    expect(callback).toHaveBeenCalledWith(
      'packages/client',
      expect.objectContaining({
        branch: 'feature-branch',
      }),
    );
    expect(callback).toHaveBeenCalledWith(
      '.',
      expect.objectContaining({
        branch: 'main',
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 4. Unsubscribes on unmount
  // -----------------------------------------------------------------------
  test('unsubscribes on unmount', () => {
    const callback = mock(() => {});

    const { unmount } = renderHook(() => useGitStatusSubscription('ws-1', callback));

    expect(mockWs.messageHandlerCount).toBe(1);

    unmount();

    expect(mockWs.messageHandlerCount).toBe(0);

    // After unmount, incoming messages should not reach callback
    simulateIncoming(makeGitStatusChangeEvent('ws-1', 'packages/server'));

    expect(callback).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. Handles null workspaceId (no subscription)
  // -----------------------------------------------------------------------
  test('handles null workspaceId (no subscription)', () => {
    const callback = mock(() => {});

    renderHook(() => useGitStatusSubscription(null, callback));

    // No subscription should have been made
    expect(mockWs.mockOnMessage.mock.calls.length).toBe(0);
    expect(mockWs.messageHandlerCount).toBe(0);

    // Simulate incoming messages — callback should never fire
    simulateIncoming(makeGitStatusChangeEvent('ws-1', 'packages/server'));

    expect(callback).not.toHaveBeenCalled();
  });
});
