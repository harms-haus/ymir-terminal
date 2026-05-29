import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { wsClient } from '../lib/ws-client';
import { sendRequest } from '../lib/send-request';
import type { MessageEnvelope, ResponseEnvelope } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'ymir-token';
const getWsUrl = () =>
  'ws://' + (typeof window !== 'undefined' ? window.location.host : 'localhost:3000') + '/ws';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isLoggingInRef = useRef(false);

  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      wsClient.setToken(stored);
    }
    return stored;
  });

  const isAuthenticated = token !== null;

  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [token]);

  // Auto-connect WebSocket when a stored token is present on mount/refresh.
  // The login() flow already handles connecting, so this only fires when the
  // WS is still disconnected (i.e. token restored from localStorage).
  useEffect(() => {
    if (token && wsClient.getStatus() === 'disconnected') {
      wsClient.connect(getWsUrl());
    }
    // Intentionally no cleanup — disconnecting on unmount would break
    // React StrictMode double-render and normal re-renders.
  }, [token]);

  const login = useCallback(async (password: string): Promise<void> => {
    if (isLoggingInRef.current) return;
    isLoggingInRef.current = true;

    try {
      // Connect if not already connected
      const status = wsClient.getStatus();
      if (status === 'disconnected') {
        wsClient.connect(getWsUrl());
      }

      // Wait for connection to open
      if (wsClient.getStatus() !== 'connected') {
        await new Promise<void>((resolve, reject) => {
          let unsub: (() => void) | null = null;

          const timeout = setTimeout(() => {
            unsub?.();
            reject(new Error('Connection timed out'));
          }, 5000);

          unsub = wsClient.onStatusChange((s) => {
            if (s === 'connected') {
              clearTimeout(timeout);
              unsub?.();
              resolve();
            }
          });
        });
      }

      const payload = await sendRequest<{ token: string; expiresIn: number }>('auth', {
        password,
      });

      if (payload?.token) {
        wsClient.setToken(payload.token);
        setToken(payload.token);
      } else {
        throw new Error('Authentication failed');
      }
    } finally {
      isLoggingInRef.current = false;
    }
  }, []);

  // Listen for AUTH_REQUIRED from server (e.g. expired JWT on reconnect).
  // Only react on non-auth channels — the auth channel already handles its
  // own errors via the login() promise.
  useEffect(() => {
    const unsub = wsClient.onMessage((msg: MessageEnvelope) => {
      const resp = msg as ResponseEnvelope;
      if (
        (resp.error?.code === 'AUTH_REQUIRED' || resp.error?.code === 'AUTH_FAILED') &&
        msg.channel !== 'auth'
      ) {
        // Token is no longer valid — clear it and force re-login
        setToken(null);
        wsClient.setToken('');
      }
    });
    return unsub;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    wsClient.disconnect();
  }, []);

  return React.createElement(
    AuthContext.Provider,
    { value: { isAuthenticated, token, login, logout } },
    children,
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
