/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook } from '@testing-library/react';
import type { MessageEnvelope } from '@ymir/shared';
import { createMockWsClient, mockWsClientModule } from '../test-helpers/mock-ws-client';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

// NOTE: Do NOT destructure getter properties (messageHandlerCount, etc.) —
// Bun evaluates getters at destructuring time, capturing stale values.
// Access them via `mockWs.messageHandlerCount` instead.
const mockWs = createMockWsClient();
mockWsClientModule(mockWs.wsClient);

// Import after mocking
const { useFileChange } = await import('./useFileChange');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simulateIncoming(envelope: MessageEnvelope) {
  mockWs.simulateMessage(envelope);
}

function makeFileChangeEvent(
  workspaceId: string,
  path: string,
  kind: 'create' | 'modify' | 'delete' = 'modify',
): MessageEnvelope {
  return {
    v: 1,
    type: 'event',
    channel: 'file.change',
    payload: { workspaceId, path, kind },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('useFileChange', () => {
  beforeEach(() => {
    mockWs.reset();
  });

  afterEach(() => {
    mockWs.reset();
  });

  // -----------------------------------------------------------------------
  // 1. Ignores non-file-change messages
  // -----------------------------------------------------------------------
  test('ignores non-file-change messages', () => {
    const callback = mock(() => {});

    renderHook(() => useFileChange('ws-1', callback));

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

    renderHook(() => useFileChange('ws-1', callback));

    // Event for a different workspace
    simulateIncoming(makeFileChangeEvent('ws-other', '/foo.txt'));

    expect(callback).not.toHaveBeenCalled();

    // Event for the correct workspace
    simulateIncoming(makeFileChangeEvent('ws-1', '/bar.txt'));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      path: '/bar.txt',
      kind: 'modify',
    });
  });

  // -----------------------------------------------------------------------
  // 3. Calls callback for matching events
  // -----------------------------------------------------------------------
  test('calls callback for matching events', () => {
    const callback = mock(() => {});

    renderHook(() => useFileChange('ws-1', callback));

    // create
    simulateIncoming(makeFileChangeEvent('ws-1', '/new.txt', 'create'));
    // modify
    simulateIncoming(makeFileChangeEvent('ws-1', '/existing.txt', 'modify'));
    // delete
    simulateIncoming(makeFileChangeEvent('ws-1', '/old.txt', 'delete'));

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      path: '/new.txt',
      kind: 'create',
    });
    expect(callback).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      path: '/existing.txt',
      kind: 'modify',
    });
    expect(callback).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      path: '/old.txt',
      kind: 'delete',
    });
  });

  // -----------------------------------------------------------------------
  // 4. Unsubscribes on unmount
  // -----------------------------------------------------------------------
  test('unsubscribes on unmount', () => {
    const callback = mock(() => {});

    const { unmount } = renderHook(() => useFileChange('ws-1', callback));

    expect(mockWs.messageHandlerCount).toBe(1);

    unmount();

    expect(mockWs.messageHandlerCount).toBe(0);

    // After unmount, incoming messages should not reach callback
    simulateIncoming(makeFileChangeEvent('ws-1', '/still.txt'));

    expect(callback).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. Handles null workspaceId (no subscription)
  // -----------------------------------------------------------------------
  test('handles null workspaceId (no subscription)', () => {
    const callback = mock(() => {});

    renderHook(() => useFileChange(null, callback));

    // No subscription should have been made
    expect(mockWs.mockOnMessage.mock.calls.length).toBe(0);
    expect(mockWs.messageHandlerCount).toBe(0);

    // Simulate incoming messages — callback should never fire
    simulateIncoming(makeFileChangeEvent('ws-1', '/foo.txt'));

    expect(callback).not.toHaveBeenCalled();
  });
});
