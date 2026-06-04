/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  PROTOCOL_VERSION,
  WS_RECONNECT_ATTEMPTS,
  WS_RECONNECT_BASE_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
} from '@ymir/shared';
import type { MessageEnvelope } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMockWS() {
  (globalThis as any).WebSocket = MockWebSocket;
  MockWebSocket.reset();
}

function teardownMockWS() {
  delete (globalThis as any).WebSocket;
  MockWebSocket.reset();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WSClient', () => {
  let wsClientModule: typeof import('./ws-client'); // eslint-disable-line @typescript-eslint/consistent-type-imports

  beforeEach(async () => {
    setupMockWS();
    // Bust the module cache so we get a fresh singleton per test
    const mod = await import(`./ws-client?_t=${Date.now()}`);
    wsClientModule = mod;
  });

  afterEach(() => {
    // Disconnect any active client to clear timers
    wsClientModule.wsClient.disconnect();
    teardownMockWS();
  });

  // -----------------------------------------------------------------------
  // 1. connect(url) creates a WebSocket connection
  // -----------------------------------------------------------------------
  test('connect(url) creates a WebSocket connection', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');

    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8080');
  });

  // -----------------------------------------------------------------------
  // 2. send(envelope) serializes to JSON and sends
  // -----------------------------------------------------------------------
  test('send(envelope) serializes to JSON and sends', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const envelope: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'request',
      id: 'test-1',
      payload: { action: 'ping' },
    };

    wsClient.send(envelope);

    expect(ws.sent.length).toBe(1);
    expect(JSON.parse(ws.sent[0])).toEqual(envelope);
  });

  // -----------------------------------------------------------------------
  // 3. onMessage(callback) registers a message handler
  // -----------------------------------------------------------------------
  test('onMessage(callback) registers a message handler', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const received: MessageEnvelope[] = [];
    wsClient.onMessage((envelope) => received.push(envelope));

    const incoming: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'response',
      id: 'test-1',
      payload: { status: 'ok' },
    };
    ws.simulateMessage(incoming);

    expect(received.length).toBe(1);
    expect(received[0]).toEqual(incoming);
  });

  // -----------------------------------------------------------------------
  // 3b. onMessage returns an unsubscribe function
  // -----------------------------------------------------------------------
  test('onMessage returns an unsubscribe function', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const received: MessageEnvelope[] = [];
    const unsub = wsClient.onMessage((envelope) => received.push(envelope));

    unsub();

    const incoming: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'event',
      payload: { data: 'should-not-arrive' },
    };
    ws.simulateMessage(incoming);

    expect(received.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 4. onStatusChange(callback) registers a connection status handler
  // -----------------------------------------------------------------------
  test('onStatusChange(callback) registers a connection status handler', () => {
    const { wsClient } = wsClientModule;
    const statuses: string[] = [];
    wsClient.onStatusChange((s) => statuses.push(s));

    wsClient.connect('ws://localhost:8080');
    expect(statuses).toContain('connecting');

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    expect(statuses).toContain('connected');
  });

  // -----------------------------------------------------------------------
  // 4b. onStatusChange returns an unsubscribe function
  // -----------------------------------------------------------------------
  test('onStatusChange returns an unsubscribe function', () => {
    const { wsClient } = wsClientModule;
    const statuses: string[] = [];
    const unsub = wsClient.onStatusChange((s) => statuses.push(s));

    unsub();

    wsClient.connect('ws://localhost:8080');
    expect(statuses.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 5. When connection drops, reconnection is attempted (up to max attempts)
  // -----------------------------------------------------------------------
  test('reconnection is attempted when connection drops', () => {
    const { wsClient } = wsClientModule;

    const originalSetTimeout = globalThis.setTimeout;
    const timers: Array<{ cb: () => void; delay: number }> = [];
    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      const id = timers.length;
      timers.push({ cb, delay: delay ?? 0 });
      return id as any;
    }) as any;

    try {
      const statuses: string[] = [];
      wsClient.onStatusChange((s) => statuses.push(s));

      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      statuses.length = 0;

      // Simulate connection drop
      ws.simulateClose();

      // Should have notified 'disconnected' then 'reconnecting'
      expect(statuses).toContain('disconnected');
      expect(statuses).toContain('reconnecting');

      // Should have scheduled a reconnect timer
      expect(timers.length).toBeGreaterThanOrEqual(1);

      // Fire the reconnect timer
      timers[0].cb();

      // A new WebSocket should have been created
      expect(MockWebSocket.instances.length).toBe(2);
      expect(MockWebSocket.instances[1].url).toBe('ws://localhost:8080');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // 5b. Reconnection stops after max attempts
  // -----------------------------------------------------------------------
  test('reconnection stops after max attempts', () => {
    const { wsClient } = wsClientModule;

    const originalSetTimeout = globalThis.setTimeout;
    const timers: Array<{ cb: () => void; delay: number }> = [];
    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      const id = timers.length;
      timers.push({ cb, delay: delay ?? 0 });
      return id as any;
    }) as any;

    try {
      const statuses: string[] = [];
      wsClient.onStatusChange((s) => statuses.push(s));

      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      statuses.length = 0;

      // Simulate connection drop
      ws.simulateClose();

      // Exhaust all reconnect attempts
      for (let i = 0; i < WS_RECONNECT_ATTEMPTS; i++) {
        const timer = timers[timers.length - 1];
        if (timer) {
          timer.cb();
        }
        const latest = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        if (latest && latest.readyState !== MockWebSocket.OPEN) {
          if (MockWebSocket.instances.length > 1 + i) {
            latest.simulateClose();
          }
        }
      }

      // After max attempts, simulating another close should NOT schedule a new timer
      const timerCountBefore = timers.length;
      const latest = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      if (latest) {
        latest.simulateClose();
      }
      expect(timers.length).toBe(timerCountBefore);

      // Final status should be 'disconnected'
      expect(statuses[statuses.length - 1]).toBe('disconnected');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // 6. Reconnection delay increases with each attempt
  // -----------------------------------------------------------------------
  test('reconnection delay increases with each attempt', async () => {
    // Use fake timers that record delays
    const originalSetTimeout = globalThis.setTimeout;
    const delays: number[] = [];
    const timers2: Array<{ cb: () => void; delay: number }> = [];
    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      timers2.push({ cb, delay: delay ?? 0 });
      delays.push(delay ?? 0);
      return timers2.length as any;
    }) as any;

    try {
      // Re-import for clean state
      teardownMockWS();
      setupMockWS();
      const mod = await import(`./ws-client?_t=${Date.now()}2`);
      const client = mod.wsClient;

      client.connect('ws://localhost:8080');
      const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws2.simulateOpen();

      // Simulate drop - this schedules first reconnect
      ws2.simulateClose();

      // Fire each reconnect timer and simulate close on new sockets
      for (let i = 0; i < Math.min(3, WS_RECONNECT_ATTEMPTS); i++) {
        const t = timers2[timers2.length - 1];
        if (!t) break;

        t.cb();

        const latest = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        if (latest) {
          latest.simulateClose();
        }
      }

      // Check that delays are increasing (exponential backoff)
      expect(delays.length).toBeGreaterThanOrEqual(2);

      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
      }

      // First delay should be the base delay
      expect(delays[0]).toBe(WS_RECONNECT_BASE_DELAY_MS);

      // All delays should be capped at max
      for (const d of delays) {
        expect(d).toBeLessThanOrEqual(WS_RECONNECT_MAX_DELAY_MS);
      }

      client.disconnect();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // 7. disconnect() closes the connection and stops reconnection
  // -----------------------------------------------------------------------
  test('disconnect() closes the connection and stops reconnection', () => {
    const { wsClient } = wsClientModule;

    const originalSetTimeout = globalThis.setTimeout;
    const timers: Array<{ cb: () => void; delay: number }> = [];
    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      timers.push({ cb, delay: delay ?? 0 });
      return timers.length as any;
    }) as any;

    try {
      const statuses: string[] = [];
      wsClient.onStatusChange((s) => statuses.push(s));

      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      statuses.length = 0;

      // Simulate drop to schedule a reconnect timer
      ws.simulateClose();
      expect(timers.length).toBeGreaterThanOrEqual(1);

      // Now disconnect
      wsClient.disconnect();

      expect(statuses).toContain('disconnected');

      // After disconnect, getStatus should return disconnected
      expect(wsClient.getStatus()).toBe('disconnected');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // 8. Connection status transitions
  // -----------------------------------------------------------------------
  test('connection status transitions: connecting -> connected -> disconnected -> reconnecting -> connected', () => {
    const { wsClient } = wsClientModule;

    const originalSetTimeout = globalThis.setTimeout;
    const timers: Array<{ cb: () => void; delay: number }> = [];
    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      const id = timers.length;
      timers.push({ cb, delay: delay ?? 0 });
      return id as any;
    }) as any;

    try {
      const statuses: string[] = [];
      wsClient.onStatusChange((s) => statuses.push(s));

      // connecting
      wsClient.connect('ws://localhost:8080');
      expect(wsClient.getStatus()).toBe('connecting');

      // connected
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      expect(wsClient.getStatus()).toBe('connected');

      // disconnected (connection drop)
      ws.simulateClose();
      expect(wsClient.getStatus()).toBe('reconnecting');

      // Fire reconnect timer
      timers[0].cb();

      // New WS should be created
      const ws2 = MockWebSocket.instances[1];
      expect(ws2).toBeDefined();

      // Simulate successful reconnect
      ws2.simulateOpen();
      expect(wsClient.getStatus()).toBe('connected');

      // Verify full transition sequence
      expect(statuses).toEqual([
        'connecting',
        'connected',
        'disconnected',
        'reconnecting',
        'connecting',
        'connected',
      ]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // setToken(token) attaches token to outbound messages
  // -----------------------------------------------------------------------
  test('setToken(token) attaches token to outbound messages', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    wsClient.setToken('my-jwt-token');

    const envelope: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'request',
      id: 'test-token',
      payload: { action: 'do-stuff' },
    };

    wsClient.send(envelope);

    expect(ws.sent.length).toBe(1);
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.token).toBe('my-jwt-token');
  });

  // -----------------------------------------------------------------------
  // send() no-ops when not connected
  // -----------------------------------------------------------------------
  test('send() does not send when not connected', () => {
    const { wsClient } = wsClientModule;

    const envelope: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'request',
      id: 'test-no-conn',
      payload: {},
    };

    // Should not throw, just no-op
    wsClient.send(envelope);

    // No WebSocket was created
    expect(MockWebSocket.instances.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Multiple onMessage handlers all receive messages
  // -----------------------------------------------------------------------
  test('multiple onMessage handlers all receive messages', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const received1: MessageEnvelope[] = [];
    const received2: MessageEnvelope[] = [];
    wsClient.onMessage((e) => received1.push(e));
    wsClient.onMessage((e) => received2.push(e));

    const incoming: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'event',
      payload: { data: 'hello' },
    };
    ws.simulateMessage(incoming);

    expect(received1.length).toBe(1);
    expect(received2.length).toBe(1);
    expect(received1[0]).toEqual(incoming);
    expect(received2[0]).toEqual(incoming);
  });

  // -----------------------------------------------------------------------
  // onerror handler: status becomes 'disconnected' after error + close
  // -----------------------------------------------------------------------
  test('onerror followed by close transitions to disconnected', () => {
    const { wsClient } = wsClientModule;

    const originalSetTimeout = globalThis.setTimeout;
    const timers: Array<{ cb: () => void; delay: number }> = [];
    globalThis.setTimeout = ((cb: () => void, delay?: number) => {
      const id = timers.length;
      timers.push({ cb, delay: delay ?? 0 });
      return id as any;
    }) as any;

    try {
      const statuses: string[] = [];
      wsClient.onStatusChange((s) => statuses.push(s));

      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      statuses.length = 0;

      // Simulate an error event (real WebSocket fires onerror then onclose)
      ws.onerror?.({});
      ws.simulateClose();

      // Status should have transitioned through 'disconnected' and then 'reconnecting'
      expect(statuses).toContain('disconnected');
      expect(statuses).toContain('reconnecting');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  // -----------------------------------------------------------------------
  // Pending messages are flushed when connection opens
  // -----------------------------------------------------------------------
  test('pending messages are flushed when connection opens', () => {
    const { wsClient } = wsClientModule;

    const envelope1: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'request',
      id: 'pending-1',
      payload: { action: 'a' },
    };
    const envelope2: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'request',
      id: 'pending-2',
      payload: { action: 'b' },
    };

    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];

    // Do NOT open yet — messages should be queued
    wsClient.send(envelope1);
    wsClient.send(envelope2);

    // Nothing sent on the wire yet
    expect(ws.sent.length).toBe(0);

    // Now open the connection — pending messages should flush
    ws.simulateOpen();

    expect(ws.sent.length).toBe(2);
    const sent1 = JSON.parse(ws.sent[0]);
    const sent2 = JSON.parse(ws.sent[1]);
    // Check the envelope fields (token may or may not be present from prior tests)
    expect(sent1.id).toBe('pending-1');
    expect(sent1.payload).toEqual({ action: 'a' });
    expect(sent1.type).toBe('request');
    expect(sent1.v).toBe(PROTOCOL_VERSION);
    expect(sent2.id).toBe('pending-2');
    expect(sent2.payload).toEqual({ action: 'b' });
    expect(sent2.type).toBe('request');
    expect(sent2.v).toBe(PROTOCOL_VERSION);
  });

  // -----------------------------------------------------------------------
  // Pending messages are capped at MAX_PENDING_MESSAGES (100)
  // -----------------------------------------------------------------------
  test('pending messages are capped at max pending limit', () => {
    const { wsClient } = wsClientModule;

    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    // Do NOT open — keep it in CONNECTING state so sends are queued

    // Enqueue 101 messages
    for (let i = 0; i < 101; i++) {
      wsClient.send({
        v: PROTOCOL_VERSION,
        type: 'request',
        id: `msg-${i}`,
        payload: { i },
      });
    }

    // Only the last 100 should be kept (the first was shifted out)
    // Open the connection to flush
    ws.simulateOpen();

    expect(ws.sent.length).toBe(100);

    // The first message sent should be msg-1 (msg-0 was dropped)
    const first = JSON.parse(ws.sent[0]);
    expect(first.id).toBe('msg-1');

    // The last message sent should be msg-100
    const last = JSON.parse(ws.sent[99]);
    expect(last.id).toBe('msg-100');
  });

  // -----------------------------------------------------------------------
  // Pending messages are cleared on disconnect
  // -----------------------------------------------------------------------
  test('pending messages are cleared on disconnect', () => {
    const { wsClient } = wsClientModule;

    wsClient.connect('ws://localhost:8080');
    const _ws = MockWebSocket.instances[0];

    // Queue messages while not open
    wsClient.send({
      v: PROTOCOL_VERSION,
      type: 'request',
      id: 'pending-msg',
      payload: {},
    });

    // Disconnect without opening
    wsClient.disconnect();

    // Reconnect and open — previously pending messages should be gone
    wsClient.connect('ws://localhost:8080');
    const ws2 = MockWebSocket.instances[1];
    ws2.simulateOpen();

    // Nothing should have been sent from the old queue
    expect(ws2.sent.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // addRequestHandler routes messages by ID to the registered handler
  // -----------------------------------------------------------------------
  test('addRequestHandler routes messages by ID to the registered handler', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const received: MessageEnvelope[] = [];
    wsClient.addRequestHandler('req-1', (envelope) => received.push(envelope));

    const matching: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'response',
      id: 'req-1',
      payload: { result: 'ok' },
    };
    ws.simulateMessage(matching);

    expect(received.length).toBe(1);
    expect(received[0]).toEqual(matching);
  });

  // -----------------------------------------------------------------------
  // addRequestHandler does not match messages without an id
  // -----------------------------------------------------------------------
  test('addRequestHandler does not match messages without an id', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const received: MessageEnvelope[] = [];
    wsClient.addRequestHandler('req-1', (envelope) => received.push(envelope));

    // Message without id — should not match
    ws.simulateMessage({
      v: PROTOCOL_VERSION,
      type: 'event',
      payload: { data: 'no-id' },
    });

    expect(received.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // request handler takes priority over broadcast handlers
  // -----------------------------------------------------------------------
  test('request handler takes priority over broadcast handlers', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const broadcastReceived: MessageEnvelope[] = [];
    const requestReceived: MessageEnvelope[] = [];

    wsClient.onMessage((e) => broadcastReceived.push(e));
    wsClient.addRequestHandler('req-1', (e) => requestReceived.push(e));

    // Send a message with matching id — only request handler should fire
    ws.simulateMessage({
      v: PROTOCOL_VERSION,
      type: 'response',
      id: 'req-1',
      payload: { result: 'ok' },
    });

    expect(requestReceived.length).toBe(1);
    expect(broadcastReceived.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // removeRequestHandler removes the request handler
  // -----------------------------------------------------------------------
  test('removeRequestHandler removes the request handler', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const received: MessageEnvelope[] = [];
    wsClient.addRequestHandler('req-1', (e) => received.push(e));
    wsClient.removeRequestHandler('req-1');

    ws.simulateMessage({
      v: PROTOCOL_VERSION,
      type: 'response',
      id: 'req-1',
      payload: { result: 'ok' },
    });

    expect(received.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Malformed JSON in onmessage does not crash and no handler is called
  // -----------------------------------------------------------------------
  test('malformed JSON in onmessage does not crash and no handler is called', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const received: MessageEnvelope[] = [];
    wsClient.onMessage((envelope) => received.push(envelope));

    // Send raw non-JSON string directly via onmessage
    ws.onmessage?.({ data: 'not json' });

    // No handler should have been called
    expect(received.length).toBe(0);

    // Client should still be connected and functional
    expect(wsClient.getStatus()).toBe('connected');
  });

  // -----------------------------------------------------------------------
  // rAF batching: high-frequency channels are batched until rAF fires
  // -----------------------------------------------------------------------
  test('high-frequency channel messages are batched until rAF fires', () => {
    const { wsClient } = wsClientModule;

    // Mock requestAnimationFrame and cancelAnimationFrame
    const originalRAF = globalThis.requestAnimationFrame;
    const originalCAF = globalThis.cancelAnimationFrame;
    const rafCalls: Array<{ cb: () => void }> = [];
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafCalls.push({ cb });
      return rafCalls.length;
    }) as any;
    globalThis.cancelAnimationFrame = (() => {}) as any;

    try {
      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      const received: MessageEnvelope[] = [];
      wsClient.onMessage((e) => received.push(e));

      // Send multiple messages on a high-frequency channel
      const msg1: MessageEnvelope = {
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'terminal.output',
        payload: { data: 'line1' },
      };
      const msg2: MessageEnvelope = {
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'terminal.output',
        payload: { data: 'line2' },
      };
      const msg3: MessageEnvelope = {
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'file.change',
        payload: { path: '/foo' },
      };

      ws.simulateMessage(msg1);
      ws.simulateMessage(msg2);
      ws.simulateMessage(msg3);

      // Should have scheduled a rAF
      expect(rafCalls.length).toBe(1);

      // Messages should NOT have been dispatched yet (still buffered)
      expect(received.length).toBe(0);

      // Fire the rAF callback
      rafCalls[0].cb();

      // All three messages should now be dispatched
      expect(received.length).toBe(3);
      expect(received[0]).toEqual(msg1);
      expect(received[1]).toEqual(msg2);
      expect(received[2]).toEqual(msg3);
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
      globalThis.cancelAnimationFrame = originalCAF;
    }
  });

  // -----------------------------------------------------------------------
  // Only one rAF is scheduled even for multiple high-frequency messages
  // -----------------------------------------------------------------------
  test('only one rAF is scheduled for multiple high-frequency messages', () => {
    const { wsClient } = wsClientModule;

    const originalRAF = globalThis.requestAnimationFrame;
    const originalCAF = globalThis.cancelAnimationFrame;
    const rafCalls: Array<{ cb: () => void }> = [];
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafCalls.push({ cb });
      return rafCalls.length;
    }) as any;
    globalThis.cancelAnimationFrame = (() => {}) as any;

    try {
      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      wsClient.onMessage(() => {});

      // Send first message — schedules first rAF
      ws.simulateMessage({
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'terminal.output',
        payload: {},
      });
      expect(rafCalls.length).toBe(1);

      // Send second message — should NOT schedule a second rAF
      ws.simulateMessage({
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'git.statusChange',
        payload: {},
      });
      expect(rafCalls.length).toBe(1);
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
      globalThis.cancelAnimationFrame = originalCAF;
    }
  });

  // -----------------------------------------------------------------------
  // Low-frequency (non-high-freq) messages dispatch immediately
  // -----------------------------------------------------------------------
  test('low-frequency channel messages dispatch immediately', () => {
    const { wsClient } = wsClientModule;

    const originalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (() => {
      throw new Error('rAF should not be called for low-frequency messages');
    }) as any;

    try {
      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      const received: MessageEnvelope[] = [];
      wsClient.onMessage((e) => received.push(e));

      const msg: MessageEnvelope = {
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'some.other.channel',
        payload: { data: 'low-freq' },
      };
      ws.simulateMessage(msg);

      // Should have been dispatched immediately
      expect(received.length).toBe(1);
      expect(received[0]).toEqual(msg);
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
    }
  });

  // -----------------------------------------------------------------------
  // Messages without channel dispatch immediately (not batched)
  // -----------------------------------------------------------------------
  test('messages without a channel dispatch immediately', () => {
    const { wsClient } = wsClientModule;

    const originalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (() => {
      throw new Error('rAF should not be called for channel-less messages');
    }) as any;

    try {
      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      const received: MessageEnvelope[] = [];
      wsClient.onMessage((e) => received.push(e));

      const msg: MessageEnvelope = {
        v: PROTOCOL_VERSION,
        type: 'event',
        payload: { data: 'no-channel' },
      };
      ws.simulateMessage(msg);

      expect(received.length).toBe(1);
      expect(received[0]).toEqual(msg);
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
    }
  });

  // -----------------------------------------------------------------------
  // Request handler fires immediately even for high-frequency channel
  // -----------------------------------------------------------------------
  test('request handler fires immediately for high-frequency channel message', () => {
    const { wsClient } = wsClientModule;

    const originalRAF = globalThis.requestAnimationFrame;
    const originalCAF = globalThis.cancelAnimationFrame;
    const rafCalls: Array<{ cb: () => void }> = [];
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafCalls.push({ cb });
      return rafCalls.length;
    }) as any;
    globalThis.cancelAnimationFrame = (() => {}) as any;

    try {
      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      const requestReceived: MessageEnvelope[] = [];
      const broadcastReceived: MessageEnvelope[] = [];

      wsClient.addRequestHandler('req-highfreq', (e) => requestReceived.push(e));
      wsClient.onMessage((e) => broadcastReceived.push(e));

      // Send a message that matches the request handler AND is on a high-frequency channel
      ws.simulateMessage({
        v: PROTOCOL_VERSION,
        type: 'response',
        id: 'req-highfreq',
        channel: 'terminal.output',
        payload: { result: 'immediate' },
      });

      // Request handler should have fired immediately
      expect(requestReceived.length).toBe(1);
      expect(requestReceived[0].payload).toEqual({ result: 'immediate' });

      // Broadcast handlers should NOT have been called (request handler took priority)
      expect(broadcastReceived.length).toBe(0);

      // No rAF should have been scheduled since the request handler consumed the message
      expect(rafCalls.length).toBe(0);
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
      globalThis.cancelAnimationFrame = originalCAF;
    }
  });

  // -----------------------------------------------------------------------
  // flushSync immediately processes buffered messages
  // -----------------------------------------------------------------------
  test('flushSync immediately processes buffered high-frequency messages', () => {
    const { wsClient } = wsClientModule;

    const originalRAF = globalThis.requestAnimationFrame;
    const originalCAF = globalThis.cancelAnimationFrame;
    const rafCalls: Array<{ cb: () => void }> = [];
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafCalls.push({ cb });
      return rafCalls.length;
    }) as any;
    globalThis.cancelAnimationFrame = (() => {}) as any;

    try {
      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      const received: MessageEnvelope[] = [];
      wsClient.onMessage((e) => received.push(e));

      // Buffer some high-frequency messages
      ws.simulateMessage({
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'terminal.output',
        payload: { data: 'buffered1' },
      });
      ws.simulateMessage({
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'git.statusChange',
        payload: { data: 'buffered2' },
      });

      // Not yet dispatched
      expect(received.length).toBe(0);

      // flushSync should process them immediately
      wsClient.flushSync();

      expect(received.length).toBe(2);
      expect(received[0].payload).toEqual({ data: 'buffered1' });
      expect(received[1].payload).toEqual({ data: 'buffered2' });

      // rAF should have been cancelled (rafHandle was set)
      // After flushSync, the buffer is empty and rafHandle is null
      expect(rafCalls.length).toBe(1); // original rAF was scheduled
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
      globalThis.cancelAnimationFrame = originalCAF;
    }
  });

  // -----------------------------------------------------------------------
  // flushSync with empty buffer does nothing
  // -----------------------------------------------------------------------
  test('flushSync with empty buffer does nothing', () => {
    const { wsClient } = wsClientModule;
    wsClient.connect('ws://localhost:8080');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Should not throw or error
    wsClient.flushSync();
  });

  // -----------------------------------------------------------------------
  // Disconnect clears the message buffer and cancels rAF
  // -----------------------------------------------------------------------
  test('disconnect clears the message buffer', () => {
    const { wsClient } = wsClientModule;

    const originalRAF = globalThis.requestAnimationFrame;
    const originalCAF = globalThis.cancelAnimationFrame;
    let cafCalled = false;
    const rafCalls: Array<{ cb: () => void }> = [];
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafCalls.push({ cb });
      return rafCalls.length;
    }) as any;
    globalThis.cancelAnimationFrame = ((_handle: number) => {
      cafCalled = true;
    }) as any;

    try {
      wsClient.connect('ws://localhost:8080');
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      const received: MessageEnvelope[] = [];
      wsClient.onMessage((e) => received.push(e));

      // Buffer a high-frequency message
      ws.simulateMessage({
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'terminal.output',
        payload: { data: 'will-be-cleared' },
      });

      expect(received.length).toBe(0);

      // Disconnect should cancel rAF and clear the buffer
      wsClient.disconnect();

      expect(cafCalled).toBe(true);

      // Reconnect and verify the old buffered message is gone
      wsClient.connect('ws://localhost:8080');
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();

      // No message should arrive from the old buffer
      expect(received.length).toBe(0);
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
      globalThis.cancelAnimationFrame = originalCAF;
    }
  });
});
