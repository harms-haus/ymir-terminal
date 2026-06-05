import { describe, test, expect, beforeEach, afterAll, mock } from 'bun:test';
import { PROTOCOL_VERSION } from '@ymir/shared';
import type { MessageEnvelope, ResponseEnvelope } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

type MessageHandler = (envelope: MessageEnvelope) => void;

let messageHandlers: MessageHandler[] = [];
let sentEnvelopes: MessageEnvelope[] = [];
let disconnectEpoch = 0;

function resetMock() {
  messageHandlers = [];
  sentEnvelopes = [];
  disconnectEpoch = 0;
}

mock.module('./ws-client', () => {
  return {
    wsClient: {
      onMessage(handler: MessageHandler) {
        messageHandlers.push(handler);
        return () => {
          messageHandlers = messageHandlers.filter((h) => h !== handler);
        };
      },
      send(envelope: MessageEnvelope) {
        sentEnvelopes.push(envelope);
      },
      getDisconnectEpoch() {
        return disconnectEpoch;
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate an incoming message to all registered handlers (mimics what
 * WSClient does internally when it receives a WebSocket message).
 */
function simulateIncoming(envelope: MessageEnvelope) {
  for (const handler of [...messageHandlers]) {
    handler(envelope);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('sendRequest', () => {
  let sendRequest: typeof import('./send-request').sendRequest; // eslint-disable-line @typescript-eslint/consistent-type-imports

  beforeEach(async () => {
    resetMock();
    // Bust module cache so we get fresh import with the mock applied
    const mod = await import(`./send-request?_t=${Date.now()}`);
    sendRequest = mod.sendRequest;
  });

  // -----------------------------------------------------------------------
  // 1. Successful request/response
  // -----------------------------------------------------------------------
  test('resolves with payload when matching response arrives', async () => {
    const promise = sendRequest<{ result: number }>('test-channel', {
      action: 'ping',
    });

    // sendRequest should have called wsClient.send with a proper envelope
    expect(sentEnvelopes.length).toBe(1);
    const sent = sentEnvelopes[0];
    expect(sent.v).toBe(PROTOCOL_VERSION);
    expect(sent.type).toBe('request');
    expect(sent.channel).toBe('test-channel');
    expect(sent.payload).toEqual({ action: 'ping' });
    expect(typeof sent.id).toBe('string');

    // Simulate a response with matching id
    simulateIncoming({
      v: PROTOCOL_VERSION,
      type: 'response',
      id: sent.id,
      payload: { result: 42 },
    });

    const result = await promise;
    expect(result).toEqual({ result: 42 });
  });

  // -----------------------------------------------------------------------
  // 2. Error response
  // -----------------------------------------------------------------------
  test('rejects with error message when response contains error', async () => {
    const promise = sendRequest('test-channel', { action: 'fail' });

    const sent = sentEnvelopes[0];

    simulateIncoming({
      v: PROTOCOL_VERSION,
      type: 'response',
      id: sent.id,
      payload: null,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    } as ResponseEnvelope);

    expect(promise).rejects.toThrow('Something went wrong');
  });

  // -----------------------------------------------------------------------
  // 3. AbortSignal – already aborted
  // -----------------------------------------------------------------------
  test('rejects immediately if AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = sendRequest(
      'test-channel',
      { action: 'abort-test' },
      {
        signal: controller.signal,
      },
    );

    // Should not have sent anything (promise rejects synchronously)
    expect(sentEnvelopes.length).toBe(0);
    expect(promise).rejects.toThrow('Request aborted');
  });

  // -----------------------------------------------------------------------
  // 3b. AbortSignal – abort after request is sent
  // -----------------------------------------------------------------------
  test('rejects when AbortSignal fires after request is sent', async () => {
    const controller = new AbortController();

    const promise = sendRequest(
      'test-channel',
      { action: 'late-abort' },
      {
        signal: controller.signal,
      },
    );

    // Request was sent
    expect(sentEnvelopes.length).toBe(1);

    // Abort after sending
    controller.abort();

    expect(promise).rejects.toThrow('Request aborted');
  });

  // -----------------------------------------------------------------------
  // Ignores messages with non-matching id
  // -----------------------------------------------------------------------
  test('ignores responses with non-matching id', async () => {
    let resolved = false;
    const promise = sendRequest('test-channel', { action: 'wait' });
    promise.then(() => {
      resolved = true;
    });

    const sent = sentEnvelopes[0];

    // Send a response with wrong id
    simulateIncoming({
      v: PROTOCOL_VERSION,
      type: 'response',
      id: 'wrong-id',
      payload: { result: 'nope' },
    });

    // Give microtasks a chance to settle
    await new Promise((r) => setTimeout(r, 0));

    // Should not have resolved yet
    expect(resolved).toBe(false);

    // Now send the correct response
    simulateIncoming({
      v: PROTOCOL_VERSION,
      type: 'response',
      id: sent.id,
      payload: { result: 'yes' },
    });

    const result = await promise;
    expect(result).toEqual({ result: 'yes' });
  });

  // -----------------------------------------------------------------------
  // Unsubscribes from onMessage after resolution
  // -----------------------------------------------------------------------
  test('unsubscribes from wsClient.onMessage after resolving', async () => {
    const promise = sendRequest('test-channel', { action: 'cleanup' });
    const sent = sentEnvelopes[0];

    simulateIncoming({
      v: PROTOCOL_VERSION,
      type: 'response',
      id: sent.id,
      payload: 'done',
    });

    await promise;

    // After resolution, no handlers should be registered
    expect(messageHandlers.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Timeout: rejects when no response arrives within the timeout period
  // -----------------------------------------------------------------------
  test('rejects with timeout error when no response arrives', async () => {
    // Use fake timers to control the timeout without waiting 10 seconds
    const fakeTimers: Array<{ cb: () => void; delay: number }> = [];
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;

    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      fakeTimers.push({ cb, delay: delay ?? 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fakeTimers.length as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.clearTimeout = (() => {}) as any;

    try {
      // Bust module cache so the new fake timers are captured by sendRequest
      const mod = await import(`./send-request?_t=${Date.now()}`);
      const sendRequestFresh = mod.sendRequest;

      const promise = sendRequestFresh('test-channel', { action: 'slow' });

      // Request should have been sent
      expect(sentEnvelopes.length).toBe(1);

      // The timeout timer should have been scheduled (10_000ms)
      expect(fakeTimers.length).toBe(1);
      expect(fakeTimers[0].delay).toBe(10_000);

      // Fire the timeout timer
      fakeTimers[0].cb();

      await expect(promise).rejects.toThrow('Request timeout');

      // After timeout, handlers should be cleaned up
      expect(messageHandlers.length).toBe(0);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // Epoch change: rejects stale in-flight request with 'Connection reset'
  // -----------------------------------------------------------------------
  test('rejects with Connection reset when disconnectEpoch changes during in-flight request', async () => {
    // Use fake timers so we can control when the timeout fires
    const fakeTimers: Array<{ cb: () => void; delay: number }> = [];
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;

    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      fakeTimers.push({ cb, delay: delay ?? 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fakeTimers.length as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.clearTimeout = (() => {}) as any;

    try {
      const mod = await import(`./send-request?_t=${Date.now()}`);
      const sendRequestFresh = mod.sendRequest;

      // Epoch starts at 0 (from resetMock)
      const promise = sendRequestFresh('test-channel', { action: 'stale' });
      expect(sentEnvelopes.length).toBe(1);
      const sent = sentEnvelopes[0];

      // Epoch increments (simulates disconnectAndRejectPending)
      disconnectEpoch++;

      // Simulate a late response arriving (now epoch has changed)
      simulateIncoming({
        v: PROTOCOL_VERSION,
        type: 'response',
        id: sent.id,
        payload: { result: 'old-data' },
      });

      await expect(promise).rejects.toThrow('Connection reset');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // Epoch change: timeout also rejects with Connection reset if epoch changed
  // -----------------------------------------------------------------------
  test('rejects with Connection reset (not timeout) when epoch changes before timeout fires', async () => {
    const fakeTimers: Array<{ cb: () => void; delay: number }> = [];
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;

    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      fakeTimers.push({ cb, delay: delay ?? 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fakeTimers.length as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.clearTimeout = (() => {}) as any;

    try {
      const mod = await import(`./send-request?_t=${Date.now()}`);
      const sendRequestFresh = mod.sendRequest;

      const promise = sendRequestFresh('test-channel', { action: 'stale-timeout' });
      expect(sentEnvelopes.length).toBe(1);

      // Epoch increments before timeout fires
      disconnectEpoch++;

      // Fire the timeout handler — should reject with Connection reset, not timeout
      fakeTimers[0].cb();

      await expect(promise).rejects.toThrow('Connection reset');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // No epoch change: normal timeout still works
  // -----------------------------------------------------------------------
  test('rejects with timeout error when epoch has not changed', async () => {
    const fakeTimers: Array<{ cb: () => void; delay: number }> = [];
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;

    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      fakeTimers.push({ cb, delay: delay ?? 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fakeTimers.length as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.clearTimeout = (() => {}) as any;

    try {
      const mod = await import(`./send-request?_t=${Date.now()}`);
      const sendRequestFresh = mod.sendRequest;

      const promise = sendRequestFresh('test-channel', { action: 'normal-timeout' });
      expect(sentEnvelopes.length).toBe(1);

      // Epoch stays the same (0)
      fakeTimers[0].cb();

      await expect(promise).rejects.toThrow('Request timeout');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // Successful response before epoch change resolves normally
  // -----------------------------------------------------------------------
  test('resolves normally when response arrives before epoch change', async () => {
    const promise = sendRequest<{ ok: boolean }>('test-channel', {
      action: 'before-epoch',
    });

    const sent = sentEnvelopes[0];

    // Simulate response while epoch is still 0
    simulateIncoming({
      v: PROTOCOL_VERSION,
      type: 'response',
      id: sent.id,
      payload: { ok: true },
    });

    const result = await promise;
    expect(result).toEqual({ ok: true });
  });

  // -----------------------------------------------------------------------
  // Timeout is cleared when response arrives in time
  // -----------------------------------------------------------------------
  test('clears timeout when response arrives before timeout', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock spy for clearTimeout
    const clearTimeoutSpy = mock((_id: any) => {});
    const originalClearTimeout = globalThis.clearTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.clearTimeout = clearTimeoutSpy as any;

    try {
      const promise = sendRequest('test-channel', { action: 'fast' });
      const sent = sentEnvelopes[0];

      // Simulate a timely response
      simulateIncoming({
        v: 1,
        type: 'response',
        id: sent.id,
        payload: { result: 'ok' },
      });

      await promise;

      // clearTimeout should have been called to cancel the pending timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});
