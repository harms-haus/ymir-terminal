/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  ErrorCodes,
  type GitStatusResponse,
  type GitLogResponse,
  type GitLogItem,
} from '@ymir/shared';
import { mockConn, request } from '../../test-helpers/mock-utils';
import { MessageRouter } from '../router';
import { registerGitHandlers } from './git';
import type { GitDeps } from './git';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerGitHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let getGitStatusFn: ReturnType<typeof mock>;
  let getGitLogFn: ReturnType<typeof mock>;
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

    const fakeCommits: GitLogItem[] = [
      { id: 'aaa', message: 'third commit', author: 'Alice <alice@example.com>', date: 1700000003, parents: ['bbb'] },
      { id: 'bbb', message: 'second commit', author: 'Bob <bob@example.com>', date: 1700000002, parents: ['ccc'] },
      { id: 'ccc', message: 'first commit', author: 'Alice <alice@example.com>', date: 1700000001, parents: [] },
    ];

    getGitLogFn = mock(async (_dirPath: string, _skip: number, _limit: number) => {
      if (_dirPath === '/tmp/plain') return [];
      return fakeCommits.slice(_skip, _skip + _limit);
    });

    getGitStatusFn = mock(async (_dirPath: string) => {
      if (_dirPath === '/tmp/plain') return null;
      return {
        branch: 'main',
        changes: [
          { path: 'src/foo.ts', status: 'M' },
          { path: 'README.md', status: '?' },
        ],
        staged: [{ path: 'src/bar.ts', status: 'A' }],
      };
    });

    const deps: GitDeps = {
      persistentDb: {} as any,
      _mocks: {
        getGitStatus: getGitStatusFn,
        getGitLog: getGitLogFn,
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
      expect(payload.staged).toEqual([{ path: 'src/bar.ts', status: 'A' }]);
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

  // -----------------------------------------------------------------------
  // git.log tests
  // -----------------------------------------------------------------------
  describe('git.log', () => {
    const fakeCommits: GitLogItem[] = [
      { id: 'aaa', message: 'third commit', author: 'Alice <alice@example.com>', date: 1700000003, parents: ['bbb'] },
      { id: 'bbb', message: 'second commit', author: 'Bob <bob@example.com>', date: 1700000002, parents: ['ccc'] },
      { id: 'ccc', message: 'first commit', author: 'Alice <alice@example.com>', date: 1700000001, parents: [] },
    ];

    it('returns commits with id, message, author, date for a valid workspace', async () => {
      const req = request('git.log', { workspaceId: 'ws-1', skip: 0, limit: 10 });
      await router.route(conn, req);

      expect(getGitLogFn).toHaveBeenCalledTimes(1);
      expect(getGitLogFn.mock.calls[0][0]).toBe('/home/dev/project');
      expect(getGitLogFn.mock.calls[0][1]).toBe(0);
      // limit is clamped to min(10, 100) = 10
      expect(getGitLogFn.mock.calls[0][2]).toBe(10);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as GitLogResponse;
      expect(payload.commits).toEqual(fakeCommits);
      expect(payload.hasMore).toBe(false); // 3 commits < limit 10
    });

    it('respects skip and limit for pagination and sets hasMore=true when more exist', async () => {
      const req = request('git.log', { workspaceId: 'ws-1', skip: 2, limit: 1 });
      await router.route(conn, req);

      expect(getGitLogFn).toHaveBeenCalledTimes(1);
      expect(getGitLogFn.mock.calls[0][1]).toBe(2);
      expect(getGitLogFn.mock.calls[0][2]).toBe(1);

      const resp = conn.sent[0] as Record<string, unknown>;
      const payload = resp.payload as GitLogResponse;
      // fakeCommits.slice(2, 3) → [{ id: 'ccc', ... }]
      expect(payload.commits).toHaveLength(1);
      expect(payload.commits[0].id).toBe('ccc');
      expect(payload.commits[0].message).toBe('first commit');
      // hasMore: commits.length (1) === limit (1) → true
      expect(payload.hasMore).toBe(true);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.log', { workspaceId: 'nonexistent', skip: 0, limit: 10 });
      await router.route(conn, req);

      expect(getGitLogFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns empty commits for a non-git directory', async () => {
      const req = request('git.log', { workspaceId: 'ws-nongit', skip: 0, limit: 10 });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as GitLogResponse;
      expect(payload.commits).toEqual([]);
      expect(payload.hasMore).toBe(false);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const req = request('git.log', { skip: 0, limit: 10 });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });
});
