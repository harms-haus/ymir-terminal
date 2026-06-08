/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  ErrorCodes,
  type GitStatusResponse,
  type GitLogResponse,
  type GitLogItem,
  type GitRepoInfo,
  type GitRepoDiscoveryProgressEvent,
  type GitBranch,
} from '@ymir/shared';
import {
  mockConn,
  request,
  makeGetWorkspaceMock,
  expectSuccessResponse,
} from '../../test-helpers/mock-utils';
import { MessageRouter } from '../router';
import { registerGitHandlers } from './git';
import type { GitDeps } from './git';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerGitHandlers — read-only queries', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let getGitStatusFn: ReturnType<typeof mock>;
  let getGitStatusEnhancedFn: ReturnType<typeof mock>;
  let getGitLogFn: ReturnType<typeof mock>;
  let getWorkspaceFn: ReturnType<typeof mock>;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();

    getWorkspaceFn = makeGetWorkspaceMock(
      { id: 'ws-1', cwd: '/home/dev/project' },
      { id: 'ws-nongit', name: 'No Git', cwd: '/tmp/plain' },
    );

    const fakeCommits: GitLogItem[] = [
      {
        id: 'aaa',
        message: 'third commit',
        author: 'Alice <alice@example.com>',
        date: 1700000003,
        parents: ['bbb'],
      },
      {
        id: 'bbb',
        message: 'second commit',
        author: 'Bob <bob@example.com>',
        date: 1700000002,
        parents: ['ccc'],
      },
      {
        id: 'ccc',
        message: 'first commit',
        author: 'Alice <alice@example.com>',
        date: 1700000001,
        parents: [],
      },
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

    getGitStatusEnhancedFn = mock(async (_dirPath: string) => {
      if (_dirPath === '/tmp/plain') return null;
      return {
        branch: 'main',
        changes: [
          { path: 'src/foo.ts', status: 'M' },
          { path: 'README.md', status: '??' },
        ],
        staged: [{ path: 'src/bar.ts', status: 'A' }],
        hasRemote: true,
        ahead: 0,
        behind: 1,
      };
    });

    const deps: GitDeps = {
      persistentDb: {} as any,
      _mocks: {
        getGitStatus: getGitStatusFn,
        getGitStatusEnhanced: getGitStatusEnhancedFn,
        getGitLog: getGitLogFn,
        getWorkspace: getWorkspaceFn,
      },
    };

    registerGitHandlers(router, deps);
  });

  // -----------------------------------------------------------------------
  // git.status
  // -----------------------------------------------------------------------
  describe('git.status', () => {
    it('returns GitStatusResponse for a git workspace', async () => {
      const req = request('git.status', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      expect(getGitStatusEnhancedFn).toHaveBeenCalledTimes(1);
      expect(getGitStatusEnhancedFn.mock.calls[0][0]).toBe('/home/dev/project');

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitStatusResponse>(resp, req.id);
      expect(payload.branch).toBe('main');
      expect(payload.changes).toEqual([
        { path: 'src/foo.ts', status: 'M' },
        { path: 'README.md', status: '??' },
      ]);
      expect(payload.staged).toEqual([{ path: 'src/bar.ts', status: 'A' }]);
    });

    it('returns branch: null with empty arrays for non-git workspace', async () => {
      const req = request('git.status', { workspaceId: 'ws-nongit' });
      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitStatusResponse>(resp);
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

    it('uses join(workspace.cwd, repoPath) when repoPath is provided', async () => {
      const getGitStatusEnhancedFn = mock(async (_dirPath: string) => ({
        branch: 'feature',
        changes: [{ path: 'a.ts', status: 'M' }],
        staged: [],
        hasRemote: true,
        ahead: 2,
        behind: 0,
      }));

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          getGitStatus: getGitStatusFn,
          getGitStatusEnhanced: getGitStatusEnhancedFn as any,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.status', { workspaceId: 'ws-1', repoPath: 'subdir/repo' });
      await localRouter.route(localConn, req);

      expect(getGitStatusEnhancedFn).toHaveBeenCalledTimes(1);
      expect(getGitStatusEnhancedFn.mock.calls[0][0]).toBe(
        resolve('/home/dev/project/subdir/repo'),
      );

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitStatusResponse>(resp);
      expect(payload.branch).toBe('feature');
      expect(payload.repoPath).toBe('subdir/repo');
    });

    it('rejects repoPath outside the workspace (path traversal)', async () => {
      const getGitStatusEnhancedFn = mock(async (_dirPath: string) => ({
        branch: 'develop',
        changes: [{ path: 'b.ts', status: 'A' }],
        staged: [],
        hasRemote: false,
        ahead: 0,
        behind: 0,
      }));

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          getGitStatus: getGitStatusFn,
          getGitStatusEnhanced: getGitStatusEnhancedFn as any,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.status', { workspaceId: 'ws-1', repoPath: '/tmp/external-repo' });
      await localRouter.route(localConn, req);

      // safePath rejects /tmp/external-repo because it's outside /home/dev/project
      expect(getGitStatusEnhancedFn).toHaveBeenCalledTimes(0);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
      expect((resp.error as Record<string, unknown>).message).toBe('Path traversal detected');
    });

    it('accepts absolute repoPath within the workspace', async () => {
      const getGitStatusEnhancedFn = mock(async (_dirPath: string) => ({
        branch: 'develop',
        changes: [{ path: 'b.ts', status: 'A' }],
        staged: [],
        hasRemote: false,
        ahead: 0,
        behind: 0,
      }));

      const getWsFn = makeGetWorkspaceMock({ id: 'ws-abs', name: 'Abs', cwd: '/home/dev/project' });

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWsFn,
          getGitStatus: getGitStatusFn,
          getGitStatusEnhanced: getGitStatusEnhancedFn as any,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.status', {
        workspaceId: 'ws-abs',
        repoPath: '/home/dev/project/subdir/repo',
      });
      await localRouter.route(localConn, req);

      // safePath allows /home/dev/project/subdir/repo because it's within /home/dev/project
      expect(getGitStatusEnhancedFn).toHaveBeenCalledTimes(1);
      expect(getGitStatusEnhancedFn.mock.calls[0][0]).toBe(
        resolve('/home/dev/project/subdir/repo'),
      );

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitStatusResponse>(resp);
      expect(payload.branch).toBe('develop');
    });
  });

  // -----------------------------------------------------------------------
  // git.log tests
  // -----------------------------------------------------------------------
  describe('git.log', () => {
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
      const payload = expectSuccessResponse<GitLogResponse>(resp, req.id);
      expect(payload.commits).toHaveLength(3);

      // Verify each commit's fields individually to ensure the handler
      // preserves data correctly rather than comparing to mock internals.
      const first = payload.commits[0];
      expect(first.id).toBe('aaa');
      expect(first.message).toBe('third commit');
      expect(first.author).toBe('Alice <alice@example.com>');
      expect(first.date).toBe(1700000003);
      expect(first.parents).toEqual(['bbb']);

      const second = payload.commits[1];
      expect(second.id).toBe('bbb');
      expect(second.message).toBe('second commit');
      expect(second.author).toBe('Bob <bob@example.com>');
      expect(second.date).toBe(1700000002);
      expect(second.parents).toEqual(['ccc']);

      const third = payload.commits[2];
      expect(third.id).toBe('ccc');
      expect(third.message).toBe('first commit');
      expect(third.author).toBe('Alice <alice@example.com>');
      expect(third.date).toBe(1700000001);
      expect(third.parents).toEqual([]);

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
      // The mock returns fakeCommits.slice(2, 3) → the third commit
      expect(payload.commits).toHaveLength(1);
      expect(payload.commits[0].id).toBe('ccc');
      expect(payload.commits[0].message).toBe('first commit');
      expect(payload.commits[0].author).toBe('Alice <alice@example.com>');
      expect(payload.commits[0].date).toBe(1700000001);
      expect(payload.commits[0].parents).toEqual([]);
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
      const payload = expectSuccessResponse<GitLogResponse>(resp);
      expect(payload.commits).toEqual([]);
      expect(payload.hasMore).toBe(false);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const req = request('git.log', { skip: 0, limit: 10 });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    // -----------------------------------------------------------------
    // Pagination boundary clamping tests
    // -----------------------------------------------------------------
    it('clamps limit=0 to 1', async () => {
      const req = request('git.log', { workspaceId: 'ws-1', skip: 0, limit: 0 });
      await router.route(conn, req);

      expect(getGitLogFn).toHaveBeenCalledTimes(1);
      // limit is clamped: Math.min(Math.max(0, 1), 100) = 1
      expect(getGitLogFn.mock.calls[0][2]).toBe(1);

      const resp = conn.sent[0] as Record<string, unknown>;
      expectSuccessResponse(resp);
    });

    it('clamps limit=1000 to 100', async () => {
      const req = request('git.log', { workspaceId: 'ws-1', skip: 0, limit: 1000 });
      await router.route(conn, req);

      expect(getGitLogFn).toHaveBeenCalledTimes(1);
      // limit is clamped: Math.min(Math.max(1000, 1), 100) = 100
      expect(getGitLogFn.mock.calls[0][2]).toBe(100);

      const resp = conn.sent[0] as Record<string, unknown>;
      expectSuccessResponse(resp);
    });

    it('clamps skip=-1 to 0', async () => {
      const req = request('git.log', { workspaceId: 'ws-1', skip: -1, limit: 10 });
      await router.route(conn, req);

      expect(getGitLogFn).toHaveBeenCalledTimes(1);
      // skip is clamped: Math.max(-1, 0) = 0
      expect(getGitLogFn.mock.calls[0][1]).toBe(0);
      // limit is unaffected: 10
      expect(getGitLogFn.mock.calls[0][2]).toBe(10);

      const resp = conn.sent[0] as Record<string, unknown>;
      expectSuccessResponse(resp);
    });
  });

  // -----------------------------------------------------------------------
  // git.repoDiscovery tests
  // -----------------------------------------------------------------------
  describe('git.repoDiscovery', () => {
    it('returns repos for valid workspace', async () => {
      const discoverReposFn = mock(
        async (
          _cwd: string,
          _maxDepth?: number,
          _onDepthComplete?: (repos: GitRepoInfo[], depth: number) => void,
        ): Promise<GitRepoInfo[]> => [
          { path: '.', name: 'project', branch: 'main', hasRemote: true, ahead: 0, behind: 0 },
          { path: 'libs/sub', name: 'sub', branch: 'dev', hasRemote: false, ahead: 1, behind: 2 },
        ],
      );

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          discoverRepos: discoverReposFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.repoDiscovery', { workspaceId: 'ws-1' });
      await localRouter.route(localConn, req);

      expect(discoverReposFn).toHaveBeenCalledTimes(1);
      expect(discoverReposFn.mock.calls[0][0]).toBe('/home/dev/project');

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<{ repos: GitRepoInfo[] }>(resp);
      expect(payload.repos).toHaveLength(2);
      expect(payload.repos[0].path).toBe('.');
      expect(payload.repos[1].name).toBe('sub');
    });

    it('returns INVALID_MESSAGE for missing workspaceId', async () => {
      const req = request('git.repoDiscovery', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.repoDiscovery', { workspaceId: 'nonexistent' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('emits progress events per depth during discovery', async () => {
      const repoA: GitRepoInfo = {
        path: '.',
        name: 'root',
        branch: 'main',
        hasRemote: true,
        ahead: 0,
        behind: 0,
      };
      const repoB: GitRepoInfo = {
        path: 'sub',
        name: 'sub',
        branch: 'dev',
        hasRemote: false,
        ahead: 1,
        behind: 2,
      };

      let _capturedOnDepth: ((repos: GitRepoInfo[], depth: number) => void) | undefined;
      const discoverReposFn = mock(
        async (
          _cwd: string,
          _maxDepth?: number,
          onDepthComplete?: (repos: GitRepoInfo[], depth: number) => void,
        ): Promise<GitRepoInfo[]> => {
          _capturedOnDepth = onDepthComplete;
          if (onDepthComplete) {
            onDepthComplete([repoA], 0);
            onDepthComplete([repoB], 1);
          }
          return [repoA, repoB];
        },
      );

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          discoverRepos: discoverReposFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.repoDiscovery', { workspaceId: 'ws-1' });
      await localRouter.route(localConn, req);

      // Expect 2 progress events followed by 1 response = 3 total
      expect(localConn.sent.length).toBe(3);

      // First event: depth 0
      const evt0 = localConn.sent[0] as Record<string, unknown>;
      expect(evt0.type).toBe('event');
      expect(evt0.channel).toBe('git.repoDiscovery.progress');
      const pl0 = evt0.payload as GitRepoDiscoveryProgressEvent;
      expect(pl0.depth).toBe(0);
      expect(pl0.done).toBe(false);
      expect(pl0.repos).toEqual([repoA]);

      // Second event: depth 1
      const evt1 = localConn.sent[1] as Record<string, unknown>;
      expect(evt1.type).toBe('event');
      expect(evt1.channel).toBe('git.repoDiscovery.progress');
      const pl1 = evt1.payload as GitRepoDiscoveryProgressEvent;
      expect(pl1.depth).toBe(1);
      expect(pl1.done).toBe(false);
      expect(pl1.repos).toEqual([repoB]);

      // Final response
      const resp = localConn.sent[2] as Record<string, unknown>;
      const respPayload = expectSuccessResponse<{ repos: GitRepoInfo[] }>(resp);
      expect(respPayload.repos).toEqual([repoA, repoB]);
    });

    it('does not emit progress events when onDepthComplete is not invoked', async () => {
      const discoverReposFn = mock(
        async (
          _cwd: string,
          _maxDepth?: number,
          _onDepthComplete?: (repos: GitRepoInfo[], depth: number) => void,
        ): Promise<GitRepoInfo[]> => [
          { path: '.', name: 'root', branch: 'main', hasRemote: true, ahead: 0, behind: 0 },
        ],
      );

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          discoverRepos: discoverReposFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.repoDiscovery', { workspaceId: 'ws-1' });
      await localRouter.route(localConn, req);

      // Only the final response should be sent — no progress events
      expect(localConn.sent.length).toBe(1);
      const resp = localConn.sent[0] as Record<string, unknown>;
      expectSuccessResponse(resp);
    });

    it('includes correct workspaceId in progress events', async () => {
      const discoverReposFn = mock(
        async (
          _cwd: string,
          _maxDepth?: number,
          onDepthComplete?: (repos: GitRepoInfo[], depth: number) => void,
        ): Promise<GitRepoInfo[]> => {
          if (onDepthComplete) {
            onDepthComplete(
              [{ path: '.', name: 'root', branch: 'main', hasRemote: true, ahead: 0, behind: 0 }],
              0,
            );
          }
          return [
            { path: '.', name: 'root', branch: 'main', hasRemote: true, ahead: 0, behind: 0 },
          ];
        },
      );

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          discoverRepos: discoverReposFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.repoDiscovery', { workspaceId: 'ws-1' });
      await localRouter.route(localConn, req);

      // First message should be a progress event with correct workspaceId
      const evt = localConn.sent[0] as Record<string, unknown>;
      expect(evt.type).toBe('event');
      const pl = evt.payload as GitRepoDiscoveryProgressEvent;
      expect(pl.workspaceId).toBe('ws-1');

      // Second message is the final response
      const resp = localConn.sent[1] as Record<string, unknown>;
      expectSuccessResponse(resp);
    });
  });

  // -----------------------------------------------------------------------
  // git.branches tests
  // -----------------------------------------------------------------------
  describe('git.branches', () => {
    it('returns branches array', async () => {
      const fakeBranches: GitBranch[] = [
        { name: 'main', isCurrent: true, isRemote: false },
        { name: 'dev', isCurrent: false, isRemote: false },
        { name: 'origin/main', isCurrent: false, isRemote: true },
      ];
      const listBranchesFn = mock(async (_dirPath: string) => ({
        branches: fakeBranches,
        current: 'main',
      }));

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, listBranches: listBranchesFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.branches', { workspaceId: 'ws-1', repoPath: '.' });
      await localRouter.route(localConn, req);

      expect(listBranchesFn).toHaveBeenCalledTimes(1);
      expect(listBranchesFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<{ branches: GitBranch[]; current: string | null }>(
        resp,
      );
      expect(payload.branches).toEqual(fakeBranches);
      expect(payload.current).toBe('main');
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.branches', { workspaceId: 'nonexistent', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });
});
