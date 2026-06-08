import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { ErrorCodes } from '@ymir/shared';
import { mockConn, request, expectSuccessResponse } from '../../../test-helpers/mock-utils';
import { createTestDeps } from '../../../test-helpers/git-test-utils';
import { MessageRouter } from '../../router';
import { registerGitHandlers } from './index';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('git branches handlers', () => {
  let conn: ReturnType<typeof mockConn>;

  beforeEach(() => {
    conn = mockConn();
  });

  // -----------------------------------------------------------------------
  // git.branches
  // -----------------------------------------------------------------------
  describe('git.branches', () => {
    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branches', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when repoPath is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branches', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branches', { workspaceId: 'nonexistent', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // git.checkout
  // -----------------------------------------------------------------------
  describe('git.checkout', () => {
    it('returns INVALID_MESSAGE when branch is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.checkout', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.checkout', { repoPath: '.', branch: 'dev' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when repoPath is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.checkout', { workspaceId: 'ws-1', branch: 'dev' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.checkout', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        branch: 'dev',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE for invalid branch name (leading dash)', async () => {
      const checkoutBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ checkoutBranch: checkoutBranchFn }));

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: '-f',
      });
      await router.route(conn, req);

      // The handler catches the error from the branch function
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
      expect((resp.error as Record<string, unknown>).message).toBe('Invalid branch name: -f');
    });

    it('returns INVALID_MESSAGE for invalid branch name (double dots)', async () => {
      const checkoutBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ checkoutBranch: checkoutBranchFn }));

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'foo/../bar',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
      expect((resp.error as Record<string, unknown>).message).toBe(
        'Invalid branch name: foo/../bar',
      );
    });

    it('returns INVALID_MESSAGE for invalid branch name (.lock suffix)', async () => {
      const checkoutBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ checkoutBranch: checkoutBranchFn }));

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'branch.lock',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
      expect((resp.error as Record<string, unknown>).message).toBe(
        'Invalid branch name: branch.lock',
      );
    });

    it('returns INVALID_MESSAGE for invalid branch name (@{upstream})', async () => {
      const checkoutBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ checkoutBranch: checkoutBranchFn }));

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: '@{upstream}',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for invalid branch name (spaces)', async () => {
      const checkoutBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ checkoutBranch: checkoutBranchFn }));

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'a b',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for invalid branch name (consecutive slashes)', async () => {
      const checkoutBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ checkoutBranch: checkoutBranchFn }));

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'test//branch',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
      expect((resp.error as Record<string, unknown>).message).toBe(
        'Invalid branch name: test//branch',
      );
    });

    it('returns INVALID_MESSAGE for invalid branch name (leading slash)', async () => {
      const checkoutBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ checkoutBranch: checkoutBranchFn }));

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: '/leading',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for invalid branch name (trailing slash)', async () => {
      const checkoutBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ checkoutBranch: checkoutBranchFn }));

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'trailing/',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('succeeds with valid branch name containing slashes', async () => {
      const checkoutBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ checkoutBranch: checkoutBranchFn }));

      const req = request('git.checkout', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'feature/my-feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expectSuccessResponse(resp);
    });
  });

  // -----------------------------------------------------------------------
  // git.branchRename
  // -----------------------------------------------------------------------
  describe('git.branchRename', () => {
    it('returns INVALID_MESSAGE when oldName is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchRename', {
        workspaceId: 'ws-1',
        repoPath: '.',
        newName: 'new',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when newName is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchRename', {
        workspaceId: 'ws-1',
        repoPath: '.',
        oldName: 'old',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchRename', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        oldName: 'old',
        newName: 'new',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE for invalid oldName (leading dash)', async () => {
      const renameBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ renameBranch: renameBranchFn }));

      const req = request('git.branchRename', {
        workspaceId: 'ws-1',
        repoPath: '.',
        oldName: '-old',
        newName: 'new',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for invalid newName (@{upstream})', async () => {
      const renameBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ renameBranch: renameBranchFn }));

      const req = request('git.branchRename', {
        workspaceId: 'ws-1',
        repoPath: '.',
        oldName: 'main',
        newName: '@{upstream}',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // git.branchDelete
  // -----------------------------------------------------------------------
  describe('git.branchDelete', () => {
    it('returns INVALID_MESSAGE when name is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchDelete', { workspaceId: 'ws-1', repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchDelete', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        name: 'feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE for invalid branch name (-f)', async () => {
      const deleteBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ deleteBranch: deleteBranchFn }));

      const req = request('git.branchDelete', {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: '-f',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for branch name with ..', async () => {
      const deleteBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ deleteBranch: deleteBranchFn }));

      const req = request('git.branchDelete', {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: 'a..b',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // git.branchDeleteRemote
  // -----------------------------------------------------------------------
  describe('git.branchDeleteRemote', () => {
    it('returns INVALID_MESSAGE when remote is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchDeleteRemote', {
        workspaceId: 'ws-1',
        repoPath: '.',
        branch: 'feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when branch is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchDeleteRemote', {
        workspaceId: 'ws-1',
        repoPath: '.',
        remote: 'origin',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchDeleteRemote', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        remote: 'origin',
        branch: 'feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE for invalid remote (leading dash)', async () => {
      const deleteRemoteBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ deleteRemoteBranch: deleteRemoteBranchFn }));

      const req = request('git.branchDeleteRemote', {
        workspaceId: 'ws-1',
        repoPath: '.',
        remote: '-origin',
        branch: 'feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for invalid branch (..)', async () => {
      const deleteRemoteBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ deleteRemoteBranch: deleteRemoteBranchFn }));

      const req = request('git.branchDeleteRemote', {
        workspaceId: 'ws-1',
        repoPath: '.',
        remote: 'origin',
        branch: 'a..b',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // git.branchPublish
  // -----------------------------------------------------------------------
  describe('git.branchPublish', () => {
    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchPublish', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when repoPath is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchPublish', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchPublish', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE for invalid remote name', async () => {
      const publishBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ publishBranch: publishBranchFn }));

      const req = request('git.branchPublish', {
        workspaceId: 'ws-1',
        repoPath: '.',
        remote: '-origin',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for remote with @{', async () => {
      const publishBranchFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ publishBranch: publishBranchFn }));

      const req = request('git.branchPublish', {
        workspaceId: 'ws-1',
        repoPath: '.',
        remote: '@{origin',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // git.branchesRemote
  // -----------------------------------------------------------------------
  describe('git.branchesRemote', () => {
    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchesRemote', { repoPath: '.' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when repoPath is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchesRemote', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchesRemote', {
        workspaceId: 'nonexistent',
        repoPath: '.',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // git.branchCreateFrom
  // -----------------------------------------------------------------------
  describe('git.branchCreateFrom', () => {
    it('returns INVALID_MESSAGE when name is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchCreateFrom', {
        workspaceId: 'ws-1',
        repoPath: '.',
        startPoint: 'HEAD',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when startPoint is missing', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchCreateFrom', {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: 'feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps());

      const req = request('git.branchCreateFrom', {
        workspaceId: 'nonexistent',
        repoPath: '.',
        name: 'feature',
        startPoint: 'HEAD',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE for invalid branch name (-f)', async () => {
      const createBranchFromFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ createBranchFrom: createBranchFromFn }));

      const req = request('git.branchCreateFrom', {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: '-f',
        startPoint: 'HEAD',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for invalid start point', async () => {
      const createBranchFromFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ createBranchFrom: createBranchFromFn }));

      const req = request('git.branchCreateFrom', {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: 'feature',
        startPoint: '-f',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for branch name with consecutive slashes', async () => {
      const createBranchFromFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ createBranchFrom: createBranchFromFn }));

      const req = request('git.branchCreateFrom', {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: 'test//branch',
        startPoint: 'HEAD',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE for branch name with .lock suffix', async () => {
      const createBranchFromFn = mock(async () => {});

      const router = new MessageRouter();
      registerGitHandlers(router, createTestDeps({ createBranchFrom: createBranchFromFn }));

      const req = request('git.branchCreateFrom', {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: 'branch.lock',
        startPoint: 'HEAD',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });
});
