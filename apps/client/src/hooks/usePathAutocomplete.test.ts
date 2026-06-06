/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll, jest } from 'bun:test';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock send-request module
// ---------------------------------------------------------------------------

const mockSendRequest = mock(() => Promise.resolve({ directories: [] }));

mock.module('../lib/send-request', () => ({
  sendRequest: mockSendRequest,
}));

// ---------------------------------------------------------------------------
// Mock useConnectionStatus module
// ---------------------------------------------------------------------------

let mockIsConnected = true;

mock.module('./useConnectionStatus', () => ({
  useConnectionStatus: () => ({
    isConnected: mockIsConnected,
    isReconnecting: false,
    status: mockIsConnected ? 'connected' : 'disconnected',
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { parsePathInput, usePathAutocomplete } = await import('./usePathAutocomplete');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('parsePathInput', () => {
  test('empty string returns empty queryDir and prefix', () => {
    expect(parsePathInput('')).toEqual({ queryDir: '', prefix: '' });
  });

  test('~ returns queryDir ~ with empty prefix', () => {
    expect(parsePathInput('~')).toEqual({ queryDir: '~', prefix: '' });
  });

  test('~/Doc returns queryDir ~ with prefix Doc', () => {
    expect(parsePathInput('~/Doc')).toEqual({ queryDir: '~', prefix: 'Doc' });
  });

  test('~/Documents/sof returns correct queryDir and prefix', () => {
    expect(parsePathInput('~/Documents/sof')).toEqual({
      queryDir: '~/Documents',
      prefix: 'sof',
    });
  });

  test('~/Documents/ (trailing slash) returns queryDir ~/Documents with empty prefix', () => {
    expect(parsePathInput('~/Documents/')).toEqual({
      queryDir: '~/Documents',
      prefix: '',
    });
  });

  test('/usr/loc returns queryDir /usr with prefix loc', () => {
    expect(parsePathInput('/usr/loc')).toEqual({ queryDir: '/usr', prefix: 'loc' });
  });

  test('/usr/ (trailing slash) returns queryDir /usr with empty prefix', () => {
    expect(parsePathInput('/usr/')).toEqual({ queryDir: '/usr', prefix: '' });
  });

  test('Documents/sof (relative) returns empty queryDir and full path as prefix', () => {
    expect(parsePathInput('Documents/sof')).toEqual({
      queryDir: '',
      prefix: 'Documents/sof',
    });
  });

  test('.hidden (relative, no slash) returns empty queryDir and .hidden as prefix', () => {
    expect(parsePathInput('.hidden')).toEqual({ queryDir: '', prefix: '.hidden' });
  });
});

describe('usePathAutocomplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSendRequest.mockClear();
    mockIsConnected = true;
    // Default: resolve with empty directories
    mockSendRequest.mockImplementation(() => Promise.resolve({ directories: [] }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 1. Returns empty directories when queryDir is empty
  // -----------------------------------------------------------------------
  test('returns empty directories when queryDir is empty', () => {
    const { result } = renderHook(() => usePathAutocomplete(''));

    expect(result.current.directories).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 2. Debounces and fetches directories
  // -----------------------------------------------------------------------
  test('debounces and fetches directories after 300ms', async () => {
    mockSendRequest.mockImplementation(() =>
      Promise.resolve({
        directories: [{ name: 'Documents' }, { name: 'Downloads' }],
      }),
    );

    const { result } = renderHook(() => usePathAutocomplete('~'));

    // Before debounce timer fires, no request should have been made
    expect(mockSendRequest).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);

    // Advance past the debounce delay
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Now the request should have been made
    await act(async () => {
      await Promise.resolve(); // flush microtasks
    });

    expect(mockSendRequest).toHaveBeenCalledTimes(1);
    expect(mockSendRequest).toHaveBeenCalledWith(
      'path.autocomplete',
      { path: '~' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  // -----------------------------------------------------------------------
  // 3. Cancels previous request on new input
  // -----------------------------------------------------------------------
  test('cancels previous request when queryDir changes rapidly', async () => {
    // Make sendRequest hang so we can test cancellation
    let resolveFirst: (v: unknown) => void;
    const firstCall = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let callCount = 0;
    mockSendRequest.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return firstCall as Promise<{ directories: never[] }>;
      }
      return Promise.resolve({ directories: [{ name: 'Documents' }] });
    });

    const { rerender } = renderHook(({ dir }) => usePathAutocomplete(dir), {
      initialProps: { dir: '~' },
    });

    // Trigger first request after debounce
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Change the input before the first request resolves
    rerender({ dir: '~/Doc' });

    // Advance debounce for new input
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Resolve the first (now stale) request
    act(() => {
      resolveFirst!({ directories: [] });
    });

    await act(async () => {
      await Promise.resolve();
    });

    // The first request's response should NOT update directories
    // because the AbortController was aborted
    // Only the second request should have completed
    expect(mockSendRequest).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 4. Returns directories on success
  // -----------------------------------------------------------------------
  test('returns directories on successful response', async () => {
    const dirs = [{ name: 'Documents' }, { name: 'Downloads' }, { name: 'Desktop' }];

    mockSendRequest.mockImplementation(() => Promise.resolve({ directories: dirs }));

    const { result } = renderHook(() => usePathAutocomplete('~'));

    act(() => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.directories).toEqual(dirs);
    expect(result.current.isLoading).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 5. Returns empty on error (non-abort errors)
  // -----------------------------------------------------------------------
  test('returns empty directories on non-abort error', async () => {
    mockSendRequest.mockImplementation(() => Promise.reject(new Error('Server error')));

    const { result } = renderHook(() => usePathAutocomplete('~'));

    act(() => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.directories).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 6. Does not fetch when not connected
  // -----------------------------------------------------------------------
  test('does not fetch when not connected', () => {
    mockIsConnected = false;

    const { result } = renderHook(() => usePathAutocomplete('~'));

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(mockSendRequest).not.toHaveBeenCalled();
    expect(result.current.directories).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 7. Does not fetch when enabled is false
  // -----------------------------------------------------------------------
  test('does not fetch when enabled is false', () => {
    const { result } = renderHook(() => usePathAutocomplete('~', { enabled: false }));

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(mockSendRequest).not.toHaveBeenCalled();
    expect(result.current.directories).toEqual([]);
  });
});
