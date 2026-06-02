/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { ErrorCodes } from '@ymir/shared';
import { mockConn, request } from '../../../test-helpers/mock-utils';
import { MessageRouter } from '../../router';
import { registerGitHandlers } from './index';
import type { GitDeps } from './index';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function createTestDeps(overrides: Record<string, any> = {}): GitDeps {
  const getWorkspaceFn = mock((_db: unknown, id: string) => {
    if (id === 'ws-1') {
      return {
        id: 'ws-1',
        name: 'Test',
        cwd: '/home/dev/project',
        color: '#007acc',
        sort_order: 0,
      };
    }
    return null;
  });

  return {
    persistentDb: {} as any,
    _mocks: {
      getWorkspace: getWorkspaceFn,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('git merge / rebase / pull / sync handlers', () => {
  let conn: ReturnType<typeof mockConn>;

  beforeEach(() => {
    conn = mockConn();
  });

  // -----------------------------------------------------------------------
  // git.merge
  // -----------------------------------------------------------------------
  describe('git.merge', () => {
    it('calls doMergeBranch and returns result on success', async () => {
      const mergeBranchFn = mock(async (_dirPath: string, _branch: string) => 'Fast-forward');

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ mergeBranch: mergeBranchFn }));

      const req = request('git.merge', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'feature',
      });
      await router.route(conn, req);

      expect(mergeBranchFn).toHaveBeenCalledTimes(1);
      expect(mergeBranchFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(mergeBranchFn.mock.calls[0][1]).toBe('feature');

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { result: string };
      expect(payload.result).toBe('Fast-forward');
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.merge', { repoPath: '.', branch: 'feature' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when branch is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.merge', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when repoPath is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.merge', { workspaceId: 'ws-1', branch: 'feature' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.merge', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        branch: 'feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.WORKSPACE_NOT_FOUND,
      );
    });

    it('resolves repoPath relative to workspace cwd', async () => {
      const mergeBranchFn = mock(async () => 'merged');

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ mergeBranch: mergeBranchFn }));

      const req = request('git.merge', {
        workspaceId: 'ws-1',
        repoPath: 'packages/app',
        branch: 'dev',
      });
      await router.route(conn, req);

      expect(mergeBranchFn.mock.calls[0][0]).toBe(
        resolve('/home/dev/project/packages/app'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // git.rebase
  // -----------------------------------------------------------------------
  describe('git.rebase', () => {
    it('calls doRebaseBranch and returns result on success', async () => {
      const rebaseBranchFn = mock(async (_dirPath: string, _branch: string) =>
        'Successfully rebased',
      );

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ rebaseBranch: rebaseBranchFn }));

      const req = request('git.rebase', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'main',
      });
      await router.route(conn, req);

      expect(rebaseBranchFn).toHaveBeenCalledTimes(1);
      expect(rebaseBranchFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(rebaseBranchFn.mock.calls[0][1]).toBe('main');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { result: string };
      expect(payload.result).toBe('Successfully rebased');
    });

    it('returns INVALID_MESSAGE when branch is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.rebase', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.rebase', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        branch: 'main',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.WORKSPACE_NOT_FOUND,
      );
    });
  });

  // -----------------------------------------------------------------------
  // git.rebaseAbort
  // -----------------------------------------------------------------------
  describe('git.rebaseAbort', () => {
    it('calls doRebaseAbort and returns success', async () => {
      const rebaseAbortFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ rebaseAbort: rebaseAbortFn }));

      const req = request('git.rebaseAbort', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(rebaseAbortFn).toHaveBeenCalledTimes(1);
      expect(rebaseAbortFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.rebaseAbort', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.rebaseAbort', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.WORKSPACE_NOT_FOUND,
      );
    });
  });

  // -----------------------------------------------------------------------
  // git.rebaseStatus
  // -----------------------------------------------------------------------
  describe('git.rebaseStatus', () => {
    it('returns inProgress=true when rebase is in progress', async () => {
      const isRebaseInProgressFn = mock(async () => true);

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ isRebaseInProgress: isRebaseInProgressFn }));

      const req = request('git.rebaseStatus', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(isRebaseInProgressFn).toHaveBeenCalledTimes(1);
      expect(isRebaseInProgressFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { inProgress: boolean };
      expect(payload.inProgress).toBe(true);
    });

    it('returns inProgress=false when no rebase is in progress', async () => {
      const isRebaseInProgressFn = mock(async () => false);

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ isRebaseInProgress: isRebaseInProgressFn }));

      const req = request('git.rebaseStatus', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { inProgress: boolean };
      expect(payload.inProgress).toBe(false);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.rebaseStatus', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.rebaseStatus', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.WORKSPACE_NOT_FOUND,
      );
    });
  });

  // -----------------------------------------------------------------------
  // git.pull
  // -----------------------------------------------------------------------
  describe('git.pull', () => {
    it('calls doPullRemote with correct args', async () => {
      const pullRemoteFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ pullRemote: pullRemoteFn }));

      const req = request('git.pull', {
        workspaceId: 'ws-1',
        repoPath: '.',
        rebase: true,
      });
      await router.route(conn, req);

      expect(pullRemoteFn).toHaveBeenCalledTimes(1);
      expect(pullRemoteFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(pullRemoteFn.mock.calls[0][1]).toBe(true);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('calls doPullRemote with rebase=false when not specified', async () => {
      const pullRemoteFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ pullRemote: pullRemoteFn }));

      const req = request('git.pull', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(pullRemoteFn.mock.calls[0][1]).toBeUndefined();

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.error).toBeUndefined();
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.pull', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.pull', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.WORKSPACE_NOT_FOUND,
      );
    });

    it('rejects path traversal in repoPath', async () => {
      const pullRemoteFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ pullRemote: pullRemoteFn }));

      const req = request('git.pull', {
        workspaceId: 'ws-1',
        repoPath: '/tmp/external',
      });
      await router.route(conn, req);

      expect(pullRemoteFn).toHaveBeenCalledTimes(0);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.PERMISSION_DENIED,
      );
    });
  });

  // -----------------------------------------------------------------------
  // git.sync
  // -----------------------------------------------------------------------
  describe('git.sync', () => {
    it('calls doGetCurrentBranch then doSyncRemote with current branch', async () => {
      const getCurrentBranchFn = mock(async () => 'feature');
      const syncRemoteFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(
        router,
        createTestDeps({ getCurrentBranch: getCurrentBranchFn, syncRemote: syncRemoteFn }),
      );

      const req = request('git.sync', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(getCurrentBranchFn).toHaveBeenCalledTimes(1);
      expect(getCurrentBranchFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));

      expect(syncRemoteFn).toHaveBeenCalledTimes(1);
      expect(syncRemoteFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(syncRemoteFn.mock.calls[0][1]).toBe('feature');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('uses empty string when getCurrentBranch returns null', async () => {
      const getCurrentBranchFn = mock(async () => null);
      const syncRemoteFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(
        router,
        createTestDeps({ getCurrentBranch: getCurrentBranchFn, syncRemote: syncRemoteFn }),
      );

      const req = request('git.sync', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(syncRemoteFn.mock.calls[0][1]).toBe('');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.error).toBeUndefined();
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.sync', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.sync', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.WORKSPACE_NOT_FOUND,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Operations handlers (commitAmend, commitAll, stageAll)
// ---------------------------------------------------------------------------

describe('git operations handlers (commitAmend, commitAll, stageAll)', () => {
  let conn: ReturnType<typeof mockConn>;

  beforeEach(() => {
    conn = mockConn();
  });

  // -----------------------------------------------------------------------
  // git.commitAmend
  // -----------------------------------------------------------------------
  describe('git.commitAmend', () => {
    it('calls doCommitAmend with message and returns commitHash', async () => {
      const commitAmendFn = mock(
        async (_dirPath: string, _options?: { message?: string; noEdit?: boolean }) =>
          'amended123',
      );

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ commitAmend: commitAmendFn }));

      const req = request('git.commitAmend', {
        workspaceId: 'ws-1',
        repoPath: '.',
        message: 'Updated commit message',
      });
      await router.route(conn, req);

      expect(commitAmendFn).toHaveBeenCalledTimes(1);
      expect(commitAmendFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(commitAmendFn.mock.calls[0][1]).toEqual({
        message: 'Updated commit message',
        noEdit: undefined,
      });

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { commitHash: string };
      expect(payload.commitHash).toBe('amended123');
    });

    it('calls doCommitAmend with noEdit=true', async () => {
      const commitAmendFn = mock(async () => 'noedit456');

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ commitAmend: commitAmendFn }));

      const req = request('git.commitAmend', {
        workspaceId: 'ws-1',
        repoPath: '.',
        noEdit: true,
      });
      await router.route(conn, req);

      expect(commitAmendFn.mock.calls[0][1]).toEqual({
        message: undefined,
        noEdit: true,
      });

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { commitHash: string };
      expect(payload.commitHash).toBe('noedit456');
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.commitAmend', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when repoPath is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.commitAmend', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.commitAmend', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.WORKSPACE_NOT_FOUND,
      );
    });

    it('rejects path traversal in repoPath', async () => {
      const commitAmendFn = mock(async () => 'hash');

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ commitAmend: commitAmendFn }));

      const req = request('git.commitAmend', {
        workspaceId: 'ws-1',
        repoPath: '/etc/passwd',
      });
      await router.route(conn, req);

      expect(commitAmendFn).toHaveBeenCalledTimes(0);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.PERMISSION_DENIED,
      );
    });
  });

  // -----------------------------------------------------------------------
  // git.commitAll
  // -----------------------------------------------------------------------
  describe('git.commitAll', () => {
    it('calls doCommitAll with message and returns commitHash', async () => {
      const commitAllFn = mock(
        async (
          _dirPath: string,
          _message: string,
          _options?: { includeUntracked?: boolean; amend?: boolean },
        ) => 'allhash789',
      );

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ commitAll: commitAllFn }));

      const req = request('git.commitAll', {
        workspaceId: 'ws-1',
        repoPath: '.',
        message: 'Commit everything',
      });
      await router.route(conn, req);

      expect(commitAllFn).toHaveBeenCalledTimes(1);
      expect(commitAllFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(commitAllFn.mock.calls[0][1]).toBe('Commit everything');
      expect(commitAllFn.mock.calls[0][2]).toEqual({
        includeUntracked: undefined,
        amend: undefined,
      });

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { commitHash: string };
      expect(payload.commitHash).toBe('allhash789');
    });

    it('passes includeUntracked and amend options', async () => {
      const commitAllFn = mock(async () => 'optshash');

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ commitAll: commitAllFn }));

      const req = request('git.commitAll', {
        workspaceId: 'ws-1',
        repoPath: '.',
        message: 'Full commit',
        includeUntracked: true,
        amend: true,
      });
      await router.route(conn, req);

      expect(commitAllFn.mock.calls[0][2]).toEqual({
        includeUntracked: true,
        amend: true,
      });
    });

    it('returns INVALID_MESSAGE when message is empty', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.commitAll', {
        workspaceId: 'ws-1',
        repoPath: '.',
        message: '   ',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when message is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.commitAll', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.commitAll', { repoPath: '.', message: 'msg' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.commitAll', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        message: 'msg',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.WORKSPACE_NOT_FOUND,
      );
    });

    it('resolves repoPath relative to workspace cwd', async () => {
      const commitAllFn = mock(async () => 'subhash');

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ commitAll: commitAllFn }));

      const req = request('git.commitAll', {
        workspaceId: 'ws-1',
        repoPath: 'packages/lib',
        message: 'sub commit',
      });
      await router.route(conn, req);

      expect(commitAllFn.mock.calls[0][0]).toBe(
        resolve('/home/dev/project/packages/lib'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // git.stageAll
  // -----------------------------------------------------------------------
  describe('git.stageAll', () => {
    it('calls doStageAllFiles with correct absolute path', async () => {
      const stageAllFilesFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stageAllFiles: stageAllFilesFn }));

      const req = request('git.stageAll', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(stageAllFilesFn).toHaveBeenCalledTimes(1);
      expect(stageAllFilesFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('resolves repoPath relative to workspace cwd', async () => {
      const stageAllFilesFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stageAllFiles: stageAllFilesFn }));

      const req = request('git.stageAll', {
        workspaceId: 'ws-1',
        repoPath: 'packages/app',
      });
      await router.route(conn, req);

      expect(stageAllFilesFn.mock.calls[0][0]).toBe(
        resolve('/home/dev/project/packages/app'),
      );
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stageAll', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when repoPath is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stageAll', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stageAll', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.WORKSPACE_NOT_FOUND,
      );
    });

    it('rejects path traversal in repoPath', async () => {
      const stageAllFilesFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stageAllFiles: stageAllFilesFn }));

      const req = request('git.stageAll', {
        workspaceId: 'ws-1',
        repoPath: '/tmp/outside',
      });
      await router.route(conn, req);

      expect(stageAllFilesFn).toHaveBeenCalledTimes(0);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(
        ErrorCodes.PERMISSION_DENIED,
      );
    });
  });
});
