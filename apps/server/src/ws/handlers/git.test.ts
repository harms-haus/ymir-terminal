import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  type RequestEnvelope,
  PROTOCOL_VERSION,
  ErrorCodes,
  type GitStatusResponse,
} from '@ymir/shared';
import { MessageRouter } from '../router';
import { registerGitHandlers } from './git';
import type { GitDeps } from './git';

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

describe('registerGitHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let getGitStatusFn: ReturnType<typeof mock>;
  let getWorkspaceFn: ReturnType<typeof mock>;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();

    getWorkspaceFn = mock((_db: unknown, id: string) => {
      if (id === 'ws-1') {
        return { id: 'ws-1', name: 'Test', cwd: '/home/dev/project', color: '#007acc' };
      }
      if (id === 'ws-nongit') {
        return { id: 'ws-nongit', name: 'No Git', cwd: '/tmp/plain', color: '#007acc' };
      }
      return null;
    });

    getGitStatusFn = mock((_dirPath: string) => {
      if (_dirPath === '/tmp/plain') return null;
      return {
        branch: 'main',
        changes: [
          { path: 'src/foo.ts', status: 'M' },
          { path: 'README.md', status: '?' },
        ],
        staged: [
          { path: 'src/bar.ts', status: 'A' },
        ],
      };
    });

    const deps: GitDeps = {
      persistentDb: {} as any,
      _mocks: {
        getGitStatus: getGitStatusFn,
        getWorkspace: getWorkspaceFn,
      },
    };

    registerGitHandlers(router, deps);
  });

  // -----------------------------------------------------------------------
  // 1. Handler registers for channel
  // -----------------------------------------------------------------------
  describe('channel registration', () => {
    it('registers git.status handler', async () => {
      const req = request('git.status', { workspaceId: 'ws-1' });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Returns GitStatusResponse { branch, changes, staged }
  // -----------------------------------------------------------------------
  describe('git.status', () => {
    it('returns GitStatusResponse for a git workspace', async () => {
      const req = request('git.status', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      expect(getGitStatusFn).toHaveBeenCalledTimes(1);
      expect(getGitStatusFn.mock.calls[0][0]).toBe('/home/dev/project');

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as GitStatusResponse;
      expect(payload.branch).toBe('main');
      expect(payload.changes).toEqual([
        { path: 'src/foo.ts', status: 'M' },
        { path: 'README.md', status: '?' },
      ]);
      expect(payload.staged).toEqual([
        { path: 'src/bar.ts', status: 'A' },
      ]);
    });

    // -----------------------------------------------------------------
    // 3. Non-git workspace returns { branch: null, changes: [], staged: [] }
    // -----------------------------------------------------------------
    it('returns branch: null with empty arrays for non-git workspace', async () => {
      const req = request('git.status', { workspaceId: 'ws-nongit' });
      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as GitStatusResponse;
      expect(payload.branch).toBeNull();
      expect(payload.changes).toEqual([]);
      expect(payload.staged).toEqual([]);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.status', { workspaceId: 'nonexistent' });
      await router.route(conn, req);

      expect(getGitStatusFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const req = request('git.status', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });
});
