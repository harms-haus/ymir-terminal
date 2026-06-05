import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { wsClient, type ConnectionStatus } from '../lib/ws-client';
import {
  getFavorites,
  addFavorite as storageAddFavorite,
  removeFavorite as storageRemoveFavorite,
  updateFavorite as storageUpdateFavorite,
  isFavorite as storageIsFavorite,
  getRecentConnections,
  addRecentConnection as storageAddRecentConnection,
  clearRecentConnections as storageClearRecentConnections,
  type ConnectionEntry,
  type RecentConnection,
} from '../lib/connection-storage';
import { useConnectionStatus } from './useConnectionStatus';
import { useTauri } from './useTauri';
import { useAuth } from './useAuth';
import { useConnectionUrl, useSetConnectionUrl } from '../contexts/ConnectionUrlContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseConnectionManagerReturn {
  currentUrl: string | null;
  currentHost: string | null;
  currentPort: number | null;
  status: ConnectionStatus;
  favorites: ConnectionEntry[];
  recentConnections: RecentConnection[];
  addFavorite: (label: string, host: string, port: number) => void;
  removeFavorite: (id: string) => void;
  updateFavorite: (
    id: string,
    updates: Partial<Pick<ConnectionEntry, 'label' | 'host' | 'port'>>,
  ) => void;
  clearRecent: () => void;
  connect: (host: string, port: number) => void;
  disconnect: () => void;
  connectToLocal: () => void;
  isFavorite: (host: string, port: number) => boolean;
  isTauri: boolean;
  localPort: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUrl(url: string): { host: string; port: number } | null {
  try {
    const parsed = new URL(url);
    const port = parsed.port ? Number(parsed.port) : null;
    return port !== null ? { host: parsed.hostname, port } : null;
  } catch {
    return null;
  }
}

function getSidecarPort(): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sidecarPort = (window as any).__YMIR_SIDECAR_PORT;
  if (sidecarPort) {
    const port = Number(sidecarPort);
    return Number.isFinite(port) && port > 0 ? port : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConnectionManager(): UseConnectionManagerReturn {
  const { status } = useConnectionStatus();
  const { isTauri, getTauriConfig } = useTauri();
  const queryClient = useQueryClient();
  const { clearToken, suppressAutoLogin } = useAuth();
  const currentUrl = useConnectionUrl();
  const setConnectionUrl = useSetConnectionUrl();

  const [favorites, setFavorites] = useState<ConnectionEntry[]>(() => getFavorites());

  const [recentConnections, setRecentConnections] = useState<RecentConnection[]>(() =>
    getRecentConnections(),
  );

  const [localPort] = useState<number | null>(() => getSidecarPort());

  // Parse host / port from the current URL
  const parsed = useMemo(() => (currentUrl ? parseUrl(currentUrl) : null), [currentUrl]);
  const currentHost = parsed?.host ?? null;
  const currentPort = parsed?.port ?? null;

  // -----------------------------------------------------------------------
  // Connect / Disconnect
  // -----------------------------------------------------------------------

  const connect = useCallback(
    (host: string, port: number) => {
      if (!HOSTNAME_RE.test(host)) return;
      const url = `ws://${host}:${port}/ws`;

      // Clear all cached data from previous session
      queryClient.clear();
      clearToken();

      // Suppress Tauri auto-login when switching to a non-local server
      if (host !== '127.0.0.1' && host !== 'localhost') {
        suppressAutoLogin();
      }

      // Tear down old connection and reject any pending requests
      wsClient.disconnectAndRejectPending();

      // Update shared connection URL context and connect
      setConnectionUrl(url);
      wsClient.connect(url);

      storageAddRecentConnection(host, port);
      setRecentConnections(getRecentConnections());
    },
    [queryClient, clearToken, suppressAutoLogin, setConnectionUrl],
  );

  const disconnect = useCallback(() => {
    queryClient.clear();
    clearToken();
    suppressAutoLogin();
    wsClient.disconnect();
    setConnectionUrl(null);
  }, [queryClient, clearToken, suppressAutoLogin, setConnectionUrl]);

  const connectToLocal = useCallback(async () => {
    const port = getSidecarPort();
    if (port !== null) {
      connect('127.0.0.1', port);
      return;
    }

    // Fallback: try to get port from Tauri config
    const config = await getTauriConfig();
    if (config?.port) {
      connect('127.0.0.1', config.port);
    }
  }, [connect, getTauriConfig]);

  // -----------------------------------------------------------------------
  // Favorites
  // -----------------------------------------------------------------------

  const addFavoriteEntry = useCallback((label: string, host: string, port: number) => {
    storageAddFavorite({ label, host, port });
    setFavorites(getFavorites());
  }, []);

  const removeFavoriteEntry = useCallback((id: string) => {
    storageRemoveFavorite(id);
    setFavorites(getFavorites());
  }, []);

  const updateFavoriteEntry = useCallback(
    (id: string, updates: Partial<Pick<ConnectionEntry, 'label' | 'host' | 'port'>>) => {
      storageUpdateFavorite(id, updates);
      setFavorites(getFavorites());
    },
    [],
  );

  const checkIsFavorite = useCallback((host: string, port: number) => {
    return storageIsFavorite(host, port);
  }, []);

  // -----------------------------------------------------------------------
  // Recent
  // -----------------------------------------------------------------------

  const clearRecent = useCallback(() => {
    storageClearRecentConnections();
    setRecentConnections([]);
  }, []);

  // -----------------------------------------------------------------------
  // Return
  // -----------------------------------------------------------------------

  return {
    currentUrl,
    currentHost,
    currentPort,
    status,
    favorites,
    recentConnections,
    addFavorite: addFavoriteEntry,
    removeFavorite: removeFavoriteEntry,
    updateFavorite: updateFavoriteEntry,
    clearRecent,
    connect,
    disconnect,
    connectToLocal,
    isFavorite: checkIsFavorite,
    isTauri,
    localPort,
  };
}
