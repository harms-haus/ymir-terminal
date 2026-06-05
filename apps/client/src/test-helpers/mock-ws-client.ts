/**
 * Shared mock utilities for the `ws-client` module in client-side tests.
 *
 * Provides `createMockWsClient()` which returns a typed mock wsClient object
 * together with helpers for simulating messages, status changes, and inspecting
 * sent envelopes — eliminating the need for each test file to independently
 * declare the same mock boilerplate.
 *
 * ## Usage
 *
 * ```ts
 * import { setupTestDom } from './mock-setup';
 * await setupTestDom();
 *
 * import { mock } from 'bun:test';
 * import { createMockWsClient, mockWsClientModule } from './mock-ws-client';
 * const { wsClient, mockSend, simulateMessage, ... } = createMockWsClient(mock);
 * mockWsClientModule(mock, wsClient);
 *
 * // Then dynamic-import the code under test
 * const { useWorkspaces } = await import('../hooks/useWorkspaces');
 * ```
 *
 * @module mock-ws-client
 */

import type { MessageEnvelope } from '@ymir/shared';
import { PROTOCOL_VERSION } from '@ymir/shared';
import type { ConnectionStatus } from '../lib/ws-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The `mock` function from `bun:test`. */
export type MockFn = <T extends (...args: any[]) => any>(fn: T) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Subset of `WSClient` methods that tests typically need to mock. */
export interface MockWsClientShape {
  connect: ReturnType<MockFn>;
  send: ReturnType<MockFn>;
  disconnect: ReturnType<MockFn>;
  disconnectAndRejectPending: ReturnType<MockFn>;
  setToken: ReturnType<MockFn>;
  onMessage: ReturnType<MockFn>;
  onStatusChange: ReturnType<MockFn>;
  getStatus: ReturnType<MockFn>;
  getUrl: ReturnType<MockFn>;
  getDisconnectEpoch: ReturnType<MockFn>;
}

/** The return value of {@link createMockWsClient}. */
export interface MockWsClientResult {
  /** The mock `wsClient` object to pass to `mockWsClientModule`. */
  wsClient: MockWsClientShape;

  // -- Mock functions (for assertions / clearing) --------------------------

  /** Reference to the `send` mock function. */
  mockSend: ReturnType<MockFn>;
  /** Reference to the `onMessage` mock function. */
  mockOnMessage: ReturnType<MockFn>;
  /** Reference to the `onStatusChange` mock function. */
  mockOnStatusChange: ReturnType<MockFn>;
  /** Reference to the `getStatus` mock function. */
  mockGetStatus: ReturnType<MockFn>;
  /** Reference to the `getUrl` mock function. */
  mockGetUrl: ReturnType<MockFn>;
  /** Reference to the `connect` mock function. */
  mockConnect: ReturnType<MockFn>;
  /** Reference to the `disconnect` mock function. */
  mockDisconnect: ReturnType<MockFn>;
  /** Reference to the `setToken` mock function. */
  mockSetToken: ReturnType<MockFn>;

  // -- Simulate helpers ----------------------------------------------------

  /** Simulate an incoming message by calling all registered `onMessage` handlers. */
  simulateMessage: (envelope: MessageEnvelope) => void;

  /** Simulate a status change by calling all registered `onStatusChange` handlers. */
  simulateStatusChange: (status: ConnectionStatus, url?: string) => void;

  /**
   * Simulate a server response whose `id` matches a previously-sent request.
   * Convenience wrapper around `simulateMessage`.
   */
  simulateResponse: (requestId: string, payload: unknown, error?: unknown) => void;

  /**
   * Get the request envelope that was sent via the **last** `wsClient.send` call.
   * Throws if no envelope has been sent.
   */
  getLastSentEnvelope: () => MessageEnvelope;

  /** Get **all** request envelopes that have been sent via `wsClient.send`. */
  getAllSentEnvelopes: () => MessageEnvelope[];

  /**
   * Clear all mock call counts and reset the handler arrays.
   * Call in `beforeEach()` to start each test clean.
   */
  reset: () => void;

  /** Number of currently-registered `onMessage` handlers. */
  readonly messageHandlerCount: number;

  /** Number of currently-registered `onStatusChange` handlers. */
  readonly statusHandlerCount: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateMockWsClientOptions {
  /** Initial connection status returned by `getStatus()`. Default: `'disconnected'`. */
  initialStatus?: ConnectionStatus;

  /**
   * If `true`, `onStatusChange` immediately calls each registered handler
   * with `'connected'` (used by useAuth tests). Default: `false`.
   */
  autoConnect?: boolean;

  /**
   * Initial URL returned by `getUrl()`. Default: `''`.
   */
  initialUrl?: string;
}

/**
 * Create a fully mocked `wsClient` object suitable for registering via
 * `Bun.mock.module('../lib/ws-client', ...)`.
 *
 * **Important:** Pass the `mock` function imported from `'bun:test'` as the
 * first argument so that the mock implementations execute correctly.
 */
export function createMockWsClient(options: CreateMockWsClientOptions = {}): MockWsClientResult {
  let currentStatus: ConnectionStatus = options.initialStatus ?? 'disconnected';
  let currentUrl: string = options.initialUrl ?? '';
  let messageHandlers: Array<(envelope: MessageEnvelope) => void> = [];
  let statusHandlers: Array<(status: ConnectionStatus) => void> = [];
  let sentEnvelopes: MessageEnvelope[] = [];

  // -- Call tracking (avoids Bun mock() cross-module issues) ----------------

  let connectCalls: unknown[][] = [];
  let sendCalls: unknown[][] = [];
  let disconnectCalls: unknown[][] = [];
  let setTokenCalls: unknown[][] = [];
  let onMessageCalls: unknown[][] = [];
  let onStatusChangeCalls: unknown[][] = [];
  let getStatusCalls: unknown[][] = [];
  let getUrlCalls: unknown[][] = [];

  const mockConnect = (...args: unknown[]) => {
    connectCalls.push(args);
  };
  mockConnect.mock = {
    get calls() {
      return connectCalls;
    },
  };
  mockConnect.mockClear = () => {
    connectCalls = [];
  };

  const mockSend = (envelope: MessageEnvelope) => {
    sendCalls.push([envelope]);
    sentEnvelopes.push(envelope);
  };
  mockSend.mock = {
    get calls() {
      return sendCalls;
    },
  };
  mockSend.mockClear = () => {
    sendCalls = [];
  };

  const mockDisconnect = (...args: unknown[]) => {
    disconnectCalls.push(args);
  };
  mockDisconnect.mock = {
    get calls() {
      return disconnectCalls;
    },
  };
  mockDisconnect.mockClear = () => {
    disconnectCalls = [];
  };

  const mockSetToken = (...args: unknown[]) => {
    setTokenCalls.push(args);
  };
  mockSetToken.mock = {
    get calls() {
      return setTokenCalls;
    },
  };
  mockSetToken.mockClear = () => {
    setTokenCalls = [];
  };

  const mockOnMessage = (handler: (envelope: MessageEnvelope) => void) => {
    onMessageCalls.push([handler]);
    messageHandlers.push(handler);
    return () => {
      messageHandlers = messageHandlers.filter((h) => h !== handler);
    };
  };
  mockOnMessage.mock = {
    get calls() {
      return onMessageCalls;
    },
  };
  mockOnMessage.mockClear = () => {
    onMessageCalls = [];
  };

  const mockOnStatusChange = (handler: (status: ConnectionStatus) => void) => {
    onStatusChangeCalls.push([handler]);
    statusHandlers.push(handler);
    if (options.autoConnect) {
      handler('connected');
    }
    return () => {
      statusHandlers = statusHandlers.filter((h) => h !== handler);
    };
  };
  mockOnStatusChange.mock = {
    get calls() {
      return onStatusChangeCalls;
    },
  };
  mockOnStatusChange.mockClear = () => {
    onStatusChangeCalls = [];
  };

  const mockGetStatus = () => {
    getStatusCalls.push([]);
    return currentStatus;
  };
  mockGetStatus.mock = {
    get calls() {
      return getStatusCalls;
    },
  };
  mockGetStatus.mockClear = () => {
    getStatusCalls = [];
  };

  const mockGetUrl = () => {
    getUrlCalls.push([]);
    return currentUrl;
  };
  mockGetUrl.mock = {
    get calls() {
      return getUrlCalls;
    },
  };
  mockGetUrl.mockClear = () => {
    getUrlCalls = [];
  };

  // -- Additional mocks (simple, no complex tracking needed) ----------------

  let disconnectEpoch = 0;
  let disconnectAndRejectPendingCalls: unknown[][] = [];

  const mockGetDisconnectEpoch = () => {
    return disconnectEpoch;
  };
  mockGetDisconnectEpoch.mock = {
    get calls() {
      return [];
    },
  };
  mockGetDisconnectEpoch.mockClear = () => {};

  const mockDisconnectAndRejectPending = (...args: unknown[]) => {
    disconnectAndRejectPendingCalls.push(args);
    disconnectEpoch++;
    mockDisconnect();
  };
  mockDisconnectAndRejectPending.mock = {
    get calls() {
      return disconnectAndRejectPendingCalls;
    },
  };
  mockDisconnectAndRejectPending.mockClear = () => {
    disconnectAndRejectPendingCalls = [];
  };

  // -- wsClient object -----------------------------------------------------

  const wsClient: MockWsClientShape = {
    connect: mockConnect,
    send: mockSend,
    disconnect: mockDisconnect,
    disconnectAndRejectPending: mockDisconnectAndRejectPending,
    setToken: mockSetToken,
    onMessage: mockOnMessage,
    onStatusChange: mockOnStatusChange,
    getStatus: mockGetStatus,
    getUrl: mockGetUrl,
    getDisconnectEpoch: mockGetDisconnectEpoch,
  };

  // -- Helpers -------------------------------------------------------------

  function simulateMessage(envelope: MessageEnvelope) {
    for (const handler of [...messageHandlers]) {
      handler(envelope);
    }
  }

  function simulateStatusChange(status: ConnectionStatus, url?: string) {
    currentStatus = status;
    if (url !== undefined) {
      currentUrl = url;
    }
    for (const handler of [...statusHandlers]) {
      handler(status);
    }
  }

  function simulateResponse(requestId: string, payload: unknown, error?: unknown) {
    const response: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'response',
      id: requestId,
      payload: error ? null : payload,
      ...(error ? { error } : {}),
    };
    simulateMessage(response);
  }

  function getLastSentEnvelope(): MessageEnvelope {
    if (sentEnvelopes.length === 0) {
      throw new Error('No envelopes have been sent yet');
    }
    return sentEnvelopes[sentEnvelopes.length - 1];
  }

  function getAllSentEnvelopes(): MessageEnvelope[] {
    return [...sentEnvelopes];
  }

  function reset() {
    messageHandlers = [];
    statusHandlers = [];
    sentEnvelopes = [];
    currentStatus = options.initialStatus ?? 'disconnected';
    currentUrl = options.initialUrl ?? '';
    disconnectEpoch = 0;
    mockConnect.mockClear();
    mockSend.mockClear();
    mockDisconnect.mockClear();
    mockSetToken.mockClear();
    mockOnMessage.mockClear();
    mockOnStatusChange.mockClear();
    mockGetStatus.mockClear();
    mockGetUrl.mockClear();
  }

  return {
    wsClient,
    mockSend,
    mockOnMessage,
    mockOnStatusChange,
    mockGetStatus,
    mockGetUrl,
    mockConnect,
    mockDisconnect,
    mockSetToken,
    simulateMessage,
    simulateStatusChange,
    simulateResponse,
    getLastSentEnvelope,
    getAllSentEnvelopes,
    reset,
    get messageHandlerCount() {
      return messageHandlers.length;
    },
    get statusHandlerCount() {
      return statusHandlers.length;
    },
  };
}

// ---------------------------------------------------------------------------
// mockModule helper
// ---------------------------------------------------------------------------

/**
 * Register `Bun.mock.module()` for `../lib/ws-client` (or `./ws-client`).
 *
 * **Must be called at module scope** (before any dynamic `await import()`
 * of the code under test).
 *
 * @param mockFn - The `mock` object imported from `'bun:test'`.
 * @param wsClient - The mock wsClient object from `createMockWsClient`.
 * @param mockDir - The relative path from the test file to `ws-client`.
 *                  Defaults to `'../lib/ws-client'`.
 */
export function mockWsClientModule(
  wsClient: MockWsClientShape,
  mockDir: string = '../lib/ws-client',
): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mock: bunMock } = require('bun:test') as unknown as {
    mock: { module: (id: string, factory: () => unknown) => void };
  };
  bunMock.module(mockDir, () => ({ wsClient }));
}
