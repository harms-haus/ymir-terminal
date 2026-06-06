import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  type EventEnvelope,
  PROTOCOL_VERSION,
  ErrorCodes,
  type WorkspaceListResponse,
  type WorkspaceCreateResponse,
  type FileChangeEvent as FileChangePayload,
  type CwdCompression,
} from '@ymir/shared';
import { mockConn, request, makeGetWorkspaceMock } from '../../test-helpers/mock-utils';
import type { Database } from 'bun:sqlite';
import { MessageRouter } from '../router';
import { registerWorkspaceHandlers } from './workspaces';

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
  let startManagedWatcherFn: ReturnType<typeof mock>;
  let stopManagedWatcherFn: ReturnType<typeof mock>;
  let reorderWorkspacesFn: ReturnType<typeof mock>;
  let deletePersistedTabsByWorkspaceFn: ReturnType<typeof mock>;
  let buildCompressionMapFn: ReturnType<typeof mock>;
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
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }),
    );
    updateWorkspaceFn = mock((_arg0: unknown, id: string, input: Record<string, unknown>) => {
      const base = { id, name: 'original', cwd: '/original', color: '#000000', sort_order: 0 };
      return {
        ...base,
        ...input,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
    });
    deleteWorkspaceFn = mock(() => true);
    getWorkspaceFn = makeGetWorkspaceMock({
      id: 'ws-1',
      name: 'original',
      cwd: '/original',
      color: '#000000',
    });
    startManagedWatcherFn = mock(() => {});
    stopManagedWatcherFn = mock(() => {});
    reorderWorkspacesFn = mock(() => {});
    deletePersistedTabsByWorkspaceFn = mock(() => {});
    buildCompressionMapFn = mock(() => ({
      segments: ['', 'home', 'user', 'a'],
      uniquePrefixes: ['', 'h', 'u', 'a'],
      compressibleCount: 2,
    }));

    broadcastedEvents = [];

    registerWorkspaceHandlers(router, {
      persistentDb: mockPersistentDb as unknown as Database,
      sessionDb: mockSessionDb as unknown as Database,
      broadcastEvent: (event: EventEnvelope) => {
        broadcastedEvents.push(event);
      },
      _mocks: {
        listWorkspaces: listWorkspacesFn,
        createWorkspace: createWorkspaceFn,
        updateWorkspace: updateWorkspaceFn,
        deleteWorkspace: deleteWorkspaceFn,
        getWorkspace: getWorkspaceFn,
        startManagedWatcher: startManagedWatcherFn,
        stopManagedWatcher: stopManagedWatcherFn,
        reorderWorkspaces: reorderWorkspacesFn,
        deletePersistedTabsByWorkspace: deletePersistedTabsByWorkspaceFn,
        buildCompressionMap: buildCompressionMapFn,
      },
    });
  });

  // -----------------------------------------------------------------------
  // 2. workspace.list
  // -----------------------------------------------------------------------
  describe('workspace.list', () => {
    it('responds with WorkspaceListResponse { workspaces: [...] }', async () => {
      const fakeWorkspaces = [
        { id: 'ws-1', name: 'Project A', cwd: '/home/user/a', color: '#ff0000', sort_order: 0 },
        { id: 'ws-2', name: 'Project B', cwd: '/home/user/b', color: '#00ff00', sort_order: 1 },
      ];
      listWorkspacesFn.mockImplementation(() => fakeWorkspaces);

      const req = request('workspace.list', {});
      await router.route(conn, req);

      expect(listWorkspacesFn).toHaveBeenCalledTimes(1);
      expect(listWorkspacesFn.mock.calls[0][0]).toBe(mockPersistentDb);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as WorkspaceListResponse;
      expect(payload.workspaces).toEqual([
        {
          id: 'ws-1',
          name: 'Project A',
          cwd: '/home/user/a',
          cwdCompression: {
            segments: ['', 'home', 'user', 'a'],
            uniquePrefixes: ['', 'h', 'u', 'a'],
            compressibleCount: 2,
          },
          color: '#ff0000',
          sortOrder: 0,
        },
        {
          id: 'ws-2',
          name: 'Project B',
          cwd: '/home/user/b',
          cwdCompression: {
            segments: ['', 'home', 'user', 'a'],
            uniquePrefixes: ['', 'h', 'u', 'a'],
            compressibleCount: 2,
          },
          color: '#00ff00',
          sortOrder: 1,
        },
      ]);
    });

    it('returns empty array when no workspaces exist', async () => {
      listWorkspacesFn.mockImplementation(() => []);

      const req = request('workspace.list', {});
      await router.route(conn, req);

      expect(listWorkspacesFn).toHaveBeenCalledTimes(1);
      expect(listWorkspacesFn.mock.calls[0][0]).toBe(mockPersistentDb);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
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
      expect(createWorkspaceFn.mock.calls[0][0]).toBe(mockPersistentDb);
      expect(createWorkspaceFn.mock.calls[0][1]).toEqual({
        name: 'My Project',
        cwd: path.resolve('/home/dev'),
        color: '#007acc',
      });

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as WorkspaceCreateResponse;
      expect(payload.workspace).toBeDefined();
      expect(payload.workspace.id).toBe('ws-1');
      expect(payload.workspace.name).toBe('My Project');
      expect(payload.workspace.cwd).toBe(path.resolve('/home/dev'));
      expect(payload.workspace.cwdCompression).toEqual({
        segments: ['', 'home', 'user', 'a'],
        uniquePrefixes: ['', 'h', 'u', 'a'],
        compressibleCount: 2,
      });
      expect(payload.workspace.color).toBe('#007acc');
      expect(payload.workspace.sortOrder).toBe(0);
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

    it('creates workspace successfully when cwd points to a non-existent directory', async () => {
      const req = request('workspace.create', {
        name: 'Ghost Project',
        cwd: '/nonexistent/path/that/does/not/exist',
        color: '#deadbe',
      });
      await router.route(conn, req);

      // The handler normalizes the path but does NOT validate directory existence
      expect(createWorkspaceFn).toHaveBeenCalledTimes(1);
      expect(createWorkspaceFn.mock.calls[0][1]).toEqual({
        name: 'Ghost Project',
        cwd: path.resolve('/nonexistent/path/that/does/not/exist'),
        color: '#deadbe',
      });

      // The watcher is still started (even though the directory doesn't exist)
      expect(startManagedWatcherFn).toHaveBeenCalledTimes(1);
      expect(startManagedWatcherFn.mock.calls[0][1]).toBe(
        path.resolve('/nonexistent/path/that/does/not/exist'),
      );

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as WorkspaceCreateResponse;
      expect(payload.workspace.cwd).toBe(path.resolve('/nonexistent/path/that/does/not/exist'));
      expect(payload.workspace.cwdCompression).toEqual({
        segments: ['', 'home', 'user', 'a'],
        uniquePrefixes: ['', 'h', 'u', 'a'],
        compressibleCount: 2,
      });
      expect(payload.workspace.name).toBe('Ghost Project');
    });

    it('starts managed watcher and broadcasts file.change events', async () => {
      // Capture the broadcast callback passed to startManagedWatcher
      let capturedBroadcast: ((envelope: EventEnvelope<FileChangePayload>) => void) | undefined;
      startManagedWatcherFn.mockImplementation(
        (
          _workspaceId: string,
          _cwd: string,
          broadcast: (envelope: EventEnvelope<FileChangePayload>) => void,
        ) => {
          capturedBroadcast = broadcast;
        },
      );

      const req = request('workspace.create', {
        name: 'Watched',
        cwd: '/tmp/watched',
        color: '#123',
      });
      await router.route(conn, req);

      // Handler should have called startManagedWatcher
      expect(startManagedWatcherFn).toHaveBeenCalledTimes(1);
      expect(startManagedWatcherFn.mock.calls[0][0]).toBe('ws-1');
      expect(startManagedWatcherFn.mock.calls[0][1]).toBe(path.resolve('/tmp/watched'));
      expect(capturedBroadcast).toBeDefined();

      // Simulate a file change event from the watcher by calling the broadcast
      // that startManagedWatcher would normally wrap
      broadcastedEvents = [];
      capturedBroadcast!({
        v: PROTOCOL_VERSION,
        type: 'event',
        channel: 'file.change',
        payload: {
          workspaceId: 'ws-1',
          path: '/tmp/watched/src/index.ts',
          kind: 'modify',
        },
      });

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
      const callArgs = updateWorkspaceFn.mock.calls[0];
      expect(callArgs[0]).toBe(mockPersistentDb);
      expect(callArgs[1]).toBe('ws-1');
      expect(callArgs[2]).toEqual({ name: 'Renamed' });

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();
      const payload = resp.payload as { workspace: Record<string, unknown> };
      expect(payload.workspace.id).toBe('ws-1');
      expect(payload.workspace.name).toBe('Renamed');
      expect(payload.workspace.cwdCompression).toEqual({
        segments: ['', 'home', 'user', 'a'],
        uniquePrefixes: ['', 'h', 'u', 'a'],
        compressibleCount: 2,
      });
    });

    it('updates multiple fields', async () => {
      const req = request('workspace.update', {
        id: 'ws-1',
        name: 'New',
        cwd: '/new',
        color: '#aabbcc',
      });
      await router.route(conn, req);

      expect(updateWorkspaceFn).toHaveBeenCalledTimes(1);
      const callArgs = updateWorkspaceFn.mock.calls[0];
      expect(callArgs[0]).toBe(mockPersistentDb);
      expect(callArgs[1]).toBe('ws-1');
      expect(callArgs[2]).toEqual({ name: 'New', cwd: path.resolve('/new'), color: '#aabbcc' });

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
      const payload = resp.payload as { workspace: Record<string, unknown> };
      expect(payload.workspace.id).toBe('ws-1');
      expect(payload.workspace.name).toBe('New');
      expect(payload.workspace.color).toBe('#aabbcc');
      expect(payload.workspace.cwdCompression).toEqual({
        segments: ['', 'home', 'user', 'a'],
        uniquePrefixes: ['', 'h', 'u', 'a'],
        compressibleCount: 2,
      });
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
      expect(deleteWorkspaceFn.mock.calls[0][0]).toBe(mockPersistentDb);
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

  // -----------------------------------------------------------------------
  // 7. workspace.reorder
  // -----------------------------------------------------------------------
  describe('workspace.reorder', () => {
    it('reorders workspaces and responds with null payload', async () => {
      const req = request('workspace.reorder', {
        workspaceIds: ['ws-3', 'ws-1', 'ws-2'],
      });
      await router.route(conn, req);

      expect(reorderWorkspacesFn).toHaveBeenCalledTimes(1);
      expect(reorderWorkspacesFn.mock.calls[0][1]).toEqual(['ws-3', 'ws-1', 'ws-2']);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();
      expect(resp.payload).toBeNull();
    });

    it('returns error INVALID_MESSAGE when workspaceIds is missing', async () => {
      const req = request('workspace.reorder', {});
      await router.route(conn, req);

      expect(reorderWorkspacesFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns error INVALID_MESSAGE when workspaceIds is an empty array', async () => {
      const req = request('workspace.reorder', { workspaceIds: [] });
      await router.route(conn, req);

      expect(reorderWorkspacesFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });
});
