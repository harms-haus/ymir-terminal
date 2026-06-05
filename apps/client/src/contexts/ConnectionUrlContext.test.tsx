/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { createMockWsClient } from '../test-helpers/mock-ws-client';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

const mockWs = createMockWsClient({ initialStatus: 'disconnected', initialUrl: '' });

// NOTE: mock.module must be called directly at module scope for Bun to hoist it.
mock.module('../lib/ws-client', () => ({ wsClient: mockWs.wsClient }));

// Import after mocking
const { ConnectionUrlProvider, useConnectionUrl, useSetConnectionUrl } =
  await import('./ConnectionUrlContext');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConnectionUrlProvider>{children}</ConnectionUrlProvider>;
}

/**
 * Combined hook that reads both `useConnectionUrl` and `useSetConnectionUrl`
 * from the same provider instance so they share state.
 */
function useBoth() {
  const url = useConnectionUrl();
  const setUrl = useSetConnectionUrl();
  return { url, setUrl };
}

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConnectionUrlContext', () => {
  beforeEach(() => {
    mockWs.reset();
  });

  afterEach(() => {
    mockWs.reset();
  });

  // 1. useConnectionUrl returns null by default when no provider
  test('useConnectionUrl returns null by default when no provider', () => {
    // Suppress the console.error from createContext default value
    const originalError = console.error;
    console.error = () => {};

    const { result } = renderHook(() => useConnectionUrl());

    expect(result.current).toBeNull();

    console.error = originalError;
  });

  // 2. ConnectionUrlProvider initializes URL from wsClient.getUrl()
  test('ConnectionUrlProvider initializes URL from wsClient.getUrl()', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    // getUrl() returns '' (empty), so '' || null → null
    expect(result.current.url).toBeNull();
    expect(mockWs.mockGetUrl.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  // 3. useConnectionUrl returns the URL from the provider
  test('useConnectionUrl returns the URL from the provider', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    // Default URL from mock is '' → null
    expect(result.current.url).toBeNull();
  });

  // 4. useSetConnectionUrl allows updating the URL
  test('useSetConnectionUrl allows updating the URL', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    expect(result.current.url).toBeNull();

    act(() => {
      result.current.setUrl('ws://localhost:4000/ws');
    });

    expect(result.current.url).toBe('ws://localhost:4000/ws');
  });

  // 5. useSetConnectionUrl can set URL to null
  test('useSetConnectionUrl allows setting URL to null', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    act(() => {
      result.current.setUrl('ws://localhost:4000/ws');
    });
    expect(result.current.url).toBe('ws://localhost:4000/ws');

    act(() => {
      result.current.setUrl(null);
    });
    expect(result.current.url).toBeNull();
  });

  // 6. Provider syncs URL when wsClient status changes to 'connected'
  test('provider syncs URL when wsClient status changes to connected', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    // Set a URL first so we can verify it changes
    act(() => {
      result.current.setUrl('ws://old-host:3000/ws');
    });
    expect(result.current.url).toBe('ws://old-host:3000/ws');

    // Simulate status change to 'connected' with a new URL
    act(() => {
      mockWs.simulateStatusChange('connected', 'ws://192.168.1.1:3000/ws');
    });

    expect(result.current.url).toBe('ws://192.168.1.1:3000/ws');
  });

  // 7. Provider sets URL to null when wsClient status changes to 'disconnected' and getUrl() returns empty
  test('provider sets URL to null when wsClient status changes to disconnected and getUrl returns empty', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    // Set a URL first
    act(() => {
      result.current.setUrl('ws://192.168.1.1:3000/ws');
    });
    expect(result.current.url).toBe('ws://192.168.1.1:3000/ws');

    // Simulate disconnect — mockGetUrl returns '' (empty), so URL should become null
    act(() => {
      mockWs.simulateStatusChange('disconnected');
    });

    expect(result.current.url).toBeNull();
  });

  // 8. Provider does NOT clear URL when disconnected but getUrl() still has a value
  test('provider keeps URL when disconnected but getUrl still returns a value', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    // Set a URL
    act(() => {
      result.current.setUrl('ws://192.168.1.1:3000/ws');
    });
    expect(result.current.url).toBe('ws://192.168.1.1:3000/ws');

    // Simulate disconnect but with a non-empty getUrl
    act(() => {
      mockWs.simulateStatusChange('disconnected', 'ws://192.168.1.1:3000/ws');
    });

    // URL should remain because getUrl() is not empty
    expect(result.current.url).toBe('ws://192.168.1.1:3000/ws');
  });

  // 9. Provider unsubscribes from wsClient on unmount
  test('provider unsubscribes from wsClient on unmount', () => {
    const { unmount } = renderHook(() => useBoth(), { wrapper });

    // Provider subscribes to onStatusChange on mount
    expect(mockWs.statusHandlerCount).toBe(1);

    unmount();

    // After unmount, the handler should be removed
    expect(mockWs.statusHandlerCount).toBe(0);
  });

  // 10. Provider subscribes on mount
  test('provider subscribes to wsClient onStatusChange on mount', () => {
    expect(mockWs.statusHandlerCount).toBe(0);

    renderHook(() => useBoth(), { wrapper });

    expect(mockWs.statusHandlerCount).toBe(1);
    expect(mockWs.mockOnStatusChange.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  // 11. URL starts as null when initial getUrl() returns empty string
  test('URL starts as null when initial getUrl returns empty string', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    // Empty string is falsy, so the context should store null
    expect(result.current.url).toBeNull();
  });

  // 12. URL updates to a non-empty value when wsClient provides one on connect
  test('URL updates to non-empty value when wsClient provides one on connect', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    // Initially null
    expect(result.current.url).toBeNull();

    // Simulate connecting with a URL
    act(() => {
      mockWs.simulateStatusChange('connected', 'ws://initial:3000/ws');
    });

    // URL should now reflect the value from getUrl()
    expect(result.current.url).toBe('ws://initial:3000/ws');
  });

  // 13. Multiple status changes keep URL in sync
  test('multiple status changes keep URL in sync', () => {
    const { result } = renderHook(() => useBoth(), { wrapper });

    // Set initial URL
    act(() => {
      result.current.setUrl('ws://host-a:3000/ws');
    });
    expect(result.current.url).toBe('ws://host-a:3000/ws');

    // Connect — URL should update
    act(() => {
      mockWs.simulateStatusChange('connected', 'ws://host-b:3000/ws');
    });
    expect(result.current.url).toBe('ws://host-b:3000/ws');

    // Reconnecting — URL should stay (no special handling for reconnecting)
    act(() => {
      mockWs.simulateStatusChange('reconnecting');
    });
    expect(result.current.url).toBe('ws://host-b:3000/ws');

    // Disconnect with empty getUrl — URL should become null
    // (explicitly pass empty URL to simulate server clearing the URL)
    act(() => {
      mockWs.simulateStatusChange('disconnected', '');
    });
    expect(result.current.url).toBeNull();

    // Reconnect with URL
    act(() => {
      mockWs.simulateStatusChange('connected', 'ws://host-c:3000/ws');
    });
    expect(result.current.url).toBe('ws://host-c:3000/ws');
  });
});
