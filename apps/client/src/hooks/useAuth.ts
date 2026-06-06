import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { wsClient } from '../lib/ws-client';
import { sendRequest } from '../lib/send-request';
import { getSidecarUrl } from '../lib/sidecar';
import type { MessageEnvelope, ResponseEnvelope } from '@ymir/shared';
import { useTauri } from './useTauri';
import { useConnectionUrl } from '../contexts/ConnectionUrlContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
  clearToken: () => void;
  suppressAutoLogin: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'ymir-token';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isTauri, getTauriConfig } = useTauri();
  const connectionUrl = useConnectionUrl();
  const isLoggingInRef = useRef(false);
  const suppressAutoLoginRef = useRef(false);

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
  // Only auto-connect if connectionUrl is set (user must choose a server first
  // in browser mode; Tauri sets connectionUrl via the sidecar port).
  useEffect(() => {
    if (token && wsClient.getStatus() === 'disconnected' && connectionUrl) {
      wsClient.connect(connectionUrl);
    }
    // Intentionally no cleanup — disconnecting on unmount would break
    // React StrictMode double-render and normal re-renders.
  }, [token, connectionUrl]);

  const login = useCallback(
    async (password: string): Promise<void> => {
      if (isLoggingInRef.current) return;
      isLoggingInRef.current = true;

      try {
        // Wait for connection to open — register the handler BEFORE calling
        // connect() to avoid a race where the WS opens before the handler is
        // attached, causing the promise to never resolve.
        if (wsClient.getStatus() !== 'connected') {
          await new Promise<void>((resolve, reject) => {
            const handle: { timeout: ReturnType<typeof setTimeout> | null } = { timeout: null };
            let unsub: (() => void) | null = null;
            unsub = wsClient.onStatusChange((s) => {
              if (s === 'connected') {
                if (handle.timeout) clearTimeout(handle.timeout);
                unsub?.();
                resolve();
              }
            });

            handle.timeout = setTimeout(() => {
              unsub?.();
              reject(new Error('Connection timed out'));
            }, 5000);

            // Use connectionUrl if available; fall back to sidecar port
            // (Tauri), then to window.location for browser mode.
            const sidecarUrl = getSidecarUrl();
            const url =
              connectionUrl ??
              sidecarUrl ??
              (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
                window.location.host +
                '/ws';

            // Connect AFTER the handler and timeout are registered.
            if (wsClient.getStatus() === 'disconnected') {
              wsClient.connect(url);
            }
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
    },
    [connectionUrl],
  );

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

  const clearToken = useCallback(() => {
    setToken(null);
    wsClient.setToken('');
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  const suppressAutoLogin = useCallback(() => {
    suppressAutoLoginRef.current = true;
  }, []);

  // Auto-login when running in Tauri
  useEffect(() => {
    if (!isTauri) return;
    if (token) return; // Already authenticated
    if (suppressAutoLoginRef.current) return; // ref — not a dependency; reads latest value

    const autoLogin = async () => {
      try {
        const config = await getTauriConfig();
        if (!config) {
          console.error('[useAuth] Tauri auto-login failed: no config');
          return;
        }
        window.__YMIR_SIDECAR_PORT = config.port;

        // Only auto-login if connected to the known sidecar port — never send
        // credentials to an arbitrary localhost service.
        const sidecarUrl = getSidecarUrl();
        if (sidecarUrl && connectionUrl && connectionUrl !== sidecarUrl) return;

        await login(config.password);
      } catch (err) {
        console.error('[useAuth] Tauri auto-login failed:', err);
      }
    };

    autoLogin();
  }, [isTauri, login, getTauriConfig, token, connectionUrl]);

  const authValue = useMemo(
    () => ({ isAuthenticated, token, login, logout, clearToken, suppressAutoLogin }),
    [isAuthenticated, token, login, logout, clearToken, suppressAutoLogin],
  );

  return React.createElement(AuthContext.Provider, { value: authValue }, children);
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
