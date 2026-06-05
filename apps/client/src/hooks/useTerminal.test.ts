/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook, waitFor, act } from '@testing-library/react';
import { PROTOCOL_VERSION, type MessageEnvelope } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock ws-client module
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
    getDisconnectEpoch: () => 0,
  },
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { useTerminal } = await import('./useTerminal');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate a message arriving from the server by calling all registered
 * message handlers with the given envelope.
 */
function simulateMessage(envelope: MessageEnvelope) {
  const handlers = [...messageHandlers];
  for (const handler of handlers) {
    handler(envelope);
  }
}

/**
 * Simulate a server response by calling all registered message handlers
 * with a response envelope whose `id` matches the request that was sent.
 */
function simulateResponse(requestId: string, payload: unknown, error?: unknown) {
  const response: MessageEnvelope = {
    v: PROTOCOL_VERSION,
    type: 'response',
    id: requestId,
    payload: error ? null : payload,
    ...(error ? { error } : {}),
  };

  const handlers = [...messageHandlers];
  for (const handler of handlers) {
    handler(response);
  }
}

/**
 * Get the request envelope that was sent via the last wsClient.send call.
 */
function getLastSentEnvelope(): MessageEnvelope {
  const calls = mockSend.mock.calls as unknown as Array<[unknown, ...unknown[]]>;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  return calls[calls.length - 1][0] as MessageEnvelope;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('useTerminal', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockOnMessage.mockClear();
    messageHandlers = [];
  });

  afterEach(() => {
    messageHandlers = [];
  });

  // -----------------------------------------------------------------------
  // 1. useTerminal(terminalId) returns { sendData, onOutput }
  // -----------------------------------------------------------------------
  test('returns sendData and onOutput', () => {
    const { result } = renderHook(() => useTerminal('term-1'));

    expect(result.current).toHaveProperty('sendData');
    expect(result.current).toHaveProperty('onOutput');
    expect(result.current).toHaveProperty('createTerminal');
    expect(result.current).toHaveProperty('closeTerminal');
    expect(result.current).toHaveProperty('resizeTerminal');
    expect(typeof result.current.sendData).toBe('function');
    expect(typeof result.current.onOutput).toBe('function');
  });

  // -----------------------------------------------------------------------
  // 2. sendData(data) sends terminal.input request with base64-encoded data
  // -----------------------------------------------------------------------
  test('sendData sends terminal.input request with base64-encoded data', () => {
    const { result } = renderHook(() => useTerminal('term-1'));

    act(() => {
      result.current.sendData('ls -la\n');
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const envelope = getLastSentEnvelope();
    expect(envelope.channel).toBe('terminal.input');
    expect(envelope.type).toBe('request');
    expect(envelope.payload).toHaveProperty('terminalId', 'term-1');
    expect(envelope.payload).toHaveProperty('data');
    // Verify data is base64-encoded — decode and compare
    const encoded = (envelope.payload as { terminalId: string; data: string }).data;
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe('ls -la\n');
  });

  test('sendData does nothing when terminalId is null', () => {
    const { result } = renderHook(() => useTerminal(null));

    act(() => {
      result.current.sendData('hello');
    });

    expect(mockSend).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 3. onOutput callback is called when terminal.output event arrives
  // -----------------------------------------------------------------------
  test('onOutput callback is called when terminal.output event arrives for this terminalId', () => {
    const { result } = renderHook(() => useTerminal('term-1'));

    const received: string[] = [];
    act(() => {
      result.current.onOutput((data) => {
        received.push(data);
      });
    });

    // Simulate a terminal.output message for this terminal
    const outputData = btoa(String.fromCodePoint(...new TextEncoder().encode('hello world')));
    simulateMessage({
      v: PROTOCOL_VERSION,
      type: 'event',
      id: 'evt-1',
      channel: 'terminal.output',
      payload: {
        terminalId: 'term-1',
        data: outputData,
      },
    });

    expect(received).toEqual(['hello world']);
  });

  test('onOutput ignores events for different terminalId', () => {
    const { result } = renderHook(() => useTerminal('term-1'));

    const received: string[] = [];
    act(() => {
      result.current.onOutput((data) => {
        received.push(data);
      });
    });

    // Simulate a terminal.output message for a different terminal
    const outputData = btoa(String.fromCodePoint(...new TextEncoder().encode('other output')));
    simulateMessage({
      v: PROTOCOL_VERSION,
      type: 'event',
      id: 'evt-2',
      channel: 'terminal.output',
      payload: {
        terminalId: 'term-999',
        data: outputData,
      },
    });

    expect(received).toEqual([]);
  });

  test('onOutput unsubscribes when returned function is called', () => {
    const { result } = renderHook(() => useTerminal('term-1'));

    const received: string[] = [];
    let unsub: () => void;
    act(() => {
      unsub = result.current.onOutput((data) => {
        received.push(data);
      });
    });

    // Unsubscribe
    act(() => {
      unsub!();
    });

    const outputData = btoa(String.fromCodePoint(...new TextEncoder().encode('after unsub')));
    simulateMessage({
      v: PROTOCOL_VERSION,
      type: 'event',
      id: 'evt-3',
      channel: 'terminal.output',
      payload: {
        terminalId: 'term-1',
        data: outputData,
      },
    });

    expect(received).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 4. createTerminal(workspaceId) sends terminal.create request and returns terminalId
  // -----------------------------------------------------------------------
  test('createTerminal sends terminal.create request and returns terminalId', async () => {
    const { result } = renderHook(() => useTerminal(null));

    let resolvedValue: string | undefined;
    let promise: Promise<string>;

    act(() => {
      promise = result.current.createTerminal('workspace-1');
      promise!.then((id) => {
        resolvedValue = id;
      });
    });

    // Wait for the send to happen
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalled();
    });

    const envelope = getLastSentEnvelope();
    expect(envelope.channel).toBe('terminal.create');
    expect(envelope.type).toBe('request');
    expect(envelope.payload).toEqual({ workspaceId: 'workspace-1', cols: 80, rows: 24 });

    // Simulate successful response
    simulateResponse(envelope.id!, { terminalId: 'new-term-1' });

    await waitFor(() => {
      expect(resolvedValue).toBe('new-term-1');
    });
  });

  // -----------------------------------------------------------------------
  // 5. closeTerminal() sends terminal.close request
  // -----------------------------------------------------------------------
  test('closeTerminal sends terminal.close request', async () => {
    const { result } = renderHook(() => useTerminal('term-1'));

    act(() => {
      result.current.closeTerminal();
    });

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalled();
    });

    const envelope = getLastSentEnvelope();
    expect(envelope.channel).toBe('terminal.close');
    expect(envelope.type).toBe('request');
    expect(envelope.payload).toEqual({ terminalId: 'term-1' });

    // Simulate successful response so the promise resolves
    simulateResponse(envelope.id!, {});
  });

  test('closeTerminal does nothing when terminalId is null', async () => {
    const { result } = renderHook(() => useTerminal(null));

    await act(async () => {
      await result.current.closeTerminal();
    });

    expect(mockSend).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 6. resizeTerminal(cols, rows) sends terminal.resize request
  // -----------------------------------------------------------------------
  test('resizeTerminal sends terminal.resize request', () => {
    const { result } = renderHook(() => useTerminal('term-1'));

    act(() => {
      result.current.resizeTerminal(120, 40);
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const envelope = getLastSentEnvelope();
    expect(envelope.channel).toBe('terminal.resize');
    expect(envelope.type).toBe('request');
    expect(envelope.payload).toEqual({ terminalId: 'term-1', cols: 120, rows: 40 });
  });

  test('resizeTerminal does nothing when terminalId is null', () => {
    const { result } = renderHook(() => useTerminal(null));

    act(() => {
      result.current.resizeTerminal(120, 40);
    });

    expect(mockSend).not.toHaveBeenCalled();
  });
});
