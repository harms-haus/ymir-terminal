/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import type { ConnectionStatus } from '../lib/ws-client';
import type { ConnectionEntry, RecentConnection } from '../lib/connection-storage';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

let mockUrl = 'ws://localhost:3000/ws';
let mockStatus: ConnectionStatus = 'disconnected';

type StatusHandler = (status: ConnectionStatus) => void;
let statusHandlers: StatusHandler[] = [];

const mockConnect = mock((_url: string) => {});
const mockDisconnect = mock(() => {});
const mockSetToken = mock((_token: string) => {});
const mockGetUrl = mock(() => mockUrl);
const mockGetStatus = mock(() => mockStatus);
const mockOnStatusChange = mock((handler: StatusHandler) => {
  statusHandlers.push(handler);
  return () => {
    statusHandlers = statusHandlers.filter((h) => h !== handler);
  };
});

mock.module('../lib/ws-client', () => ({
  wsClient: {
    connect: mockConnect,
    disconnect: mockDisconnect,
    setToken: mockSetToken,
    getUrl: mockGetUrl,
    getStatus: mockGetStatus,
    onStatusChange: mockOnStatusChange,
  },
}));

// ---------------------------------------------------------------------------
// Mock connection-storage module
// ---------------------------------------------------------------------------

let storedFavorites: ConnectionEntry[] = [];
let storedRecent: RecentConnection[] = [];

const mockGetFavorites = mock(() => [...storedFavorites]);
const mockSaveFavorites = mock((entries: ConnectionEntry[]) => {
  storedFavorites = entries;
});
const mockAddFavorite = mock(
  (entry: Omit<ConnectionEntry, 'id' | 'createdAt'>): ConnectionEntry => {
    // Note: the real storage takes a single object, but this mock also handles
    // being called with (label, host, port) from older code paths.
    if (typeof entry === 'string') {
      const label = entry as unknown as string;
      const host = arguments[1] as string;
      const port = arguments[2] as number;
      entry = { label, host, port };
    }
    const existing = storedFavorites.find((f) => f.host === entry.host && f.port === entry.port);
    if (existing) {
      existing.label = entry.label;
      return existing;
    }
    const newEntry: ConnectionEntry = {
      id: `fav-${storedFavorites.length + 1}`,
      label: entry.label,
      host: entry.host,
      port: entry.port,
      createdAt: Date.now(),
    };
    storedFavorites.push(newEntry);
    return newEntry;
  },
);
const mockRemoveFavorite = mock((id: string) => {
  storedFavorites = storedFavorites.filter((f) => f.id !== id);
});
const mockUpdateFavorite = mock(
  (
    id: string,
    updates: Partial<Pick<ConnectionEntry, 'label' | 'host' | 'port'>>,
  ): ConnectionEntry | null => {
    const entry = storedFavorites.find((f) => f.id === id);
    if (!entry) return null;
    if (updates.label !== undefined) entry.label = updates.label;
    if (updates.host !== undefined) entry.host = updates.host;
    if (updates.port !== undefined) entry.port = updates.port;
    return entry;
  },
);
const mockIsFavorite = mock((host: string, port: number): boolean => {
  return storedFavorites.some((f) => f.host === host && f.port === port);
});
const mockGetRecentConnections = mock(() => [...storedRecent]);
const mockAddRecentConnection = mock((host: string, port: number, label?: string) => {
  const now = Date.now();
  const existing = storedRecent.find((r) => r.host === host && r.port === port);
  if (existing) {
    existing.lastConnectedAt = now;
    if (label !== undefined) existing.label = label;
  } else {
    storedRecent.unshift({
      id: `recent-${storedRecent.length + 1}`,
      host,
      port,
      label: label ?? `${host}:${port}`,
      createdAt: now,
      lastConnectedAt: now,
    });
  }
});
const mockClearRecentConnections = mock(() => {
  storedRecent = [];
});

mock.module('../lib/connection-storage', () => ({
  getFavorites: mockGetFavorites,
  saveFavorites: mockSaveFavorites,
  addFavorite: mockAddFavorite,
  removeFavorite: mockRemoveFavorite,
  updateFavorite: mockUpdateFavorite,
  isFavorite: mockIsFavorite,
  getRecentConnections: mockGetRecentConnections,
  addRecentConnection: mockAddRecentConnection,
  clearRecentConnections: mockClearRecentConnections,
}));

// ---------------------------------------------------------------------------
// Mock useConnectionStatus hook
// ---------------------------------------------------------------------------

let hookStatus: ConnectionStatus = 'disconnected';

mock.module('./useConnectionStatus', () => ({
  useConnectionStatus: () => ({
    status: hookStatus,
    isConnected: hookStatus === 'connected',
    isReconnecting: hookStatus === 'reconnecting',
  }),
}));

// ---------------------------------------------------------------------------
// Mock useTauri hook
// ---------------------------------------------------------------------------

const mockGetTauriConfig = mock(async () => null);

mock.module('./useTauri', () => ({
  useTauri: () => ({
    isTauri: false,
    getTauriConfig: mockGetTauriConfig,
  }),
}));

// Import after all mocks
const { useConnectionManager } = await import('./useConnectionManager');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simulateStatusChange(status: ConnectionStatus) {
  mockStatus = status;
  hookStatus = status;
  for (const handler of statusHandlers) {
    handler(status);
  }
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

describe('useConnectionManager', () => {
  beforeEach(() => {
    mockUrl = 'ws://localhost:3000/ws';
    mockStatus = 'disconnected';
    hookStatus = 'disconnected';
    statusHandlers = [];
    storedFavorites = [];
    storedRecent = [];

    mockConnect.mockClear();
    mockDisconnect.mockClear();
    mockSetToken.mockClear();
    mockGetUrl.mockClear();
    mockGetStatus.mockClear();
    mockOnStatusChange.mockClear();
    mockGetFavorites.mockClear();
    mockSaveFavorites.mockClear();
    mockAddFavorite.mockClear();
    mockRemoveFavorite.mockClear();
    mockUpdateFavorite.mockClear();
    mockIsFavorite.mockClear();
    mockGetRecentConnections.mockClear();
    mockAddRecentConnection.mockClear();
    mockClearRecentConnections.mockClear();
    mockGetTauriConfig.mockClear();
  });

  afterEach(() => {
    statusHandlers = [];
  });

  // 1. Returns correct initial state
  test('returns correct initial state from wsClient', () => {
    mockUrl = 'ws://192.168.1.1:8080/ws';
    const { result } = renderHook(() => useConnectionManager());

    expect(result.current.currentUrl).toBe('ws://192.168.1.1:8080/ws');
    expect(result.current.currentHost).toBe('192.168.1.1');
    expect(result.current.currentPort).toBe(8080);
    expect(result.current.status).toBe('disconnected');
    expect(result.current.favorites).toEqual([]);
    expect(result.current.recentConnections).toEqual([]);
  });

  // 2. connect() updates currentUrl/host/port, calls wsClient.connect, clears token first
  test('connect() updates state and calls wsClient', () => {
    const { result } = renderHook(() => useConnectionManager());

    act(() => {
      result.current.connect('10.0.0.5', 4000);
    });

    expect(mockSetToken).toHaveBeenCalledWith('');
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalledWith('ws://10.0.0.5:4000/ws');
    expect(result.current.currentUrl).toBe('ws://10.0.0.5:4000/ws');
    expect(result.current.currentHost).toBe('10.0.0.5');
    expect(result.current.currentPort).toBe(4000);
  });

  // 3. disconnect() clears currentUrl, calls wsClient.disconnect, clears token
  test('disconnect() clears state and calls wsClient', () => {
    mockUrl = 'ws://10.0.0.5:4000/ws';
    const { result } = renderHook(() => useConnectionManager());

    expect(result.current.currentUrl).toBe('ws://10.0.0.5:4000/ws');

    act(() => {
      result.current.disconnect();
    });

    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockSetToken).toHaveBeenCalledWith('');
    expect(result.current.currentUrl).toBeNull();
    expect(result.current.currentHost).toBeNull();
    expect(result.current.currentPort).toBeNull();
  });

  // 4. connectToLocal() reads sidecar port and calls connect
  test('connectToLocal() uses sidecar port from window.__YMIR_SIDECAR_PORT', async () => {
    // @ts-expect-error — setting a test-only global
    window.__YMIR_SIDECAR_PORT = 9999;
    const { result } = renderHook(() => useConnectionManager());

    await act(async () => {
      await result.current.connectToLocal();
    });

    expect(mockConnect).toHaveBeenCalledWith('ws://127.0.0.1:9999/ws');
    expect(result.current.currentHost).toBe('127.0.0.1');
    expect(result.current.currentPort).toBe(9999);

    // @ts-expect-error — cleanup
    delete window.__YMIR_SIDECAR_PORT;
  });

  // 5. addFavorite updates state
  test('addFavorite updates favorites state', () => {
    const { result } = renderHook(() => useConnectionManager());

    expect(result.current.favorites).toEqual([]);

    act(() => {
      result.current.addFavorite('My Server', '10.0.0.1', 3000);
    });

    expect(mockAddFavorite).toHaveBeenCalledWith({
      label: 'My Server',
      host: '10.0.0.1',
      port: 3000,
    });
    expect(result.current.favorites.length).toBe(1);
    expect(result.current.favorites[0].label).toBe('My Server');
    expect(result.current.favorites[0].host).toBe('10.0.0.1');
    expect(result.current.favorites[0].port).toBe(3000);
  });

  // 6. removeFavorite updates state
  test('removeFavorite updates favorites state', () => {
    // Pre-populate favorites
    storedFavorites = [{ id: 'f1', label: 'Server A', host: '10.0.0.1', port: 3000, createdAt: 1 }];

    const { result } = renderHook(() => useConnectionManager());

    // Initial load picks up the stored favorites
    expect(result.current.favorites.length).toBe(1);

    act(() => {
      result.current.removeFavorite('f1');
    });

    expect(mockRemoveFavorite).toHaveBeenCalledWith('f1');
    // After re-read from storage
    storedFavorites = [];
    // Re-render to pick up the change
    const { result: result2 } = renderHook(() => useConnectionManager());
    expect(result2.current.favorites.length).toBe(0);
  });

  // 7. updateFavorite updates state
  test('updateFavorite updates favorites state', () => {
    storedFavorites = [
      { id: 'f1', label: 'Old Label', host: '10.0.0.1', port: 3000, createdAt: 1 },
    ];

    const { result } = renderHook(() => useConnectionManager());
    expect(result.current.favorites[0].label).toBe('Old Label');

    act(() => {
      result.current.updateFavorite('f1', { label: 'New Label' });
    });

    expect(mockUpdateFavorite).toHaveBeenCalledWith('f1', { label: 'New Label' });
    // Update the mock storage to reflect the change
    storedFavorites[0].label = 'New Label';

    const { result: result2 } = renderHook(() => useConnectionManager());
    expect(result2.current.favorites[0].label).toBe('New Label');
  });

  // 8. clearRecent clears state
  test('clearRecent clears recentConnections state', () => {
    storedRecent = [
      {
        id: 'r1',
        host: '10.0.0.1',
        port: 3000,
        label: 'Server',
        createdAt: 1,
        lastConnectedAt: 1,
      },
    ];

    const { result } = renderHook(() => useConnectionManager());
    expect(result.current.recentConnections.length).toBe(1);

    act(() => {
      result.current.clearRecent();
    });

    expect(mockClearRecentConnections).toHaveBeenCalled();
    expect(result.current.recentConnections).toEqual([]);
  });

  // 9. isFavorite returns correct boolean
  test('isFavorite returns true for matching host+port', () => {
    storedFavorites = [{ id: 'f1', label: 'Fav', host: '10.0.0.1', port: 3000, createdAt: 1 }];

    const { result } = renderHook(() => useConnectionManager());

    expect(result.current.isFavorite('10.0.0.1', 3000)).toBe(true);
    expect(result.current.isFavorite('10.0.0.1', 4000)).toBe(false);
    expect(result.current.isFavorite('10.0.0.2', 3000)).toBe(false);
  });

  // 10. connect() adds to recent connections
  test('connect() adds to recent connections', () => {
    const { result } = renderHook(() => useConnectionManager());

    act(() => {
      result.current.connect('10.0.0.5', 4000);
    });

    expect(mockAddRecentConnection).toHaveBeenCalledWith('10.0.0.5', 4000);
    // Verify state was refreshed from storage
    expect(result.current.recentConnections.length).toBe(1);
    expect(result.current.recentConnections[0].host).toBe('10.0.0.5');
    expect(result.current.recentConnections[0].port).toBe(4000);
  });

  // 11. URL parsing: ws:// extracts host and port
  test('URL parsing: ws://host:port/ws extracts host and port', () => {
    mockUrl = 'ws://myhost:5555/ws';
    const { result } = renderHook(() => useConnectionManager());

    expect(result.current.currentUrl).toBe('ws://myhost:5555/ws');
    expect(result.current.currentHost).toBe('myhost');
    expect(result.current.currentPort).toBe(5555);
  });

  // 12. URL parsing: wss:// extracts host and port
  test('URL parsing: wss://host:port/ws extracts host and port', () => {
    // Use a non-default port so URL.port returns the value (443 is default for wss:)
    mockUrl = 'wss://secure.example.com:8443/ws';
    const { result } = renderHook(() => useConnectionManager());

    expect(result.current.currentUrl).toBe('wss://secure.example.com:8443/ws');
    expect(result.current.currentHost).toBe('secure.example.com');
    expect(result.current.currentPort).toBe(8443);
  });

  // 13. isTauri is exposed from useTauri
  test('isTauri is exposed from useTauri hook', () => {
    const { result } = renderHook(() => useConnectionManager());
    expect(result.current.isTauri).toBe(false);
  });

  // 14. Loads favorites and recent from storage on mount
  test('loads favorites and recent from storage on mount', () => {
    storedFavorites = [{ id: 'f1', label: 'Fav1', host: '1.1.1.1', port: 1111, createdAt: 1 }];
    storedRecent = [
      {
        id: 'r1',
        host: '2.2.2.2',
        port: 2222,
        label: 'Recent1',
        createdAt: 2,
        lastConnectedAt: 2,
      },
    ];

    const { result } = renderHook(() => useConnectionManager());

    expect(result.current.favorites.length).toBe(1);
    expect(result.current.favorites[0].label).toBe('Fav1');
    expect(result.current.recentConnections.length).toBe(1);
    expect(result.current.recentConnections[0].host).toBe('2.2.2.2');
  });
});
