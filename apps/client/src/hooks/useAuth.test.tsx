/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { PROTOCOL_VERSION } from '@ymir/shared';
import type { ResponseEnvelope } from '@ymir/shared';
import { createMockWsClient } from '../test-helpers/mock-ws-client';

// ---------------------------------------------------------------------------
// Mock control variables (module scope for closure access in mock factories)
// ---------------------------------------------------------------------------

let mockConnectionUrl: string | null = 'ws://localhost:3000/ws';
let mockIsTauri = false;
let sendRequestResult: unknown = { token: 'test-token', expiresIn: 3600 };
let sendRequestError: Error | null = null;

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

const mockWs = createMockWsClient({ initialStatus: 'disconnected', autoConnect: true });
mock.module('../lib/ws-client', () => ({ wsClient: mockWs.wsClient }));

// ---------------------------------------------------------------------------
// Mock send-request module
// ---------------------------------------------------------------------------

const mockSendRequest = mock(async () => {
  if (sendRequestError) throw sendRequestError;
  return sendRequestResult;
});
mock.module('../lib/send-request', () => ({
  sendRequest: mockSendRequest,
}));

// ---------------------------------------------------------------------------
// Mock useTauri module
// ---------------------------------------------------------------------------

const mockGetTauriConfig = mock(async () => null);
mock.module('./useTauri', () => ({
  useTauri: () => ({
    isTauri: mockIsTauri,
    getTauriConfig: mockGetTauriConfig,
  }),
}));

// ---------------------------------------------------------------------------
// Mock ConnectionUrlContext module
// ---------------------------------------------------------------------------

mock.module('../contexts/ConnectionUrlContext', () => ({
  useConnectionUrl: () => mockConnectionUrl,
}));

// ---------------------------------------------------------------------------
// Import code under test (after all mocks so Bun applies them)
// ---------------------------------------------------------------------------

const { AuthProvider, useAuth } = await import('./useAuth');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AuthProvider, null, children);
  };
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

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    mockConnectionUrl = 'ws://localhost:3000/ws';
    mockIsTauri = false;
    sendRequestResult = { token: 'test-token', expiresIn: 3600 };
    sendRequestError = null;
    mockWs.reset();
    mockSendRequest.mockClear();
    mockGetTauriConfig.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -----------------------------------------------------------------------
  // 1. useAuth() returns { isAuthenticated, token, login, logout, clearToken, suppressAutoLogin }
  // -----------------------------------------------------------------------
  test('returns isAuthenticated, token, login, logout, clearToken, and suppressAutoLogin', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('token');
    expect(result.current).toHaveProperty('login');
    expect(result.current).toHaveProperty('logout');
    expect(result.current).toHaveProperty('clearToken');
    expect(result.current).toHaveProperty('suppressAutoLogin');
    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.clearToken).toBe('function');
    expect(typeof result.current.suppressAutoLogin).toBe('function');
  });

  // -----------------------------------------------------------------------
  // 2. login(password) sends auth request via sendRequest, stores token on success
  // -----------------------------------------------------------------------
  test('login(password) sends auth request and stores token on success', async () => {
    sendRequestResult = { token: 'jwt-test-token', expiresIn: 3600 };

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.login('mypassword');
    });

    expect(mockSendRequest).toHaveBeenCalledWith('auth', { password: 'mypassword' });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('jwt-test-token');
    expect(mockWs.mockSetToken.mock.calls.some((c) => c[0] === 'jwt-test-token')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 3. logout() clears token and disconnects
  // -----------------------------------------------------------------------
  test('logout() clears token', () => {
    localStorage.setItem('ymir-token', 'existing-token');

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('existing-token');

    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(mockWs.mockDisconnect.mock.calls.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 4. Token is persisted in localStorage
  // -----------------------------------------------------------------------
  test('token is persisted in localStorage', async () => {
    sendRequestResult = { token: 'persisted-token', expiresIn: 3600 };

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.login('mypassword');
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
    expect(mockWs.mockSetToken.mock.calls.some((c) => c[0] === 'saved-token')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 6. login failure does not store token
  // -----------------------------------------------------------------------
  test('login failure does not store token', async () => {
    sendRequestError = new Error('Authentication failed');

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.login('wrong-password');
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
    localStorage.setItem('ymir-token', 'valid-jwt');

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('valid-jwt');

    // Simulate server pushing AUTH_REQUIRED on a non-auth channel
    await act(async () => {
      mockWs.simulateMessage({
        v: PROTOCOL_VERSION,
        type: 'response',
        id: 'server-push-1',
        channel: 'data',
        payload: null,
        error: { code: 'AUTH_REQUIRED', message: 'Token expired' },
      } as ResponseEnvelope);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('ymir-token')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 9. clearToken() clears token, calls wsClient.setToken(''), removes from
  //    localStorage, but does NOT disconnect the WebSocket
  // -----------------------------------------------------------------------
  test('clearToken() clears token without disconnecting wsClient', () => {
    localStorage.setItem('ymir-token', 'existing-token');

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.clearToken();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('ymir-token')).toBeNull();
    expect(mockWs.mockSetToken.mock.calls.some((c) => c[0] === '')).toBe(true);
    // disconnect must NOT have been called
    expect(mockWs.mockDisconnect.mock.calls.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 10. auto-reconnect uses connectionUrl from context, not page origin
  // -----------------------------------------------------------------------
  test('auto-reconnect uses connectionUrl from context, not page origin', () => {
    localStorage.setItem('ymir-token', 'saved-token');
    mockConnectionUrl = 'ws://custom-host:4000/ws';

    renderHook(() => useAuth(), { wrapper: createWrapper() });

    expect(mockWs.mockConnect.mock.calls.some((c) => c[0] === 'ws://custom-host:4000/ws')).toBe(
      true,
    );
  });

  // -----------------------------------------------------------------------
  // 11. when connectionUrl is null, auto-reconnect does NOT fire
  // -----------------------------------------------------------------------
  test('when connectionUrl is null, auto-reconnect does NOT fire', () => {
    localStorage.setItem('ymir-token', 'saved-token');
    mockConnectionUrl = null;

    renderHook(() => useAuth(), { wrapper: createWrapper() });

    expect(mockWs.mockConnect.mock.calls.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 12. login() uses connectionUrl when available
  // -----------------------------------------------------------------------
  test('login() uses connectionUrl from context when available', async () => {
    mockConnectionUrl = 'ws://custom-host:4000/ws';

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.login('password');
    });

    expect(mockWs.mockConnect.mock.calls.some((c) => c[0] === 'ws://custom-host:4000/ws')).toBe(
      true,
    );
  });

  // -----------------------------------------------------------------------
  // 13. login() falls back to window.location when connectionUrl is null
  // -----------------------------------------------------------------------
  test('login() falls back to window.location when connectionUrl is null', async () => {
    mockConnectionUrl = null;

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.login('password');
    });

    const expectedUrl = `ws://${window.location.host}/ws`;
    expect(mockWs.mockConnect.mock.calls.some((c) => c[0] === expectedUrl)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 14. suppressAutoLogin() prevents Tauri auto-login on subsequent renders
  // -----------------------------------------------------------------------
  test('suppressAutoLogin() prevents Tauri auto-login', async () => {
    mockIsTauri = true;
    mockConnectionUrl = 'ws://127.0.0.1:3000/ws'; // must match sidecar URL for auto-login guard
    mockGetTauriConfig.mockResolvedValue({ port: 3000, password: 'test' });
    sendRequestResult = { token: 'auto-token', expiresIn: 3600 };

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Wait for auto-login on mount
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.isAuthenticated).toBe(true);

    // Suppress auto-login
    act(() => {
      result.current.suppressAutoLogin();
    });

    // Clear mock to track new calls
    mockGetTauriConfig.mockClear();

    // Trigger re-render by logging out (sets token to null → re-render → effect fires)
    act(() => {
      result.current.logout();
    });

    // Wait for effects to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Auto-login should have been suppressed
    expect(mockGetTauriConfig.mock.calls.length).toBe(0);
    expect(result.current.isAuthenticated).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 15. login() does NOT reset suppressAutoLogin (suppression persists)
  // -----------------------------------------------------------------------
  test('login() does NOT reset suppressAutoLogin (suppression persists)', async () => {
    mockIsTauri = true;
    mockConnectionUrl = 'ws://127.0.0.1:3000/ws'; // must match sidecar URL for auto-login guard
    mockGetTauriConfig.mockResolvedValue({ port: 3000, password: 'test' });
    sendRequestResult = { token: 'auto-token', expiresIn: 3600 };

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // Wait for auto-login on mount
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.isAuthenticated).toBe(true);

    // Suppress auto-login
    act(() => {
      result.current.suppressAutoLogin();
    });

    // Clear mock to track new calls
    mockGetTauriConfig.mockClear();

    // Trigger re-render by logging out — auto-login should be suppressed
    act(() => {
      result.current.logout();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockGetTauriConfig.mock.calls.length).toBe(0);

    // Now login manually — this should NOT reset the suppress flag
    sendRequestResult = { token: 'manual-token', expiresIn: 3600 };
    await act(async () => {
      await result.current.login('password');
    });
    expect(result.current.isAuthenticated).toBe(true);

    // Clear mock
    mockGetTauriConfig.mockClear();

    // Trigger re-render by logging out again — auto-login should STILL be suppressed
    act(() => {
      result.current.logout();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockGetTauriConfig.mock.calls.length).toBe(0);
  });
});
