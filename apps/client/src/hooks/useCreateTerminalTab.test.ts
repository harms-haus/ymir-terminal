/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterAll } from 'bun:test';
import { renderHook, act } from '@testing-library/react';

/* eslint-disable @typescript-eslint/no-explicit-any */
// ---------------------------------------------------------------------------
// Mock useTerminal module
// ---------------------------------------------------------------------------

const mockCreateTerminal = mock<(workspaceId: string) => Promise<string>>(
  async (_workspaceId: string) => 'mock-terminal-id',
);

mock.module('./useTerminal', () => ({
  useTerminal: (_terminalId: string | null) => ({
    createTerminal: mockCreateTerminal,
    sendData: (_data: string) => {},
    onOutput: (_handler: (data: string) => void) => () => {},
    closeTerminal: async () => {},
    resizeTerminal: (_cols: number, _rows: number) => {},
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { useCreateTerminalTab } = await import('./useCreateTerminalTab');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('useCreateTerminalTab', () => {
  beforeEach(() => {
    mockCreateTerminal.mockClear();
  });
  test('returns a no-op when workspaceId is null', async () => {
    const createTab = mock(() => 'tab-1');
    const onCreated = mock((_terminalId: string, _tabId: string) => {});

    const { result } = renderHook(() =>
      useCreateTerminalTab(null, [], createTab as any, onCreated),
    );

    await act(async () => {
      await result.current();
    });

    expect(mockCreateTerminal).not.toHaveBeenCalled();
    expect(createTab).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  test('calls createTerminal and createTab with correct arguments', async () => {
    mockCreateTerminal.mockImplementation(async () => 'term-123');
    const createTab = mock(() => 'tab-456');
    const onCreated = mock((_terminalId: string, _tabId: string) => {});
    const tabs = [
      { id: 'existing', type: 'terminal' as const, title: 'Terminal 1', workspaceId: 'ws-1' },
    ];

    const { result } = renderHook(() =>
      useCreateTerminalTab('ws-1', tabs, createTab as any, onCreated),
    );

    await act(async () => {
      await result.current();
    });

    // createTerminal called with the workspaceId
    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);
    expect((mockCreateTerminal.mock.calls as any)[0][0]).toBe('ws-1');

    // createTab called with correct arguments
    expect(createTab).toHaveBeenCalledTimes(1);
    expect((createTab.mock.calls as any)[0][0]).toEqual({
      type: 'terminal',
      title: 'Terminal 2', // tabs.length + 1 = 2
      terminalId: 'term-123',
    });

    // onCreated called with both IDs
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated.mock.calls[0]).toEqual(['term-123', 'tab-456']);
  });

  test('calls onCreated with returned terminal and tab IDs', async () => {
    mockCreateTerminal.mockImplementation(async () => 'term-abc');
    const createTab = mock(() => 'tab-xyz');
    const onCreated = mock((_terminalId: string, _tabId: string) => {});

    const { result } = renderHook(() =>
      useCreateTerminalTab('workspace-1', [], createTab as any, onCreated),
    );

    await act(async () => {
      await result.current();
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated.mock.calls[0]?.[0]).toBe('term-abc');
    expect(onCreated.mock.calls[0][1]).toBe('tab-xyz');
  });

  test('handles createTerminal failure gracefully', async () => {
    const consoleErrorSpy = mock((_msg: string, _err: unknown) => {});
    const originalError = console.error;
    console.error = consoleErrorSpy as any;

    mockCreateTerminal.mockImplementation(async () => {
      throw new Error('sendRequest failed');
    });
    const createTab = mock(() => 'tab-1');
    const onCreated = mock((_terminalId: string, _tabId: string) => {});

    const { result } = renderHook(() =>
      useCreateTerminalTab('workspace-1', [], createTab as any, onCreated),
    );

    await act(async () => {
      await result.current();
    });

    // createTab and onCreated should NOT be called on failure
    expect(createTab).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();

    // Error was logged
    expect(consoleErrorSpy).toHaveBeenCalled();

    console.error = originalError;
  });

  test('prevents concurrent calls while creating', async () => {
    let resolveCreate: (id: string) => void;
    mockCreateTerminal.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const createTab = mock(() => 'tab-1');

    const { result } = renderHook(() => useCreateTerminalTab('workspace-1', [], createTab as any));

    // Fire first call (still pending)
    act(() => {
      result.current();
    });

    // Fire second call while first is still in progress
    await act(async () => {
      result.current();
    });

    // Only one createTerminal call should have been made
    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);

    // Resolve the pending creation
    await act(async () => {
      resolveCreate!('term-1');
    });

    expect(createTab).toHaveBeenCalledTimes(1);
  });

  test('works without onCreated callback', async () => {
    mockCreateTerminal.mockImplementation(async () => 'term-1');
    const createTab = mock(() => 'tab-1');

    const { result } = renderHook(() =>
      useCreateTerminalTab('workspace-1', [], createTab as any, undefined),
    );

    await act(async () => {
      await result.current();
    });

    expect(createTab).toHaveBeenCalledTimes(1);
  });
});
