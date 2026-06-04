/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import type { ConnectionStatus } from '../lib/ws-client';
import { createMockWsClient } from '../test-helpers/mock-ws-client';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

const mockWs = createMockWsClient({ initialStatus: 'disconnected' });

// NOTE: mock.module must be called directly at module scope for Bun to hoist it.
mock.module('../lib/ws-client', () => ({ wsClient: mockWs.wsClient }));

// Import after mocking
const { useConnectionStatus } = await import('./useConnectionStatus');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('useConnectionStatus', () => {
  beforeEach(() => {
    mockWs.reset();
  });

  afterEach(() => {
    mockWs.reset();
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
      mockWs.simulateStatusChange('connecting');
    });
    expect(result.current.status).toBe('connecting');

    act(() => {
      mockWs.simulateStatusChange('connected');
    });
    expect(result.current.status).toBe('connected');
  });

  // 3. isConnected is true only when status is 'connected'
  test('isConnected is true only when status is connected', () => {
    const { result } = renderHook(() => useConnectionStatus());

    // Initially disconnected
    expect(result.current.isConnected).toBe(false);

    act(() => {
      mockWs.simulateStatusChange('connecting');
    });
    expect(result.current.isConnected).toBe(false);

    act(() => {
      mockWs.simulateStatusChange('connected');
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      mockWs.simulateStatusChange('reconnecting');
    });
    expect(result.current.isConnected).toBe(false);

    act(() => {
      mockWs.simulateStatusChange('disconnected');
    });
    expect(result.current.isConnected).toBe(false);
  });

  // 4. isReconnecting is true only when status is 'reconnecting'
  test('isReconnecting is true only when status is reconnecting', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current.isReconnecting).toBe(false);

    act(() => {
      mockWs.simulateStatusChange('connecting');
    });
    expect(result.current.isReconnecting).toBe(false);

    act(() => {
      mockWs.simulateStatusChange('connected');
    });
    expect(result.current.isReconnecting).toBe(false);

    act(() => {
      mockWs.simulateStatusChange('reconnecting');
    });
    expect(result.current.isReconnecting).toBe(true);

    act(() => {
      mockWs.simulateStatusChange('disconnected');
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
        mockWs.simulateStatusChange(s);
      });
      expect(result.current.status).toBe(s);
    }
  });

  // 6. Subscribes on mount and unsubscribes on unmount
  test('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useConnectionStatus());

    expect(mockWs.mockOnStatusChange.mock.calls.length).toBe(1);
    expect(mockWs.statusHandlerCount).toBe(1);

    unmount();

    expect(mockWs.statusHandlerCount).toBe(0);
  });

  // 7. Initial status comes from wsClient.getStatus()
  test('initial status comes from wsClient.getStatus()', () => {
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('disconnected');
    expect(mockWs.mockGetStatus.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
