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
  type GitWorktreeInfo,
  type GitWorktreeListResponse,
  type GitWorktreeCreateResponse,
  type GitWorktreeMergeResponse,
  type GitWorktreeCopyFilesResponse,
  type GitDiffDataResponse,
  type GitCommitDetailsResponse,
  type GitCommitDiffResponse,
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
// Tests — status / log / repoDiscovery / worktrees / diff / commit details
// ---------------------------------------------------------------------------

describe('registerGitHandlers – git other', () => {
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
  // 2. Returns GitStatusResponse { branch, changes, staged }
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

    // -----------------------------------------------------------------
    // 3. Non-git workspace returns { branch: null, changes: [], staged: [] }
    // -----------------------------------------------------------------
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
  // git.worktreeList tests
  // -----------------------------------------------------------------------
  describe('git.worktreeList', () => {
    it('returns worktrees for a valid workspace', async () => {
      const fakeWorktrees: GitWorktreeInfo[] = [
        { path: '/home/dev/project', branch: 'main', isMain: true, isDetached: false },
        {
          path: '/home/dev/project-ht-feature',
          branch: 'feature',
          isMain: false,
          isDetached: false,
        },
      ];
      const listWorktreesFn = mock(async (_dirPath: string) => fakeWorktrees);

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, listWorktrees: listWorktreesFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeList', { workspaceId: 'ws-1' });
      await localRouter.route(localConn, req);

      expect(listWorktreesFn).toHaveBeenCalledTimes(1);
      expect(listWorktreesFn.mock.calls[0][0]).toBe('/home/dev/project');

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitWorktreeListResponse>(resp);
      expect(payload.worktrees).toEqual(fakeWorktrees);
    });

    it('returns empty array when no worktrees exist', async () => {
      const listWorktreesFn = mock(async (_dirPath: string) => []);

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, listWorktrees: listWorktreesFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeList', { workspaceId: 'ws-1' });
      await localRouter.route(localConn, req);

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitWorktreeListResponse>(resp);
      expect(payload.worktrees).toEqual([]);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.worktreeList', { workspaceId: 'nonexistent' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const req = request('git.worktreeList', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // git.worktreeCreate tests
  // -----------------------------------------------------------------------
  describe('git.worktreeCreate', () => {
    it('creates a worktree with a valid branch name', async () => {
      const createdWorktree: GitWorktreeInfo = {
        path: '/home/dev/project-ht-feature',
        branch: 'feature',
        isMain: false,
        isDetached: false,
      };
      const createWorktreeFn = mock(
        async (_dirPath: string, _branchName: string, _startRef?: string) => createdWorktree,
      );
      const copyFileFn = mock(async (_src: string, _dest: string) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          createWorktree: createWorktreeFn,
          copyFile: copyFileFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeCreate', {
        workspaceId: 'ws-1',
        branchName: 'feature',
      });
      await localRouter.route(localConn, req);

      expect(createWorktreeFn).toHaveBeenCalledTimes(1);
      expect(createWorktreeFn.mock.calls[0][0]).toBe('/home/dev/project');
      expect(createWorktreeFn.mock.calls[0][1]).toBe('feature');

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitWorktreeCreateResponse>(resp);
      expect(payload.worktree).toEqual(createdWorktree);
    });

    it('returns INVALID_MESSAGE when branchName is missing', async () => {
      const req = request('git.worktreeCreate', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when branchName contains invalid characters', async () => {
      const req = request('git.worktreeCreate', {
        workspaceId: 'ws-1',
        branchName: 'bad;branch',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.worktreeCreate', {
        workspaceId: 'nonexistent',
        branchName: 'feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('copies filesToCopy into the new worktree', async () => {
      const createdWorktree: GitWorktreeInfo = {
        path: '/home/dev/project-ht-feat',
        branch: 'feat',
        isMain: false,
        isDetached: false,
      };
      const createWorktreeFn = mock(
        async (_dirPath: string, _branchName: string, _startRef?: string) => createdWorktree,
      );
      const copyFileFn = mock(async (_src: string, _dest: string) => {});
      const writeConfigFn = mock(async (_dir: string, _files: string[]) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          createWorktree: createWorktreeFn,
          copyFile: copyFileFn,
          writeWorktreeCopyConfig: writeConfigFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeCreate', {
        workspaceId: 'ws-1',
        branchName: 'feat',
        filesToCopy: ['.env', 'config.json'],
      });
      await localRouter.route(localConn, req);

      // copyFile should have been called at least for the listed files + .worktreecopy
      expect(copyFileFn.mock.calls.length).toBeGreaterThanOrEqual(2);

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitWorktreeCreateResponse>(resp);
      expect(payload.worktree).toEqual(createdWorktree);
    });

    it('returns INTERNAL_ERROR when createWorktree throws', async () => {
      const createWorktreeFn = mock(async () => {
        throw new Error('worktree already exists');
      });
      const copyFileFn = mock(async (_src: string, _dest: string) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          createWorktree: createWorktreeFn,
          copyFile: copyFileFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeCreate', {
        workspaceId: 'ws-1',
        branchName: 'feature',
      });
      await localRouter.route(localConn, req);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INTERNAL_ERROR);
    });
  });

  // -----------------------------------------------------------------------
  // git.worktreeRemove tests
  // -----------------------------------------------------------------------
  describe('git.worktreeRemove', () => {
    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const req = request('git.worktreeRemove', { worktreePath: '../project-ht-feat' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when worktreePath is missing', async () => {
      const req = request('git.worktreeRemove', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.worktreeRemove', {
        workspaceId: 'nonexistent',
        worktreePath: '../project-ht-feat',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('removes a worktree successfully', async () => {
      const removeWorktreeFn = mock(
        async (_dirPath: string, _worktreePath: string, _force?: boolean) => {},
      );

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, removeWorktree: removeWorktreeFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeRemove', {
        workspaceId: 'ws-1',
        worktreePath: '.worktrees/feat',
        force: true,
      });
      await localRouter.route(localConn, req);

      expect(removeWorktreeFn).toHaveBeenCalledTimes(1);
      expect(removeWorktreeFn.mock.calls[0][0]).toBe('/home/dev/project');
      expect(removeWorktreeFn.mock.calls[0][1]).toMatch(/\.worktrees[\\/]feat$/);
      expect(removeWorktreeFn.mock.calls[0][2]).toBe(true);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expectSuccessResponse(resp);
    });

    it('returns INTERNAL_ERROR when removeWorktree throws', async () => {
      const removeWorktreeFn = mock(async () => {
        throw new Error('worktree has uncommitted changes');
      });

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, removeWorktree: removeWorktreeFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeRemove', {
        workspaceId: 'ws-1',
        worktreePath: '.worktrees/feat',
      });
      await localRouter.route(localConn, req);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INTERNAL_ERROR);
    });
  });

  // -----------------------------------------------------------------------
  // git.worktreeMerge tests
  // -----------------------------------------------------------------------
  describe('git.worktreeMerge', () => {
    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const req = request('git.worktreeMerge', { worktreePath: '../project-ht-feat' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when worktreePath is missing', async () => {
      const req = request('git.worktreeMerge', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when worktreePath is empty string', async () => {
      const req = request('git.worktreeMerge', {
        workspaceId: 'ws-1',
        worktreePath: '',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.worktreeMerge', {
        workspaceId: 'nonexistent',
        worktreePath: '../project-ht-feat',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('merges a worktree successfully', async () => {
      const mergeWorktreeFn = mock(
        async (
          _dirPath: string,
          _worktreePath: string,
          _options?: { targetBranch?: string; deleteAfterMerge?: boolean },
        ) => ({ success: true, message: 'Merged successfully', worktreeRemoved: true }),
      );
      const copyFileFn = mock(async (_src: string, _dest: string) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          mergeWorktree: mergeWorktreeFn,
          copyFile: copyFileFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeMerge', {
        workspaceId: 'ws-1',
        worktreePath: '.worktrees/feat',
        targetBranch: 'main',
        deleteAfterMerge: true,
      });
      await localRouter.route(localConn, req);

      expect(mergeWorktreeFn).toHaveBeenCalledTimes(1);
      expect(mergeWorktreeFn.mock.calls[0][0]).toBe('/home/dev/project');
      expect(mergeWorktreeFn.mock.calls[0][1]).toMatch(/\.worktrees[\\/]feat$/);

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitWorktreeMergeResponse>(resp);
      expect(payload.success).toBe(true);
      expect(payload.message).toBe('Merged successfully');
      expect(payload.worktreeRemoved).toBe(true);
    });

    it('copies filesToCopy before merging', async () => {
      const mergeWorktreeFn = mock(async () => ({
        success: true,
        message: 'ok',
        worktreeRemoved: false,
      }));
      const copyFileFn = mock(async (_src: string, _dest: string) => {});
      const writeConfigFn = mock(async (_dir: string, _files: string[]) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          mergeWorktree: mergeWorktreeFn,
          copyFile: copyFileFn,
          writeWorktreeCopyConfig: writeConfigFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeMerge', {
        workspaceId: 'ws-1',
        worktreePath: '.worktrees/feat',
        filesToCopy: ['config.json'],
      });
      await localRouter.route(localConn, req);

      // copyFile should have been called for the listed file
      expect(copyFileFn.mock.calls.length).toBeGreaterThanOrEqual(1);

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitWorktreeMergeResponse>(resp);
      expect(payload.success).toBe(true);
    });

    it('returns INTERNAL_ERROR when mergeWorktree throws', async () => {
      const mergeWorktreeFn = mock(async () => {
        throw new Error('merge conflict');
      });
      const copyFileFn = mock(async (_src: string, _dest: string) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          mergeWorktree: mergeWorktreeFn,
          copyFile: copyFileFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeMerge', {
        workspaceId: 'ws-1',
        worktreePath: '.worktrees/feat',
      });
      await localRouter.route(localConn, req);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INTERNAL_ERROR);
    });
  });

  // -----------------------------------------------------------------------
  // git.worktreeCopyFiles tests
  // -----------------------------------------------------------------------
  describe('git.worktreeCopyFiles', () => {
    it('returns untracked and configured files for a valid workspace', async () => {
      const listUntrackedFn = mock(async (_dirPath: string) => ['src/new-file.ts', '.env']);
      const readConfigFn = mock(async (_dirPath: string) => ['.env', 'config.json']);

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          listUntrackedFiles: listUntrackedFn,
          readWorktreeCopyConfig: readConfigFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.worktreeCopyFiles', { workspaceId: 'ws-1' });
      await localRouter.route(localConn, req);

      expect(listUntrackedFn).toHaveBeenCalledTimes(1);
      expect(readConfigFn).toHaveBeenCalledTimes(1);

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitWorktreeCopyFilesResponse>(resp);
      expect(payload.untrackedFiles).toEqual(['src/new-file.ts', '.env']);
      expect(payload.configuredFiles).toEqual(['.env', 'config.json']);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const req = request('git.worktreeCopyFiles', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.worktreeCopyFiles', { workspaceId: 'nonexistent' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // git.diffData tests
  // -----------------------------------------------------------------------
  describe('git.diffData', () => {
    it('returns diff for a staged file', async () => {
      const getDiffDataFn = mock(async (_repoDir: string, _filePath: string, _staged: boolean) => ({
        originalContent: 'old line\n',
        modifiedContent: 'new line\n',
        additions: 1,
        deletions: 1,
      }));

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, getDiffData: getDiffDataFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.diffData', {
        workspaceId: 'ws-1',
        repoPath: '.',
        filePath: 'src/foo.ts',
        staged: true,
      });
      await localRouter.route(localConn, req);

      expect(getDiffDataFn).toHaveBeenCalledTimes(1);
      expect(getDiffDataFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(getDiffDataFn.mock.calls[0][1]).toBe('src/foo.ts');
      expect(getDiffDataFn.mock.calls[0][2]).toBe(true);

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitDiffDataResponse>(resp);
      expect(payload.originalContent).toBe('old line\n');
      expect(payload.modifiedContent).toBe('new line\n');
      expect(payload.additions).toBe(1);
      expect(payload.deletions).toBe(1);
      expect(payload.filePath).toBe('src/foo.ts');
    });

    it('returns INVALID_MESSAGE when required fields are missing', async () => {
      const req1 = request('git.diffData', {
        workspaceId: 'ws-1',
        repoPath: '.',
        filePath: 'src/foo.ts',
        // missing staged
      });
      await router.route(conn, req1);
      const resp1 = conn.sent[0] as Record<string, unknown>;
      expect((resp1.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);

      conn.sent.length = 0;

      const req2 = request('git.diffData', {
        workspaceId: 'ws-1',
        repoPath: '.',
        // missing filePath
        staged: false,
      });
      await router.route(conn, req2);
      const resp2 = conn.sent[0] as Record<string, unknown>;
      expect((resp2.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.diffData', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        filePath: 'src/foo.ts',
        staged: false,
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE for file path with traversal', async () => {
      const req = request('git.diffData', {
        workspaceId: 'ws-1',
        repoPath: '.',
        filePath: '../etc/passwd',
        staged: false,
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // git.commitDetails tests
  // -----------------------------------------------------------------------
  describe('git.commitDetails', () => {
    it('returns commit details for a valid SHA', async () => {
      const getCommitDetailsFn = mock(async (_dirPath: string, _sha: string) => ({
        body: 'feat: add new feature\n\nDetailed description here.',
        files: [
          { filePath: 'src/feature.ts', status: 'A', additions: 10, deletions: 0 },
          { filePath: 'src/index.ts', status: 'M', additions: 2, deletions: 1 },
        ],
      }));

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, getCommitDetails: getCommitDetailsFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.commitDetails', {
        workspaceId: 'ws-1',
        commitSha: 'abc123def456',
      });
      await localRouter.route(localConn, req);

      expect(getCommitDetailsFn).toHaveBeenCalledTimes(1);
      expect(getCommitDetailsFn.mock.calls[0][1]).toBe('abc123def456');

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitCommitDetailsResponse>(resp);
      expect(payload.commitSha).toBe('abc123def456');
      expect(payload.body).toContain('add new feature');
      expect(payload.files).toHaveLength(2);
      expect(payload.files[0].filePath).toBe('src/feature.ts');
    });

    it('returns INVALID_MESSAGE for invalid SHA format', async () => {
      const req = request('git.commitDetails', {
        workspaceId: 'ws-1',
        commitSha: 'not-a-sha!',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.commitDetails', {
        workspaceId: 'nonexistent',
        commitSha: 'abc123def456',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE when commitSha is missing', async () => {
      const req = request('git.commitDetails', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns error when commit is not found', async () => {
      const getCommitDetailsFn = mock(async () => null);

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, getCommitDetails: getCommitDetailsFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.commitDetails', {
        workspaceId: 'ws-1',
        commitSha: 'deadbeef',
      });
      await localRouter.route(localConn, req);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // git.commitDiff tests
  // -----------------------------------------------------------------------
  describe('git.commitDiff', () => {
    it('returns diff for a valid commit and parent SHA', async () => {
      const getCommitFileDiffFn = mock(
        async (_repoDir: string, _commitSha: string, _parentSha: string, _filePath: string) => ({
          originalContent: 'old\n',
          modifiedContent: 'new\n',
          additions: 1,
          deletions: 1,
        }),
      );

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, getCommitFileDiff: getCommitFileDiffFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.commitDiff', {
        workspaceId: 'ws-1',
        repoPath: '.',
        commitSha: 'abc123def456',
        parentSha: 'def456aaa111',
        filePath: 'src/foo.ts',
      });
      await localRouter.route(localConn, req);

      expect(getCommitFileDiffFn).toHaveBeenCalledTimes(1);
      expect(getCommitFileDiffFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(getCommitFileDiffFn.mock.calls[0][1]).toBe('abc123def456');
      expect(getCommitFileDiffFn.mock.calls[0][2]).toBe('def456aaa111');
      expect(getCommitFileDiffFn.mock.calls[0][3]).toBe('src/foo.ts');

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitCommitDiffResponse>(resp);
      expect(payload.originalContent).toBe('old\n');
      expect(payload.modifiedContent).toBe('new\n');
      expect(payload.additions).toBe(1);
      expect(payload.deletions).toBe(1);
      expect(payload.filePath).toBe('src/foo.ts');
    });

    it('returns INVALID_MESSAGE when required fields are missing', async () => {
      const req = request('git.commitDiff', {
        workspaceId: 'ws-1',
        repoPath: '.',
        commitSha: 'abc123def456',
        // missing parentSha and filePath
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for invalid commitSha format', async () => {
      const req = request('git.commitDiff', {
        workspaceId: 'ws-1',
        repoPath: '.',
        commitSha: 'bad!sha',
        parentSha: 'abc123',
        filePath: 'src/foo.ts',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for invalid parentSha format', async () => {
      const req = request('git.commitDiff', {
        workspaceId: 'ws-1',
        repoPath: '.',
        commitSha: 'abc123def456',
        parentSha: 'bad!parent',
        filePath: 'src/foo.ts',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('accepts empty string parentSha for root commits', async () => {
      const getCommitFileDiffFn = mock(async () => ({
        originalContent: '',
        modifiedContent: 'first\n',
        additions: 1,
        deletions: 0,
      }));

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, getCommitFileDiff: getCommitFileDiffFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.commitDiff', {
        workspaceId: 'ws-1',
        repoPath: '.',
        commitSha: 'abc123def456',
        parentSha: '',
        filePath: 'README.md',
      });
      await localRouter.route(localConn, req);

      const resp = localConn.sent[0] as Record<string, unknown>;
      const payload = expectSuccessResponse<GitCommitDiffResponse>(resp);
      expect(payload.filePath).toBe('README.md');
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.commitDiff', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        commitSha: 'abc123def456',
        parentSha: 'def456aaa111',
        filePath: 'src/foo.ts',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });
});
