import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { wsClient } from '../lib/ws-client';

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface ConnectionUrlContextValue {
  /** Current WebSocket connection URL, or null when disconnected. */
  connectionUrl: string | null;
  /** Manually set the connection URL. Pass null to clear it. */
  setConnectionUrl: (url: string | null) => void;
}

const ConnectionUrlContext = createContext<ConnectionUrlContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ConnectionUrlProvider({ children }: { children: React.ReactNode }) {
  const [connectionUrl, setConnectionUrl] = useState<string | null>(wsClient.getUrl() || null);

  useEffect(() => {
    const unsub = wsClient.onStatusChange((status) => {
      if (status === 'connected') {
        setConnectionUrl(wsClient.getUrl() || null);
      } else if (status === 'disconnected') {
        const url = wsClient.getUrl();
        if (!url) {
          setConnectionUrl(null);
        }
      }
    });
    return unsub;
  }, []);

  const contextValue = useMemo(
    () => ({ connectionUrl, setConnectionUrl }),
    [connectionUrl, setConnectionUrl],
  );

  return (
    <ConnectionUrlContext.Provider value={contextValue}>{children}</ConnectionUrlContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Returns the current WebSocket connection URL (string | null).
 */
export function useConnectionUrl(): string | null {
  const ctx = useContext(ConnectionUrlContext);
  return ctx?.connectionUrl ?? null;
}

/**
 * Returns a setter function to manually update the connection URL.
 */
export function useSetConnectionUrl(): (url: string | null) => void {
  const ctx = useContext(ConnectionUrlContext);
  if (!ctx) {
    // Return a no-op when used outside the provider (matching useConnectionUrl pattern)
    return () => {};
  }
  return ctx.setConnectionUrl;
}
