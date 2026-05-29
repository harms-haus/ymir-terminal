/**
 * Shared test utilities for server-side WebSocket handler tests.
 *
 * Provides the `mockConn()` and `request()` helpers that are duplicated
 * across auth, terminal, files, and workspaces test files.
 */

import { PROTOCOL_VERSION, type RequestEnvelope } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock connection
// ---------------------------------------------------------------------------

export interface MockConnection {
  sessionId: string;
  isAuthenticated: boolean;
  sent: unknown[];
  send(data: unknown): void;
}

/**
 * Create a minimal mock connection object.
 *
 * @param overrides - Optional overrides for sessionId / isAuthenticated.
 */
export function mockConn(
  overrides?: Partial<Pick<MockConnection, 'sessionId' | 'isAuthenticated'>>,
): MockConnection {
  const sent: unknown[] = [];
  return {
    sessionId: overrides?.sessionId ?? crypto.randomUUID(),
    isAuthenticated: overrides?.isAuthenticated ?? true,
    sent,
    send(data: unknown) {
      sent.push(data);
    },
  };
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

/**
 * Build a request envelope for the given channel + payload.
 *
 * @param channel - The channel string (e.g. 'auth', 'terminal.create').
 * @param payload - The request payload.
 * @param token   - Optional auth token to attach.
 */
export function request<T = unknown>(
  channel: string,
  payload: T,
  token?: string,
): RequestEnvelope<T> {
  return {
    v: PROTOCOL_VERSION,
    type: 'request',
    id: crypto.randomUUID(),
    channel,
    payload,
    ...(token ? { token } : {}),
  } as RequestEnvelope<T>;
}
