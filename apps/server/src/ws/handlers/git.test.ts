/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  ErrorCodes,
  type GitStatusResponse,
  type GitLogResponse,
  type GitLogItem,
  type GitRepoInfo,
  type GitBranch,
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
        return {
          id: 'ws-1',
          name: 'Test',
          cwd: '/home/dev/project',
          color: '#007acc',
          sort_order: 0,
        };
      }
      if (id === 'ws-nongit') {
        return {
          id: 'ws-nongit',
          name: 'No Git',
          cwd: '/tmp/plain',
          color: '#007acc',
          sort_order: 0,
        };
      }
      return null;
    });

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
          getGitStatusEnhanced: getGitStatusEnhancedFn,
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
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as GitStatusResponse;
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
          getGitStatusEnhanced: getGitStatusEnhancedFn,
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

      const getWsFn = mock((_db: unknown, id: string) => {
        if (id === 'ws-abs') {
          return {
            id: 'ws-abs',
            name: 'Abs',
            cwd: '/home/dev/project',
            color: '#007acc',
            sort_order: 0,
          };
        }
        return null;
      });

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWsFn,
          getGitStatus: getGitStatusFn,
          getGitStatusEnhanced: getGitStatusEnhancedFn,
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
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as GitStatusResponse;
      expect(payload.branch).toBe('develop');
    });
  });

  // -----------------------------------------------------------------------
  // git.log tests
  // -----------------------------------------------------------------------
  describe('git.log', () => {
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

  // -----------------------------------------------------------------------
  // git.repoDiscovery tests
  // -----------------------------------------------------------------------
  describe('git.repoDiscovery', () => {
    it('returns repos for valid workspace', async () => {
      const discoverReposFn = mock(
        async (_cwd: string): Promise<GitRepoInfo[]> => [
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
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { repos: GitRepoInfo[] };
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
  });

  // -----------------------------------------------------------------------
  // git.stage tests
  // -----------------------------------------------------------------------
  describe('git.stage', () => {
    it('calls stageFiles with correct absolute path', async () => {
      const stageFilesFn = mock(async (_dirPath: string, _files: string[]) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, stageFiles: stageFilesFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.stage', {
        workspaceId: 'ws-1',
        repoPath: 'packages/app',
        files: ['src/a.ts', 'src/b.ts'],
      });
      await localRouter.route(localConn, req);

      expect(stageFilesFn).toHaveBeenCalledTimes(1);
      expect(stageFilesFn.mock.calls[0][0]).toBe(resolve('/home/dev/project/packages/app'));
      expect(stageFilesFn.mock.calls[0][1]).toEqual(['src/a.ts', 'src/b.ts']);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('returns INVALID_MESSAGE for missing files or empty files array', async () => {
      const req1 = request('git.stage', {
        workspaceId: 'ws-1',
        repoPath: 'packages/app',
        files: [],
      });
      await router.route(conn, req1);
      const resp1 = conn.sent[0] as Record<string, unknown>;
      expect((resp1.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);

      conn.sent.length = 0;

      const req2 = request('git.stage', { workspaceId: 'ws-1', repoPath: 'packages/app' });
      await router.route(conn, req2);
      const resp2 = conn.sent[0] as Record<string, unknown>;
      expect((resp2.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.stage', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        files: ['a.ts'],
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // git.unstage tests
  // -----------------------------------------------------------------------
  describe('git.unstage', () => {
    it('calls unstageFiles with correct absolute path', async () => {
      const unstageFilesFn = mock(async (_dirPath: string, _files: string[]) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, unstageFiles: unstageFilesFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.unstage', {
        workspaceId: 'ws-1',
        repoPath: 'packages/app',
        files: ['src/a.ts'],
      });
      await localRouter.route(localConn, req);

      expect(unstageFilesFn).toHaveBeenCalledTimes(1);
      expect(unstageFilesFn.mock.calls[0][0]).toBe(resolve('/home/dev/project/packages/app'));
      expect(unstageFilesFn.mock.calls[0][1]).toEqual(['src/a.ts']);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('returns INVALID_MESSAGE for missing files or empty files array', async () => {
      const req1 = request('git.unstage', { workspaceId: 'ws-1', repoPath: '.', files: [] });
      await router.route(conn, req1);
      const resp1 = conn.sent[0] as Record<string, unknown>;
      expect((resp1.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);

      conn.sent.length = 0;

      const req2 = request('git.unstage', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req2);
      const resp2 = conn.sent[0] as Record<string, unknown>;
      expect((resp2.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.unstage', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        files: ['a.ts'],
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // git.discard tests
  // -----------------------------------------------------------------------
  describe('git.discard', () => {
    it('calls discardChanges with correct absolute path', async () => {
      const discardChangesFn = mock(async (_dirPath: string, _files: string[]) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, discardChanges: discardChangesFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.discard', {
        workspaceId: 'ws-1',
        repoPath: 'packages/app',
        files: ['src/a.ts'],
      });
      await localRouter.route(localConn, req);

      expect(discardChangesFn).toHaveBeenCalledTimes(1);
      expect(discardChangesFn.mock.calls[0][0]).toBe(resolve('/home/dev/project/packages/app'));
      expect(discardChangesFn.mock.calls[0][1]).toEqual(['src/a.ts']);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('returns INVALID_MESSAGE for missing files or empty files array', async () => {
      const req1 = request('git.discard', { workspaceId: 'ws-1', repoPath: '.', files: [] });
      await router.route(conn, req1);
      const resp1 = conn.sent[0] as Record<string, unknown>;
      expect((resp1.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);

      conn.sent.length = 0;

      const req2 = request('git.discard', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req2);
      const resp2 = conn.sent[0] as Record<string, unknown>;
      expect((resp2.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.discard', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        files: ['a.ts'],
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // git.commit tests
  // -----------------------------------------------------------------------
  describe('git.commit', () => {
    it('returns commitHash on success', async () => {
      const commitChangesFn = mock(async (_dirPath: string, _msg: string) => 'abc123def');

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, commitChanges: commitChangesFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.commit', {
        workspaceId: 'ws-1',
        repoPath: '.',
        message: 'fix: correct typo',
      });
      await localRouter.route(localConn, req);

      expect(commitChangesFn).toHaveBeenCalledTimes(1);
      expect(commitChangesFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(commitChangesFn.mock.calls[0][1]).toBe('fix: correct typo');

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { commitHash: string };
      expect(payload.commitHash).toBe('abc123def');
    });

    it('returns INVALID_MESSAGE for empty message', async () => {
      const req = request('git.commit', {
        workspaceId: 'ws-1',
        repoPath: '.',
        message: '   ',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.commit', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        message: 'some message',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
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
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { branches: GitBranch[]; current: string | null };
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

  // -----------------------------------------------------------------------
  // git.checkout tests
  // -----------------------------------------------------------------------
  describe('git.checkout', () => {
    it('calls checkoutBranch when createNew is not set', async () => {
      const checkoutBranchFn = mock(async (_dirPath: string, _name: string) => {});
      const createBranchFn = mock(async (_dirPath: string, _name: string) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          checkoutBranch: checkoutBranchFn,
          createBranch: createBranchFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'dev',
      });
      await localRouter.route(localConn, req);

      expect(checkoutBranchFn).toHaveBeenCalledTimes(1);
      expect(checkoutBranchFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(checkoutBranchFn.mock.calls[0][1]).toBe('dev');
      expect(createBranchFn).toHaveBeenCalledTimes(0);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('calls createBranch when createNew is true', async () => {
      const checkoutBranchFn = mock(async (_dirPath: string, _name: string) => {});
      const createBranchFn = mock(async (_dirPath: string, _name: string) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: {
          getWorkspace: getWorkspaceFn,
          checkoutBranch: checkoutBranchFn,
          createBranch: createBranchFn,
        },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'feature-x',
        createNew: true,
      });
      await localRouter.route(localConn, req);

      expect(createBranchFn).toHaveBeenCalledTimes(1);
      expect(createBranchFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(createBranchFn.mock.calls[0][1]).toBe('feature-x');
      expect(checkoutBranchFn).toHaveBeenCalledTimes(0);

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.checkout', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        branch: 'dev',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // git.push tests
  // -----------------------------------------------------------------------
  describe('git.push', () => {
    it('calls pushBranch with correct args', async () => {
      const pushBranchFn = mock(async (_dirPath: string, _branch: string) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, pushBranch: pushBranchFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.push', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'main',
      });
      await localRouter.route(localConn, req);

      expect(pushBranchFn).toHaveBeenCalledTimes(1);
      expect(pushBranchFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(pushBranchFn.mock.calls[0][1]).toBe('main');

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.push', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        branch: 'main',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // git.fetch tests
  // -----------------------------------------------------------------------
  describe('git.fetch', () => {
    it('calls fetchRemote with correct args', async () => {
      const fetchRemoteFn = mock(async (_dirPath: string) => {});

      const localRouter = new MessageRouter();
      const localConn = mockConn();
      const localDeps: GitDeps = {
        persistentDb: {} as any,
        _mocks: { getWorkspace: getWorkspaceFn, fetchRemote: fetchRemoteFn },
      };
      registerGitHandlers(localRouter, localDeps);

      const req = request('git.fetch', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await localRouter.route(localConn, req);

      expect(fetchRemoteFn).toHaveBeenCalledTimes(1);
      expect(fetchRemoteFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));

      const resp = localConn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('git.fetch', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });
});
