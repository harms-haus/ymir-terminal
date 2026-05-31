/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook, waitFor, act } from '@testing-library/react';
import { PROTOCOL_VERSION, type MessageEnvelope } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock ws-client module (used by sendRequest)
// ---------------------------------------------------------------------------

const mockSend = mock(() => {});
let messageHandlers: Array<(envelope: MessageEnvelope) => void> = [];

const mockOnMessage = mock((handler: (envelope: MessageEnvelope) => void) => {
  messageHandlers.push(handler);
  return () => {
    messageHandlers = messageHandlers.filter((h) => h !== handler);
  };
});

mock.module('../lib/ws-client', () => ({
  wsClient: {
    send: mockSend,
    onMessage: mockOnMessage,
  },
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { useTerminalPane } = await import('./useTerminalPane');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simulateResponse(requestId: string, payload: unknown) {
  const response: MessageEnvelope = {
    v: PROTOCOL_VERSION,
    type: 'response',
    id: requestId,
    payload,
  };
  for (const handler of [...messageHandlers]) {
    handler(response);
  }
}

function getLastSentEnvelope(): MessageEnvelope {
  const calls = mockSend.mock.calls;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  return calls[calls.length - 1][0] as MessageEnvelope;
}

function getAllSentEnvelopes(): MessageEnvelope[] {
  return mockSend.mock.calls.map((c) => c[0] as MessageEnvelope);
}

/**
 * Simulate a tab.list response for a given workspaceId.
 * Finds the tab.list request envelope and responds with the provided tabs.
 */
async function respondToTabList(tabs: Array<Record<string, unknown>>) {
  const envelopes = getAllSentEnvelopes();
  const tabListReq = envelopes.find((e) => e.channel === 'tab.list');
  if (tabListReq?.id) {
    simulateResponse(tabListReq.id, { tabs });
  }
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

describe('useTerminalPane', () => {
  const onTerminalRegistered = mock(
    (_terminalId: string, _tabId: string, _workspaceId: string) => {},
  );
  const onTerminalUnregistered = mock((_terminalId: string) => {});

  beforeEach(() => {
    mockSend.mockClear();
    mockOnMessage.mockClear();
    onTerminalRegistered.mockClear();
    onTerminalUnregistered.mockClear();
    messageHandlers = [];
  });

  // -----------------------------------------------------------------------
  // 1. Switches workspace and loads tabs from server on workspaceId change
  // -----------------------------------------------------------------------
  test('loads tabs from server when workspaceId is set for the first time', async () => {
    const serverTabs = [
      {
        id: 'tab-1',
        tabType: 'terminal' as const,
        title: 'Terminal 1',
        filePath: null,
        terminalId: 'term-1',
        active: true,
        sortOrder: 0,
        terminalAlive: true,
      },
      {
        id: 'tab-2',
        tabType: 'terminal' as const,
        title: 'Terminal 2',
        filePath: null,
        terminalId: 'term-2',
        active: false,
        sortOrder: 1,
        terminalAlive: true,
      },
    ];

    const { result } = renderHook(
      ({ workspaceId }) =>
        useTerminalPane({
          workspaceId,
          pane: 'content',
          onTerminalRegistered,
          onTerminalUnregistered,
        }),
      { initialProps: { workspaceId: 'ws-1' as string | undefined } },
    );

    // Wait for the tab.list request to be sent
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalled();
    });

    // Respond to the tab.list request
    await act(async () => {
      await respondToTabList(serverTabs);
    });

    // Verify tabs were loaded
    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(2);
      expect(result.current.tabs[0].id).toBe('tab-1');
      expect(result.current.tabs[1].id).toBe('tab-2');
    });

    // Verify terminal registration callbacks
    expect(onTerminalRegistered).toHaveBeenCalledTimes(2);
    expect(onTerminalRegistered).toHaveBeenCalledWith('term-1', 'tab-1', 'ws-1');
    expect(onTerminalRegistered).toHaveBeenCalledWith('term-2', 'tab-2', 'ws-1');
  });

  test('does not reload tabs for the same workspace on re-render', async () => {
    const { rerender } = renderHook(
      ({ workspaceId }) =>
        useTerminalPane({
          workspaceId,
          pane: 'content',
        }),
      { initialProps: { workspaceId: 'ws-1' as string | undefined } },
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().filter((e) => e.channel === 'tab.list')).toHaveLength(1);
    });

    // Respond so the promise resolves
    await act(async () => {
      await respondToTabList([]);
    });

    mockSend.mockClear();

    // Re-render with same workspaceId — should NOT send another tab.list
    rerender({ workspaceId: 'ws-1' });

    await waitFor(() => {
      expect(getAllSentEnvelopes().filter((e) => e.channel === 'tab.list')).toHaveLength(0);
    });
  });

  test('filters out dead terminals from server response', async () => {
    const serverTabs = [
      {
        id: 'tab-1',
        tabType: 'terminal' as const,
        title: 'Alive',
        filePath: null,
        terminalId: 'term-1',
        active: true,
        sortOrder: 0,
        terminalAlive: true,
      },
      {
        id: 'tab-2',
        tabType: 'terminal' as const,
        title: 'Dead',
        filePath: null,
        terminalId: 'term-2',
        active: false,
        sortOrder: 1,
        terminalAlive: false,
      },
    ];

    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
        onTerminalRegistered,
      }),
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList(serverTabs);
    });

    await waitFor(() => {
      // Only the alive terminal should be loaded
      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.tabs[0].id).toBe('tab-1');
    });

    // Only the alive terminal's callback should fire
    expect(onTerminalRegistered).toHaveBeenCalledTimes(1);
    expect(onTerminalRegistered).toHaveBeenCalledWith('term-1', 'tab-1', 'ws-1');
  });

  // -----------------------------------------------------------------------
  // 2. Handles tab close — sends terminal.close + tab.delete for terminal tabs
  // -----------------------------------------------------------------------
  test('handleCloseTab sends terminal.close and calls onTerminalUnregistered for terminal tabs', async () => {
    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
        onTerminalUnregistered,
      }),
    );

    // Wait for tab.list request + respond
    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList([]);
    });

    // Create a terminal tab manually
    let tabId: string;
    act(() => {
      tabId = result.current.createTab({ type: 'terminal', title: 'Term', terminalId: 'term-x' });
    });

    // Wait for tab.create to be sent (synced via onTabChange)
    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.create')).toBe(true);
    });

    // Respond to the tab.create request so it resolves
    const createReq = getAllSentEnvelopes().find((e) => e.channel === 'tab.create');
    if (createReq?.id) {
      simulateResponse(createReq.id, { tabId: tabId! });
    }

    // Clear to isolate close requests
    mockSend.mockClear();

    // Close the tab
    act(() => {
      result.current.handleCloseTab(tabId!);
    });

    await waitFor(() => {
      const envelopes = getAllSentEnvelopes();
      // Should send terminal.close
      expect(envelopes.some((e) => e.channel === 'terminal.close')).toBe(true);
      // Should send tab.delete
      expect(envelopes.some((e) => e.channel === 'tab.delete')).toBe(true);
    });

    // Verify terminal.close payload
    const closeEnvelope = getAllSentEnvelopes().find((e) => e.channel === 'terminal.close')!;
    expect(closeEnvelope.payload).toEqual({ terminalId: 'term-x' });

    // Verify tab.delete payload
    const deleteEnvelope = getAllSentEnvelopes().find((e) => e.channel === 'tab.delete')!;
    expect(deleteEnvelope.payload).toEqual({ tabId: tabId! });

    // Verify unregistration callback
    expect(onTerminalUnregistered).toHaveBeenCalledWith('term-x');
  });

  test('handleCloseTab does not send terminal.close for editor tabs', async () => {
    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
        onTerminalUnregistered,
      }),
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList([]);
    });

    // Create an editor tab (no terminalId)
    let tabId: string;
    act(() => {
      tabId = result.current.createTab({
        type: 'editor',
        title: 'Editor',
        filePath: '/foo.ts',
      });
    });

    // Respond to tab.create
    const createReq = getAllSentEnvelopes().find((e) => e.channel === 'tab.create');
    if (createReq?.id) simulateResponse(createReq.id, { tabId: tabId! });

    mockSend.mockClear();

    // Close the editor tab
    act(() => {
      result.current.handleCloseTab(tabId!);
    });

    await waitFor(() => {
      // Should only send tab.delete, not terminal.close
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.delete')).toBe(true);
    });

    expect(getAllSentEnvelopes().some((e) => e.channel === 'terminal.close')).toBe(false);
    expect(onTerminalUnregistered).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 3. Handles tab close with dirty file confirmation
  // -----------------------------------------------------------------------
  test('handleCloseTab prompts for dirty file and cancels if user declines', async () => {
    const confirmSpy = mock(() => false);
    const originalConfirm = globalThis.confirm;
    globalThis.confirm = confirmSpy as typeof confirm;

    try {
      const dirtyFiles = new Set(['/dirty.ts']);

      const { result } = renderHook(() =>
        useTerminalPane({
          workspaceId: 'ws-1',
          pane: 'content',
          dirtyFiles,
        }),
      );

      await waitFor(() => {
        expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
      });

      await act(async () => {
        await respondToTabList([]);
      });

      // Create an editor tab with a dirty file
      let tabId: string;
      act(() => {
        tabId = result.current.createTab({
          type: 'editor',
          title: 'Editor',
          filePath: '/dirty.ts',
        });
      });

      const createReq = getAllSentEnvelopes().find((e) => e.channel === 'tab.create');
      if (createReq?.id) simulateResponse(createReq.id, { tabId: tabId! });

      mockSend.mockClear();

      // Try to close — user declines
      act(() => {
        result.current.handleCloseTab(tabId!);
      });

      expect(confirmSpy).toHaveBeenCalled();
      // Tab should NOT be closed
      expect(result.current.tabs.find((t) => t.id === tabId!)).toBeDefined();
      // No tab.delete should have been sent
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.delete')).toBe(false);
    } finally {
      globalThis.confirm = originalConfirm;
    }
  });

  test('handleCloseTab proceeds when user confirms dirty file close', async () => {
    const confirmSpy = mock(() => true);
    const originalConfirm = globalThis.confirm;
    globalThis.confirm = confirmSpy as typeof confirm;

    try {
      const dirtyFiles = new Set(['/dirty.ts']);

      const { result } = renderHook(() =>
        useTerminalPane({
          workspaceId: 'ws-1',
          pane: 'content',
          dirtyFiles,
        }),
      );

      await waitFor(() => {
        expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
      });

      await act(async () => {
        await respondToTabList([]);
      });

      let tabId: string;
      act(() => {
        tabId = result.current.createTab({
          type: 'editor',
          title: 'Editor',
          filePath: '/dirty.ts',
        });
      });

      const createReq = getAllSentEnvelopes().find((e) => e.channel === 'tab.create');
      if (createReq?.id) simulateResponse(createReq.id, { tabId: tabId! });

      mockSend.mockClear();

      // Confirm close
      act(() => {
        result.current.handleCloseTab(tabId!);
      });

      expect(confirmSpy).toHaveBeenCalled();
      // Tab should be closed
      await waitFor(() => {
        expect(result.current.tabs.find((t) => t.id === tabId!)).toBeUndefined();
      });
      // tab.delete should have been sent
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.delete')).toBe(true);
    } finally {
      globalThis.confirm = originalConfirm;
    }
  });

  // -----------------------------------------------------------------------
  // 4. transferTabOut returns correct data and removes tab
  // -----------------------------------------------------------------------
  test('transferTabOut returns terminal data and removes tab', async () => {
    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
      }),
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList([]);
    });

    let tabId: string;
    act(() => {
      tabId = result.current.createTab({
        type: 'terminal',
        title: 'My Term',
        terminalId: 'term-transfer',
        cwd: '/home/user',
        customTitle: 'Custom',
      });
    });

    const createReq = getAllSentEnvelopes().find((e) => e.channel === 'tab.create');
    if (createReq?.id) simulateResponse(createReq.id, { tabId: tabId! });

    // Transfer the tab out
    let transferResult: {
      terminalId: string;
      title: string;
      cwd?: string;
      customTitle?: string;
    } | null;
    act(() => {
      transferResult = result.current.transferTabOut(tabId!);
    });

    // Should return the tab data
    expect(transferResult).toEqual({
      terminalId: 'term-transfer',
      title: 'My Term',
      cwd: '/home/user',
      customTitle: 'Custom',
    });

    // Tab should be removed
    await waitFor(() => {
      expect(result.current.tabs.find((t) => t.id === tabId!)).toBeUndefined();
    });
  });

  test('transferTabOut returns null for tab without terminalId', async () => {
    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
      }),
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList([]);
    });

    let tabId: string;
    act(() => {
      tabId = result.current.createTab({
        type: 'editor',
        title: 'Editor',
        filePath: '/foo.ts',
      });
    });

    const createReq = getAllSentEnvelopes().find((e) => e.channel === 'tab.create');
    if (createReq?.id) simulateResponse(createReq.id, { tabId: tabId! });

    let transferResult: unknown;
    act(() => {
      transferResult = result.current.transferTabOut(tabId!);
    });

    expect(transferResult).toBeNull();
    // Editor tab should still be present
    expect(result.current.tabs.find((t) => t.id === tabId!)).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 5. receiveTab creates a new terminal tab
  // -----------------------------------------------------------------------
  test('receiveTab creates a new terminal tab and returns tabId', async () => {
    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
      }),
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList([]);
    });

    let receivedTabId: string;
    act(() => {
      receivedTabId = result.current.receiveTab(
        'term-received',
        'Received Term',
        '/home',
        'Custom',
      );
    });

    expect(receivedTabId).toBeTruthy();

    await waitFor(() => {
      const tab = result.current.tabs.find((t) => t.id === receivedTabId!);
      expect(tab).toBeDefined();
      expect(tab!.type).toBe('terminal');
      expect(tab!.terminalId).toBe('term-received');
      expect(tab!.title).toBe('Received Term');
      expect(tab!.cwd).toBe('/home');
      expect(tab!.customTitle).toBe('Custom');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Server sync fires tab.create / tab.delete / tab.reorder / tab.update
  // -----------------------------------------------------------------------
  test('creating a tab fires tab.create request via onTabChange', async () => {
    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
      }),
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList([]);
    });

    mockSend.mockClear();

    act(() => {
      result.current.createTab({ type: 'terminal', title: 'New', terminalId: 't-1' });
    });

    await waitFor(() => {
      const envelopes = getAllSentEnvelopes();
      const createReq = envelopes.find((e) => e.channel === 'tab.create');
      expect(createReq).toBeDefined();
      expect(createReq!.payload).toMatchObject({
        workspaceId: 'ws-1',
        pane: 'content',
        tabType: 'terminal',
        title: 'New',
        terminalId: 't-1',
      });
    });
  });

  test('closing a tab fires tab.delete request via onTabChange', async () => {
    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
      }),
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList([]);
    });

    let tabId: string;
    act(() => {
      tabId = result.current.createTab({ type: 'terminal', title: 'T', terminalId: 't-1' });
    });

    const createReq = getAllSentEnvelopes().find((e) => e.channel === 'tab.create');
    if (createReq?.id) simulateResponse(createReq.id, { tabId: tabId! });

    mockSend.mockClear();

    // Close using the raw closeTab (triggers onTabChange)
    act(() => {
      result.current.closeTab(tabId!);
    });

    await waitFor(() => {
      const envelopes = getAllSentEnvelopes();
      const deleteReq = envelopes.find((e) => e.channel === 'tab.delete');
      expect(deleteReq).toBeDefined();
      expect(deleteReq!.payload).toEqual({ tabId: tabId! });
    });
  });

  test('reordering tabs fires tab.reorder request via onTabChange', async () => {
    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
      }),
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList([]);
    });

    let tabId1: string;
    let tabId2: string;
    act(() => {
      tabId1 = result.current.createTab({ type: 'terminal', title: 'T1', terminalId: 't-1' });
      tabId2 = result.current.createTab({ type: 'terminal', title: 'T2', terminalId: 't-2' });
    });

    // Resolve the create requests
    for (const env of getAllSentEnvelopes()) {
      if (env.channel === 'tab.create' && env.id) {
        simulateResponse(env.id, { tabId: 'ok' });
      }
    }

    mockSend.mockClear();

    // Reorder: swap tab positions
    act(() => {
      result.current.reorderTabs(0, 1);
    });

    await waitFor(() => {
      const envelopes = getAllSentEnvelopes();
      const reorderReq = envelopes.find((e) => e.channel === 'tab.reorder');
      expect(reorderReq).toBeDefined();
      const tabIds = (reorderReq!.payload as { tabIds: string[] }).tabIds;
      // Verify both tab IDs are present in the reorder request
      expect(tabIds).toHaveLength(2);
      expect(tabIds).toContain(tabId1!);
      expect(tabIds).toContain(tabId2!);
    });
  });

  test('activating a tab fires tab.update request via onTabChange', async () => {
    const { result } = renderHook(() =>
      useTerminalPane({
        workspaceId: 'ws-1',
        pane: 'content',
      }),
    );

    await waitFor(() => {
      expect(getAllSentEnvelopes().some((e) => e.channel === 'tab.list')).toBe(true);
    });

    await act(async () => {
      await respondToTabList([]);
    });

    // Create two tabs
    let tabId1: string;
    let tabId2: string;
    act(() => {
      tabId1 = result.current.createTab({ type: 'terminal', title: 'T1', terminalId: 't-1' });
      tabId2 = result.current.createTab({ type: 'terminal', title: 'T2', terminalId: 't-2' });
    });

    // Resolve creates
    for (const env of getAllSentEnvelopes()) {
      if (env.channel === 'tab.create' && env.id) {
        simulateResponse(env.id, { tabId: 'ok' });
      }
    }

    mockSend.mockClear();

    // Activate the first tab
    act(() => {
      result.current.activateTab(tabId1!);
    });

    await waitFor(() => {
      const envelopes = getAllSentEnvelopes();
      const updateReq = envelopes.find((e) => e.channel === 'tab.update');
      expect(updateReq).toBeDefined();
      expect(updateReq!.payload).toEqual({ tabId: tabId1!, active: true });
    });
  });
});
