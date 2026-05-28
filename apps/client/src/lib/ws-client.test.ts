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
  let wsClientModule: typeof import('./ws-client');

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
});
