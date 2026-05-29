import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { PROTOCOL_VERSION } from '@ymir/shared';
import type { MessageEnvelope, ResponseEnvelope } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

type MessageHandler = (envelope: MessageEnvelope) => void;

let messageHandlers: MessageHandler[] = [];
let sentEnvelopes: MessageEnvelope[] = [];

function resetMock() {
  messageHandlers = [];
  sentEnvelopes = [];
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

describe('sendRequest', () => {
  let sendRequest: typeof import('./send-request').sendRequest;

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
});
