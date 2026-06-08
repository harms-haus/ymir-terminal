/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { ErrorCodes, type GitBranch } from '@ymir/shared';
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
// Tests — branches / checkout / push / fetch
// ---------------------------------------------------------------------------

describe('registerGitHandlers – git branches', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let getWorkspaceFn: ReturnType<typeof mock>;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();

    getWorkspaceFn = makeGetWorkspaceMock(
      { id: 'ws-1', cwd: '/home/dev/project' },
      { id: 'ws-nongit', name: 'No Git', cwd: '/tmp/plain' },
    );

    const deps: GitDeps = {
      persistentDb: {} as any,
      _mocks: {
        getWorkspace: getWorkspaceFn,
      },
    };

    registerGitHandlers(router, deps);
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
      expectSuccessResponse(resp);
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
      expectSuccessResponse(resp);
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
      expectSuccessResponse(resp);
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
      expectSuccessResponse(resp);
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
