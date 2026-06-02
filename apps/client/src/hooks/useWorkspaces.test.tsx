/// <reference lib="dom" />
import { setupTestDom, createMockAuthState } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PROTOCOL_VERSION, type MessageEnvelope } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock ws-client module
// ---------------------------------------------------------------------------

const mockSend = mock(() => {});
let messageHandlers: Array<(envelope: MessageEnvelope) => void> = [];

const mockOnMessage = mock((handler: (envelope: MessageEnvelope) => void) => {
  messageHandlers.push(handler);
  return () => {
    messageHandlers = messageHandlers.filter((h) => h !== handler);
  };
});

const mockGetStatus = mock(() => 'connected' as const);
let statusHandlers: Array<(status: string) => void> = [];

const mockOnStatusChange = mock((handler: (status: string) => void) => {
  statusHandlers.push(handler);
  return () => {
    statusHandlers = statusHandlers.filter((h) => h !== handler);
  };
});

mock.module('../lib/ws-client', () => ({
  wsClient: {
    send: mockSend,
    onMessage: mockOnMessage,
    getStatus: mockGetStatus,
    onStatusChange: mockOnStatusChange,
  },
}));

// ---------------------------------------------------------------------------
// Import after mocking (useAuth is NOT mocked — auth state is provided via
// AuthContext.Provider in the wrapper so the real useAuth() hook works)
// ---------------------------------------------------------------------------

const { AuthContext } = await import('./useAuth');
const { useWorkspaces, useCreateWorkspace, useDeleteWorkspace, useUpdateWorkspace } =
  await import('./useWorkspaces');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryWrapper(
  authState = createMockAuthState({ isAuthenticated: true, token: 'test-token' }),
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      AuthContext.Provider,
      { value: authState },
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

/**
 * Simulate a server response by calling all registered message handlers
 * with a response envelope whose `id` matches the request that was sent.
 */
function simulateResponse(requestId: string, payload: unknown, error?: unknown) {
  const response: MessageEnvelope = {
    v: PROTOCOL_VERSION,
    type: 'response',
    id: requestId,
    payload: error ? null : payload,
    ...(error ? { error } : {}),
  };

  // Copy handlers array since handlers may unsubscribe during iteration
  const handlers = [...messageHandlers];
  for (const handler of handlers) {
    handler(response);
  }
}

/**
 * Get the request envelope that was sent via the last wsClient.send call.
 */
function getLastSentEnvelope(): MessageEnvelope {
  const calls = mockSend.mock.calls as unknown as Array<[unknown, ...unknown[]]>;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  return calls[calls.length - 1][0] as MessageEnvelope;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWorkspaces', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockOnMessage.mockClear();
    mockGetStatus.mockClear();
    mockOnStatusChange.mockClear();
    messageHandlers = [];
    statusHandlers = [];
  });

  afterEach(() => {
    messageHandlers = [];
  });

  // -----------------------------------------------------------------------
  // 1. useWorkspaces() returns { data: workspaces, isLoading, error }
  // -----------------------------------------------------------------------
  test('returns workspaces, isLoading, and error', async () => {
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: createQueryWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Simulate server response for workspace.list
    const envelope = getLastSentEnvelope();
    const workspaces = [
      { id: '1', name: 'Project A', cwd: '/home/user/a', color: '#ff0000', sortOrder: 0 },
    ];

    simulateResponse(envelope.id!, { workspaces });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(workspaces);
    expect(result.current.error).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. useWorkspaces() sends workspace.list request
  // -----------------------------------------------------------------------
  test('sends workspace.list request on mount', () => {
    renderHook(() => useWorkspaces(), {
      wrapper: createQueryWrapper(),
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const envelope = getLastSentEnvelope();
    expect(envelope.channel).toBe('workspace.list');
    expect(envelope.type).toBe('request');
    expect(envelope.id).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 3. useWorkspaces() sets error on failure
  // -----------------------------------------------------------------------
  test('sets error when request fails', async () => {
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: createQueryWrapper(),
    });

    const envelope = getLastSentEnvelope();

    simulateResponse(envelope.id!, null, {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Something went wrong');
  });
});

describe('useCreateWorkspace', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockOnMessage.mockClear();
    mockGetStatus.mockClear();
    mockOnStatusChange.mockClear();
    messageHandlers = [];
    statusHandlers = [];
  });

  afterEach(() => {
    messageHandlers = [];
  });

  // -----------------------------------------------------------------------
  // 1. useCreateWorkspace() returns a mutation
  // -----------------------------------------------------------------------
  test('returns a mutation object', () => {
    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current).toHaveProperty('mutate');
    expect(result.current).toHaveProperty('mutateAsync');
    expect(result.current).toHaveProperty('isPending');
  });

  // -----------------------------------------------------------------------
  // 2. mutate sends workspace.create request
  // -----------------------------------------------------------------------
  test('mutate sends workspace.create request', async () => {
    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: createQueryWrapper(),
    });

    const newWorkspace = { name: 'Test', cwd: '/tmp', color: '#00ff00' };

    act(() => {
      result.current.mutate(newWorkspace);
    });

    // Wait for the send to happen
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalled();
    });

    const envelope = getLastSentEnvelope();
    expect(envelope.channel).toBe('workspace.create');
    expect(envelope.type).toBe('request');
    expect(envelope.payload).toEqual(newWorkspace);

    // Simulate successful response
    const createdWorkspace = { id: 'new-id', sortOrder: 0, ...newWorkspace };
    simulateResponse(envelope.id!, { workspace: createdWorkspace });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ workspace: createdWorkspace });
  });
});

describe('useDeleteWorkspace', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockOnMessage.mockClear();
    mockGetStatus.mockClear();
    mockOnStatusChange.mockClear();
    messageHandlers = [];
    statusHandlers = [];
  });

  afterEach(() => {
    messageHandlers = [];
  });

  // -----------------------------------------------------------------------
  // 1. useDeleteWorkspace() returns a mutation
  // -----------------------------------------------------------------------
  test('returns a mutation object', () => {
    const { result } = renderHook(() => useDeleteWorkspace(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current).toHaveProperty('mutate');
    expect(result.current).toHaveProperty('mutateAsync');
    expect(result.current).toHaveProperty('isPending');
  });

  // -----------------------------------------------------------------------
  // 2. mutate sends workspace.delete request
  // -----------------------------------------------------------------------
  test('mutate sends workspace.delete request', async () => {
    const { result } = renderHook(() => useDeleteWorkspace(), {
      wrapper: createQueryWrapper(),
    });

    act(() => {
      result.current.mutate({ id: 'ws-to-delete' });
    });

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalled();
    });

    const envelope = getLastSentEnvelope();
    expect(envelope.channel).toBe('workspace.delete');
    expect(envelope.type).toBe('request');
    expect(envelope.payload).toEqual({ id: 'ws-to-delete' });

    // Simulate successful response
    simulateResponse(envelope.id!, {});

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe('useUpdateWorkspace', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockOnMessage.mockClear();
    mockGetStatus.mockClear();
    mockOnStatusChange.mockClear();
    messageHandlers = [];
    statusHandlers = [];
  });

  afterEach(() => {
    messageHandlers = [];
  });

  // -----------------------------------------------------------------------
  // 1. useUpdateWorkspace() returns a mutation
  // -----------------------------------------------------------------------
  test('returns a mutation object', () => {
    const { result } = renderHook(() => useUpdateWorkspace(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current).toHaveProperty('mutate');
    expect(result.current).toHaveProperty('mutateAsync');
    expect(result.current).toHaveProperty('isPending');
  });

  // -----------------------------------------------------------------------
  // 2. mutate sends workspace.update request
  // -----------------------------------------------------------------------
  test('mutate sends workspace.update request', async () => {
    const { result } = renderHook(() => useUpdateWorkspace(), {
      wrapper: createQueryWrapper(),
    });

    const updatePayload = { id: 'ws-1', name: 'Renamed' };

    act(() => {
      result.current.mutate(updatePayload);
    });

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalled();
    });

    const envelope = getLastSentEnvelope();
    expect(envelope.channel).toBe('workspace.update');
    expect(envelope.type).toBe('request');
    expect(envelope.payload).toEqual(updatePayload);

    // Simulate successful response
    simulateResponse(envelope.id!, {});

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Cleanup: restore mocked modules so other test files are not polluted
// ---------------------------------------------------------------------------
afterAll(() => {
  mock.restore();
});
