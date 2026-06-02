/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { ErrorCodes, type GitStashEntry } from '@ymir/shared';
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

describe('git stash handlers', () => {
  let conn: ReturnType<typeof mockConn>;

  beforeEach(() => {
    conn = mockConn();
  });

  // -----------------------------------------------------------------------
  // git.stashPush
  // -----------------------------------------------------------------------
  describe('git.stashPush', () => {
    it('calls doStashPush and returns stashRef on success', async () => {
      const stashPushFn = mock(
        async (_dirPath: string, _options?: { includeUntracked?: boolean; message?: string }) =>
          'stash@{0}',
      );

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashPush: stashPushFn }));

      const req = request('git.stashPush', {
        workspaceId: 'ws-1',
        repoPath: '.',
        includeUntracked: true,
        message: 'WIP',
      });
      await router.route(conn, req);

      expect(stashPushFn).toHaveBeenCalledTimes(1);
      expect(stashPushFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(stashPushFn.mock.calls[0][1]).toEqual({
        includeUntracked: true,
        message: 'WIP',
      });

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { stashRef: string };
      expect(payload.stashRef).toBe('stash@{0}');
    });

    it('works without optional includeUntracked and message', async () => {
      const stashPushFn = mock(async () => 'stash@{0}');

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashPush: stashPushFn }));

      const req = request('git.stashPush', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(stashPushFn).toHaveBeenCalledTimes(1);
      expect(stashPushFn.mock.calls[0][1]).toEqual({
        includeUntracked: undefined,
        message: undefined,
      });

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.error).toBeUndefined();
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashPush', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when repoPath is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashPush', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashPush', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INTERNAL_ERROR when doStashPush throws', async () => {
      const stashPushFn = mock(async () => {
        throw new Error('no changes to stash');
      });

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashPush: stashPushFn }));

      const req = request('git.stashPush', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect((resp.error as Record<string, unknown>).message).toBe('no changes to stash');
    });

    it('resolves repoPath relative to workspace cwd', async () => {
      const stashPushFn = mock(async () => 'stash@{0}');

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashPush: stashPushFn }));

      const req = request('git.stashPush', {
        workspaceId: 'ws-1',
        repoPath: 'packages/app',
      });
      await router.route(conn, req);

      expect(stashPushFn.mock.calls[0][0]).toBe(resolve('/home/dev/project/packages/app'));
    });

    it('rejects path traversal in repoPath', async () => {
      const stashPushFn = mock(async () => 'stash@{0}');

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashPush: stashPushFn }));

      const req = request('git.stashPush', {
        workspaceId: 'ws-1',
        repoPath: '/tmp/external',
      });
      await router.route(conn, req);

      expect(stashPushFn).toHaveBeenCalledTimes(0);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
    });
  });

  // -----------------------------------------------------------------------
  // git.stashList
  // -----------------------------------------------------------------------
  describe('git.stashList', () => {
    it('returns stashes array on success', async () => {
      const fakeStashes: GitStashEntry[] = [
        { ref: 'stash@{0}', message: 'WIP on main', date: '2024-01-01T00:00:00Z' },
        { ref: 'stash@{1}', message: 'WIP on feature', date: '2024-01-02T00:00:00Z' },
      ];
      const stashListFn = mock(async () => fakeStashes);

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashList: stashListFn }));

      const req = request('git.stashList', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      expect(stashListFn).toHaveBeenCalledTimes(1);
      expect(stashListFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { stashes: GitStashEntry[] };
      expect(payload.stashes).toEqual(fakeStashes);
    });

    it('returns empty array when no stashes exist', async () => {
      const stashListFn = mock(async () => []);

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashList: stashListFn }));

      const req = request('git.stashList', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as { stashes: GitStashEntry[] };
      expect(payload.stashes).toEqual([]);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashList', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashList', { workspaceId: 'nonexistent', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INTERNAL_ERROR when doStashList throws', async () => {
      const stashListFn = mock(async () => {
        throw new Error('not a git repo');
      });

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashList: stashListFn }));

      const req = request('git.stashList', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INTERNAL_ERROR);
    });
  });

  // -----------------------------------------------------------------------
  // git.stashApply
  // -----------------------------------------------------------------------
  describe('git.stashApply', () => {
    it('calls doStashApply with correct args and returns success', async () => {
      const stashApplyFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashApply: stashApplyFn }));

      const req = request('git.stashApply', {
        workspaceId: 'ws-1',
        repoPath: '.',
        stashRef: 'stash@{0}',
      });
      await router.route(conn, req);

      expect(stashApplyFn).toHaveBeenCalledTimes(1);
      expect(stashApplyFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(stashApplyFn.mock.calls[0][1]).toBe('stash@{0}');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('works without stashRef (defaults to latest)', async () => {
      const stashApplyFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashApply: stashApplyFn }));

      const req = request('git.stashApply', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(stashApplyFn).toHaveBeenCalledTimes(1);
      // stashRef is undefined when not provided
      expect(stashApplyFn.mock.calls[0][1]).toBeUndefined();
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashApply', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashApply', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INTERNAL_ERROR when doStashApply throws', async () => {
      const stashApplyFn = mock(async () => {
        throw new Error('conflict');
      });

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashApply: stashApplyFn }));

      const req = request('git.stashApply', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INTERNAL_ERROR);
    });
  });

  // -----------------------------------------------------------------------
  // git.stashPop
  // -----------------------------------------------------------------------
  describe('git.stashPop', () => {
    it('calls doStashPop with correct args and returns success', async () => {
      const stashPopFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashPop: stashPopFn }));

      const req = request('git.stashPop', {
        workspaceId: 'ws-1',
        repoPath: '.',
        stashRef: 'stash@{1}',
      });
      await router.route(conn, req);

      expect(stashPopFn).toHaveBeenCalledTimes(1);
      expect(stashPopFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(stashPopFn.mock.calls[0][1]).toBe('stash@{1}');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('works without stashRef (defaults to latest)', async () => {
      const stashPopFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashPop: stashPopFn }));

      const req = request('git.stashPop', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(stashPopFn).toHaveBeenCalledTimes(1);
      expect(stashPopFn.mock.calls[0][1]).toBeUndefined();
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashPop', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashPop', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INTERNAL_ERROR when doStashPop throws', async () => {
      const stashPopFn = mock(async () => {
        throw new Error('merge conflict');
      });

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashPop: stashPopFn }));

      const req = request('git.stashPop', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INTERNAL_ERROR);
    });
  });

  // -----------------------------------------------------------------------
  // git.stashDrop
  // -----------------------------------------------------------------------
  describe('git.stashDrop', () => {
    it('calls doStashDrop with correct args and returns success', async () => {
      const stashDropFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashDrop: stashDropFn }));

      const req = request('git.stashDrop', {
        workspaceId: 'ws-1',
        repoPath: '.',
        stashRef: 'stash@{0}',
      });
      await router.route(conn, req);

      expect(stashDropFn).toHaveBeenCalledTimes(1);
      expect(stashDropFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));
      expect(stashDropFn.mock.calls[0][1]).toBe('stash@{0}');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('returns INVALID_MESSAGE when stashRef is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashDrop', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when stashRef is not a string', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashDrop', {
        workspaceId: 'ws-1',
        repoPath: '.',
        stashRef: 123,
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashDrop', { repoPath: '.', stashRef: 'stash@{0}' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashDrop', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        stashRef: 'stash@{0}',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INTERNAL_ERROR when doStashDrop throws', async () => {
      const stashDropFn = mock(async () => {
        throw new Error('stash ref not found');
      });

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashDrop: stashDropFn }));

      const req = request('git.stashDrop', {
        workspaceId: 'ws-1',
        repoPath: '.',
        stashRef: 'stash@{99}',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INTERNAL_ERROR);
    });
  });

  // -----------------------------------------------------------------------
  // git.stashClear
  // -----------------------------------------------------------------------
  describe('git.stashClear', () => {
    it('calls doStashClear and returns success', async () => {
      const stashClearFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashClear: stashClearFn }));

      const req = request('git.stashClear', {
        workspaceId: 'ws-1',
        repoPath: '.',
      });
      await router.route(conn, req);

      expect(stashClearFn).toHaveBeenCalledTimes(1);
      expect(stashClearFn.mock.calls[0][0]).toBe(resolve('/home/dev/project'));

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashClear', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when repoPath is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashClear', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.stashClear', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INTERNAL_ERROR when doStashClear throws', async () => {
      const stashClearFn = mock(async () => {
        throw new Error('permission denied');
      });

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ stashClear: stashClearFn }));

      const req = request('git.stashClear', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INTERNAL_ERROR);
    });
  });
});
