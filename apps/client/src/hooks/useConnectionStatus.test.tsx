/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import type { ConnectionStatus } from '../lib/ws-client';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

type StatusHandler = (status: ConnectionStatus) => void;

let mockStatus: ConnectionStatus = 'disconnected';
let statusHandlers: StatusHandler[] = [];

const mockOnStatusChange = mock((handler: StatusHandler) => {
  statusHandlers.push(handler);
  return () => {
    statusHandlers = statusHandlers.filter((h) => h !== handler);
  };
});

const mockGetStatus = mock(() => mockStatus);

mock.module('../lib/ws-client', () => ({
  wsClient: {
    getStatus: mockGetStatus,
    onStatusChange: mockOnStatusChange,
  },
}));

// Import after mocking
const { useConnectionStatus } = await import('./useConnectionStatus');

function simulateStatusChange(status: ConnectionStatus) {
  mockStatus = status;
  for (const handler of statusHandlers) {
    handler(status);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('useConnectionStatus', () => {
  beforeEach(() => {
    mockStatus = 'disconnected';
    statusHandlers = [];
    mockGetStatus.mockClear();
    mockOnStatusChange.mockClear();
  });

  afterEach(() => {
    // Clean up any remaining handlers
    statusHandlers = [];
  });

  // 1. Returns { status, isConnected, isReconnecting }
  test('returns status, isConnected, isReconnecting', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current).toHaveProperty('status');
    expect(result.current).toHaveProperty('isConnected');
    expect(result.current).toHaveProperty('isReconnecting');
  });

  // 2. Status updates when wsClient status changes
  test('status updates when wsClient status changes', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current.status).toBe('disconnected');

    act(() => {
      simulateStatusChange('connecting');
    });
    expect(result.current.status).toBe('connecting');

    act(() => {
      simulateStatusChange('connected');
    });
    expect(result.current.status).toBe('connected');
  });

  // 3. isConnected is true only when status is 'connected'
  test('isConnected is true only when status is connected', () => {
    const { result } = renderHook(() => useConnectionStatus());

    // Initially disconnected
    expect(result.current.isConnected).toBe(false);

    act(() => {
      simulateStatusChange('connecting');
    });
    expect(result.current.isConnected).toBe(false);

    act(() => {
      simulateStatusChange('connected');
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      simulateStatusChange('reconnecting');
    });
    expect(result.current.isConnected).toBe(false);

    act(() => {
      simulateStatusChange('disconnected');
    });
    expect(result.current.isConnected).toBe(false);
  });

  // 4. isReconnecting is true only when status is 'reconnecting'
  test('isReconnecting is true only when status is reconnecting', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current.isReconnecting).toBe(false);

    act(() => {
      simulateStatusChange('connecting');
    });
    expect(result.current.isReconnecting).toBe(false);

    act(() => {
      simulateStatusChange('connected');
    });
    expect(result.current.isReconnecting).toBe(false);

    act(() => {
      simulateStatusChange('reconnecting');
    });
    expect(result.current.isReconnecting).toBe(true);

    act(() => {
      simulateStatusChange('disconnected');
    });
    expect(result.current.isReconnecting).toBe(false);
  });

  // 5. Component re-renders on status change
  test('component re-renders on each status change', () => {
    const { result } = renderHook(() => useConnectionStatus());

    const statuses: ConnectionStatus[] = [
      'connecting',
      'connected',
      'disconnected',
      'reconnecting',
      'connected',
    ];

    for (const s of statuses) {
      act(() => {
        simulateStatusChange(s);
      });
      expect(result.current.status).toBe(s);
    }
  });

  // 6. Subscribes on mount and unsubscribes on unmount
  test('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useConnectionStatus());

    expect(mockOnStatusChange).toHaveBeenCalledTimes(1);
    expect(statusHandlers.length).toBe(1);

    unmount();

    expect(statusHandlers.length).toBe(0);
  });

  // 7. Initial status comes from wsClient.getStatus()
  test('initial status comes from wsClient.getStatus()', () => {
    mockStatus = 'connecting';
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('connecting');
    expect(mockGetStatus).toHaveBeenCalled();
  });
});
