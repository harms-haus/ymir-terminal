import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { wsClient } from '../lib/ws-client';
import { PROTOCOL_VERSION } from '@ymir/shared';
import type { MessageEnvelope } from '@ymir/shared';

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
  'ws://' +
  (typeof window !== 'undefined' ? window.location.host : 'localhost:3000') +
  '/ws';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
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

  const login = useCallback(async (password: string): Promise<void> => {
    // Connect if not already connected
    if (wsClient.getStatus() === 'disconnected') {
      wsClient.connect(getWsUrl());
    }

    const requestId = crypto.randomUUID();

    const envelope: MessageEnvelope = {
      v: PROTOCOL_VERSION,
      type: 'request',
      id: requestId,
      payload: { password },
    };

    return new Promise<void>((resolve, reject) => {
      const unsub = wsClient.onMessage((response: MessageEnvelope) => {
        if (response.type === 'response' && response.id === requestId) {
          unsub();

          if (response.error) {
            reject(new Error(response.error.message || 'Authentication failed'));
            return;
          }

          const payload = response.payload as { token: string; expiresIn: number } | null;
          if (payload?.token) {
            const jwt = payload.token;
            wsClient.setToken(jwt);
            setToken(jwt);
            resolve();
          } else {
            reject(new Error('Authentication failed'));
          }
        }
      });

      wsClient.send(envelope);

      // Timeout after 10 seconds
      setTimeout(() => {
        unsub();
        reject(new Error('Authentication timed out'));
      }, 10_000);
    });
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
