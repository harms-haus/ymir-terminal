import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  type RequestEnvelope,
  type EventEnvelope,
  PROTOCOL_VERSION,
  ErrorCodes,
  type WorkspaceListResponse,
  type WorkspaceCreateResponse,
  type WorkspaceSummary,
  type FileChangeEvent as FileChangePayload,
} from '@ymir/shared';
import { MessageRouter } from '../router';
import { registerWorkspaceHandlers } from './workspaces';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock connection object. */
function mockConn() {
  const sent: unknown[] = [];
  return {
    sessionId: crypto.randomUUID(),
    isAuthenticated: true,
    sent,
    send(data: unknown) {
      sent.push(data);
    },
  };
}

/** Build a request envelope for the given channel + payload. */
function request(channel: string, payload: unknown): RequestEnvelope {
  return {
    v: PROTOCOL_VERSION,
    type: 'request',
    id: crypto.randomUUID(),
    channel,
    payload,
  } as RequestEnvelope;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerWorkspaceHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let mockPersistentDb: { query: ReturnType<typeof mock> };
  let mockSessionDb: { query: ReturnType<typeof mock> };

  // Track calls to workspace CRUD functions via module-level mocking
  let listWorkspacesFn: ReturnType<typeof mock>;
  let createWorkspaceFn: ReturnType<typeof mock>;
  let updateWorkspaceFn: ReturnType<typeof mock>;
  let deleteWorkspaceFn: ReturnType<typeof mock>;
  let getWorkspaceFn: ReturnType<typeof mock>;
  let startWorkspaceWatcherFn: ReturnType<typeof mock>;
  let stopWorkspaceWatcherFn: ReturnType<typeof mock>;
  let broadcastedEvents: EventEnvelope[];

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();

    // Create mock DB objects (shape doesn't matter much since we mock the CRUD functions)
    mockPersistentDb = { query: mock(() => {}) };
    mockSessionDb = { query: mock(() => {}) };

    // Mock the CRUD functions
    listWorkspacesFn = mock(() => []);
    createWorkspaceFn = mock(
      (_arg0: unknown, input: { name: string; cwd: string; color?: string }) => ({
        id: 'ws-1',
        name: input.name,
        cwd: input.cwd,
        color: input.color ?? '#007acc',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }),
    );
    updateWorkspaceFn = mock((_arg0: unknown, id: string, input: Record<string, unknown>) => {
      const base: WorkspaceSummary = { id, name: 'original', cwd: '/original', color: '#000000' };
      return {
        ...base,
        ...input,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
    });
    deleteWorkspaceFn = mock(() => true);
    getWorkspaceFn = mock(() => ({
      id: 'ws-1',
      name: 'original',
      cwd: '/original',
      color: '#000000',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    }));
    startWorkspaceWatcherFn = mock(() => {});
    stopWorkspaceWatcherFn = mock(() => {});

    broadcastedEvents = [];

    registerWorkspaceHandlers(router, {
      persistentDb: mockPersistentDb as unknown as import('bun:sqlite').Database,
      sessionDb: mockSessionDb as unknown as import('bun:sqlite').Database,
      broadcastEvent: (event: EventEnvelope) => {
        broadcastedEvents.push(event);
      },
      _mocks: {
        listWorkspaces: listWorkspacesFn,
        createWorkspace: createWorkspaceFn,
        updateWorkspace: updateWorkspaceFn,
        deleteWorkspace: deleteWorkspaceFn,
        getWorkspace: getWorkspaceFn,
        startWorkspaceWatcher: startWorkspaceWatcherFn,
        stopWorkspaceWatcher: stopWorkspaceWatcherFn,
      },
    });
  });

  // -----------------------------------------------------------------------
  // 1. Handler registers for expected channels
  // -----------------------------------------------------------------------
  describe('channel registration', () => {
    it('registers workspace.list handler', async () => {
      const req = request('workspace.list', {});
      const result = await router.route(conn, req);
      // null means a handler was found (no unmatched-channel error)
      expect(result).toBeNull();
    });

    it('registers workspace.create handler', async () => {
      const req = request('workspace.create', { name: 'test', cwd: '/tmp', color: '#ff0' });
      await router.route(conn, req);
      // Should not throw, meaning a handler was registered
      expect(conn.sent.length).toBe(1);
    });

    it('registers workspace.update handler', async () => {
      const req = request('workspace.update', { id: 'ws-1', name: 'updated' });
      await router.route(conn, req);
      expect(conn.sent.length).toBe(1);
    });

    it('registers workspace.delete handler', async () => {
      const req = request('workspace.delete', { id: 'ws-1' });
      await router.route(conn, req);
      expect(conn.sent.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // 2. workspace.list
  // -----------------------------------------------------------------------
  describe('workspace.list', () => {
    it('responds with WorkspaceListResponse { workspaces: [...] }', async () => {
      const fakeWorkspaces: WorkspaceSummary[] = [
        { id: 'ws-1', name: 'Project A', cwd: '/home/user/a', color: '#ff0000' },
        { id: 'ws-2', name: 'Project B', cwd: '/home/user/b', color: '#00ff00' },
      ];
      listWorkspacesFn.mockImplementation(() => fakeWorkspaces);

      const req = request('workspace.list', {});
      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as WorkspaceListResponse;
      expect(payload.workspaces).toEqual(fakeWorkspaces);
    });

    it('returns empty array when no workspaces exist', async () => {
      listWorkspacesFn.mockImplementation(() => []);

      const req = request('workspace.list', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      const payload = resp.payload as WorkspaceListResponse;
      expect(payload.workspaces).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // 3. workspace.create
  // -----------------------------------------------------------------------
  describe('workspace.create', () => {
    it('validates name/cwd/color, creates workspace, responds with WorkspaceCreateResponse', async () => {
      const req = request('workspace.create', {
        name: 'My Project',
        cwd: '/home/dev',
        color: '#007acc',
      });
      await router.route(conn, req);

      expect(createWorkspaceFn).toHaveBeenCalledTimes(1);
      expect(createWorkspaceFn.mock.calls[0][1]).toEqual({
        name: 'My Project',
        cwd: '/home/dev',
        color: '#007acc',
      });

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as WorkspaceCreateResponse;
      expect(payload.workspace).toBeDefined();
      expect(payload.workspace.name).toBe('My Project');
      expect(payload.workspace.cwd).toBe('/home/dev');
      expect(payload.workspace.color).toBe('#007acc');
    });

    it('returns error INVALID_MESSAGE when name is missing', async () => {
      const req = request('workspace.create', { cwd: '/home/dev', color: '#007acc' });
      await router.route(conn, req);

      expect(createWorkspaceFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.error).toBeDefined();
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns error INVALID_MESSAGE when cwd is missing', async () => {
      const req = request('workspace.create', { name: 'test', color: '#007acc' });
      await router.route(conn, req);

      expect(createWorkspaceFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns error INVALID_MESSAGE when color is missing', async () => {
      const req = request('workspace.create', { name: 'test', cwd: '/home/dev' });
      await router.route(conn, req);

      expect(createWorkspaceFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns error INVALID_MESSAGE when payload is null', async () => {
      const req = request('workspace.create', null);
      await router.route(conn, req);

      expect(createWorkspaceFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('expands tilde in cwd to absolute path', async () => {
      const req = request('workspace.create', {
        name: 'Tilde',
        cwd: '~/projects/my-app',
        color: '#111111',
      });
      await router.route(conn, req);

      expect(createWorkspaceFn).toHaveBeenCalledTimes(1);
      const callArgs = createWorkspaceFn.mock.calls[0];
      const expectedCwd = path.resolve(os.homedir(), 'projects/my-app');
      expect(callArgs[1].cwd).toBe(expectedCwd);
    });

    it('starts workspace watcher and broadcasts file.change events', async () => {
      // Capture the watcher callback passed to startWorkspaceWatcher
      let watcherCallback: ((event: { path: string; kind: string }) => void) | undefined;
      startWorkspaceWatcherFn.mockImplementation(
        (
          _workspaceId: string,
          _dirPath: string,
          cb: (event: { path: string; kind: string }) => void,
        ) => {
          watcherCallback = cb;
        },
      );

      const req = request('workspace.create', {
        name: 'Watched',
        cwd: '/tmp/watched',
        color: '#123',
      });
      await router.route(conn, req);

      // Handler should have called startWorkspaceWatcher
      expect(startWorkspaceWatcherFn).toHaveBeenCalledTimes(1);
      expect(startWorkspaceWatcherFn.mock.calls[0][0]).toBe('ws-1');
      expect(startWorkspaceWatcherFn.mock.calls[0][1]).toBe('/tmp/watched');
      expect(watcherCallback).toBeDefined();

      // Simulate a file change event from the watcher
      broadcastedEvents = [];
      watcherCallback!({ path: '/tmp/watched/src/index.ts', kind: 'modify' });

      // Should have broadcast exactly one event
      expect(broadcastedEvents.length).toBe(1);
      const event = broadcastedEvents[0] as EventEnvelope<FileChangePayload>;
      expect(event.v).toBe(PROTOCOL_VERSION);
      expect(event.type).toBe('event');
      expect(event.channel).toBe('file.change');
      expect(event.payload).toEqual({
        workspaceId: 'ws-1',
        path: '/tmp/watched/src/index.ts',
        kind: 'modify',
      });
    });
  });

  // -----------------------------------------------------------------------
  // 4. workspace.update
  // -----------------------------------------------------------------------
  describe('workspace.update', () => {
    it('updates provided fields only', async () => {
      const req = request('workspace.update', { id: 'ws-1', name: 'Renamed' });
      await router.route(conn, req);

      expect(updateWorkspaceFn).toHaveBeenCalledTimes(1);
      // The handler should pass only the provided fields
      const callArgs = updateWorkspaceFn.mock.calls[0];
      expect(callArgs[1]).toBe('ws-1'); // id
      expect(callArgs[2]).toEqual({ name: 'Renamed' }); // only name, not cwd or color

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('updates multiple fields', async () => {
      const req = request('workspace.update', {
        id: 'ws-1',
        name: 'New',
        cwd: '/new',
        color: '#aabbcc',
      });
      await router.route(conn, req);

      const callArgs = updateWorkspaceFn.mock.calls[0];
      expect(callArgs[2]).toEqual({ name: 'New', cwd: '/new', color: '#aabbcc' });
    });

    it('returns error INVALID_MESSAGE when id is missing', async () => {
      const req = request('workspace.update', { name: 'Renamed' });
      await router.route(conn, req);

      expect(updateWorkspaceFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('expands tilde in cwd to absolute path', async () => {
      const req = request('workspace.update', {
        id: 'ws-1',
        cwd: '~/new-location',
      });
      await router.route(conn, req);

      expect(updateWorkspaceFn).toHaveBeenCalledTimes(1);
      const callArgs = updateWorkspaceFn.mock.calls[0];
      const expectedCwd = path.resolve(os.homedir(), 'new-location');
      expect(callArgs[2].cwd).toBe(expectedCwd);
    });

    it('returns error WORKSPACE_NOT_FOUND when update returns null', async () => {
      updateWorkspaceFn.mockImplementation(() => null);

      const req = request('workspace.update', { id: 'nonexistent', name: 'x' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // 5. workspace.delete
  // -----------------------------------------------------------------------
  describe('workspace.delete', () => {
    it('removes workspace and responds with success', async () => {
      const req = request('workspace.delete', { id: 'ws-1' });
      await router.route(conn, req);

      expect(deleteWorkspaceFn).toHaveBeenCalledTimes(1);
      expect(deleteWorkspaceFn.mock.calls[0][1]).toBe('ws-1');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();
      expect(resp.payload).toEqual({ deleted: true });
    });

    it('returns error INVALID_MESSAGE when id is missing', async () => {
      const req = request('workspace.delete', {});
      await router.route(conn, req);

      expect(deleteWorkspaceFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns error WORKSPACE_NOT_FOUND when delete returns false', async () => {
      deleteWorkspaceFn.mockImplementation(() => false);

      const req = request('workspace.delete', { id: 'nonexistent' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Missing required fields → INVALID_MESSAGE
  // -----------------------------------------------------------------------
  describe('missing required fields', () => {
    it('returns INVALID_MESSAGE for workspace.create with empty payload', async () => {
      const req = request('workspace.create', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for workspace.update with empty payload (no id)', async () => {
      const req = request('workspace.update', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for workspace.delete with empty payload (no id)', async () => {
      const req = request('workspace.delete', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });
});
