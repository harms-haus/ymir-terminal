/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { PROTOCOL_VERSION } from '@ymir/shared';
import type { MessageEnvelope, ResponseEnvelope } from '@ymir/shared';
import { AuthProvider, useAuth } from './useAuth';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

const mockConnect = mock(() => {});
const mockSend = mock(() => {});
const mockDisconnect = mock(() => {});
const mockSetToken = mock(() => {});
const mockOnMessage = mock(() => () => {});
const mockOnStatusChange = mock(() => () => {});

let messageHandler: ((envelope: MessageEnvelope) => void) | null = null;

mock.module('../lib/ws-client', () => ({
  wsClient: {
    connect: mockConnect,
    send: mockSend,
    disconnect: mockDisconnect,
    setToken: mockSetToken,
    onMessage: (handler: (envelope: MessageEnvelope) => void) => {
      messageHandler = handler;
      return mockOnMessage();
    },
    onStatusChange: (handler: (status: string) => void) => {
      // Immediately notify connected so the login flow proceeds
      handler('connected');
      return mockOnStatusChange();
    },
    getStatus: () => 'disconnected' as const,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AuthProvider, null, children);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    mockConnect.mockClear();
    mockSend.mockClear();
    mockDisconnect.mockClear();
    mockSetToken.mockClear();
    mockOnMessage.mockClear();
    mockOnStatusChange.mockClear();
    messageHandler = null;
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -----------------------------------------------------------------------
  // 1. useAuth() returns { isAuthenticated, token, login, logout }
  // -----------------------------------------------------------------------
  test('returns isAuthenticated, token, login, and logout', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('token');
    expect(result.current).toHaveProperty('login');
    expect(result.current).toHaveProperty('logout');
    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
  });

  // -----------------------------------------------------------------------
  // 2. login(password) sends auth request via wsClient, stores token on success
  // -----------------------------------------------------------------------
  test('login(password) sends auth request and stores token on success', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    let resolveLogin: () => void;
    const loginPromise = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });

    // Start login
    await act(async () => {
      result.current.login('mypassword').then(() => resolveLogin());
    });

    // Should have connected and sent an auth request
    expect(mockConnect).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalled();

    // Verify the envelope structure
    const sentCall = mockSend.mock.calls[0];
    const envelope = sentCall[0] as MessageEnvelope;
    expect(envelope.type).toBe('request');
    expect(envelope.payload).toEqual({ password: 'mypassword' });

    // Simulate successful auth response
    await act(async () => {
      messageHandler!({
        v: PROTOCOL_VERSION,
        type: 'response',
        id: envelope.id!,
        payload: { token: 'jwt-test-token', expiresIn: 3600 },
      });
    });

    await loginPromise;

    // Token should be stored
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('jwt-test-token');
    expect(mockSetToken).toHaveBeenCalledWith('jwt-test-token');
  });

  // -----------------------------------------------------------------------
  // 3. logout() clears token
  // -----------------------------------------------------------------------
  test('logout() clears token', () => {
    // Pre-set a token in localStorage
    localStorage.setItem('ymir-token', 'existing-token');

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Should start authenticated because of localStorage
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('existing-token');

    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. Token is persisted in localStorage
  // -----------------------------------------------------------------------
  test('token is persisted in localStorage', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Perform login
    await act(async () => {
      const loginPromise = result.current.login('mypassword');
      // Yield to allow login's internal await (wait-for-connected) to resolve
      await new Promise((r) => setTimeout(r, 0));
      const envelope = mockSend.mock.calls[0][0] as MessageEnvelope;
      messageHandler!({
        v: PROTOCOL_VERSION,
        type: 'response',
        id: envelope.id!,
        payload: { token: 'persisted-token', expiresIn: 3600 },
      });
      await loginPromise;
    });

    expect(localStorage.getItem('ymir-token')).toBe('persisted-token');
  });

  // -----------------------------------------------------------------------
  // 5. On mount, checks localStorage for existing token
  // -----------------------------------------------------------------------
  test('on mount, checks localStorage for existing token', () => {
    localStorage.setItem('ymir-token', 'saved-token');

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('saved-token');
    expect(mockSetToken).toHaveBeenCalledWith('saved-token');
  });

  // -----------------------------------------------------------------------
  // 6. login failure does not store token
  // -----------------------------------------------------------------------
  test('login failure does not store token', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const loginPromise = result.current.login('wrong-password');
      // Yield to allow login's internal await (wait-for-connected) to resolve
      await new Promise((r) => setTimeout(r, 0));
      const envelope = mockSend.mock.calls[0][0] as MessageEnvelope;
      messageHandler!({
        v: PROTOCOL_VERSION,
        type: 'response',
        id: envelope.id!,
        payload: null,
        error: { code: 'AUTH_FAILED', message: 'Invalid password' },
      } as ResponseEnvelope);

      try {
        await loginPromise;
      } catch {
        // Expected
      }
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('ymir-token')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 7. useAuth throws when used outside AuthProvider
  // -----------------------------------------------------------------------
  test('useAuth throws when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow();
  });

  // -----------------------------------------------------------------------
  // 8. AUTH_REQUIRED push clears token and sets isAuthenticated to false
  // -----------------------------------------------------------------------
  test('AUTH_REQUIRED push clears token and sets isAuthenticated to false', async () => {
    // Pre-set a token so the user starts authenticated
    localStorage.setItem('ymir-token', 'valid-jwt');

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Should start authenticated
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('valid-jwt');

    // Simulate server pushing AUTH_REQUIRED on a non-auth channel
    await act(async () => {
      messageHandler!({
        v: PROTOCOL_VERSION,
        type: 'response',
        id: 'server-push-1',
        channel: 'data',
        payload: null,
        error: { code: 'AUTH_REQUIRED', message: 'Token expired' },
      } as ResponseEnvelope);
    });

    // Token should be cleared
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('ymir-token')).toBeNull();
  });
});
