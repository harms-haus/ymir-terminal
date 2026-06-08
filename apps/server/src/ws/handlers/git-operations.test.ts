/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { ErrorCodes } from '@ymir/shared';
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
// Tests — stage / unstage / discard / commit
// ---------------------------------------------------------------------------

describe('registerGitHandlers – git operations', () => {
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
      expectSuccessResponse(resp);
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
      expectSuccessResponse(resp);
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
      expectSuccessResponse(resp);
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
      const payload = expectSuccessResponse<{ commitHash: string }>(resp);
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
});
