import {
  ErrorCodes,
  type RequestEnvelope,
  type GitMergeRequest,
  type GitMergeResponse,
  type GitRebaseRequest,
  type GitRebaseAbortRequest,
  type GitRebaseStatusRequest,
  type GitRebaseStatusResponse,
  type GitPullRequest,
  type GitSyncRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, type MessageRouter } from '../../router';
import type { ResolvedGitDeps } from './index';
import { resolveSafeRepoPath } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerMergeHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const {
    doMergeBranch,
    doRebaseBranch,
    doRebaseAbort,
    doIsRebaseInProgress,
    doPullRemote,
    doSyncRemote,
    doGetCurrentBranch,
    doInvalidateAndRefresh,
    doGetWorkspace,
    persistentDb,
  } = deps;

  // --- git.merge ----------------------------------------------------------
  router.handle('git.merge', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitMergeRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.branch !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.merge' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, branch',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.merge' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.merge');
    if (absPath === null) return;
    const result = await doMergeBranch(absPath, payload.branch);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, { result } satisfies GitMergeResponse));
  });

  // --- git.rebase ---------------------------------------------------------
  router.handle('git.rebase', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitRebaseRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.branch !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.rebase' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, branch',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.rebase' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.rebase');
    if (absPath === null) return;
    const result = await doRebaseBranch(absPath, payload.branch);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, { result }));
  });

  // --- git.rebaseAbort ----------------------------------------------------
  router.handle('git.rebaseAbort', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitRebaseAbortRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.rebaseAbort' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.rebaseAbort' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(
      workspace.cwd,
      payload.repoPath,
      conn,
      req,
      'git.rebaseAbort',
    );
    if (absPath === null) return;
    await doRebaseAbort(absPath);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.rebaseStatus ---------------------------------------------------
  router.handle('git.rebaseStatus', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitRebaseStatusRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.rebaseStatus' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.rebaseStatus' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(
      workspace.cwd,
      payload.repoPath,
      conn,
      req,
      'git.rebaseStatus',
    );
    if (absPath === null) return;
    const inProgress = await doIsRebaseInProgress(absPath);
    conn.send(createResponse(req, { inProgress } satisfies GitRebaseStatusResponse));
  });

  // --- git.pull -----------------------------------------------------------
  router.handle('git.pull', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitPullRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.pull' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.pull' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.pull');
    if (absPath === null) return;
    await doPullRemote(absPath, payload.rebase);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.sync -----------------------------------------------------------
  router.handle('git.sync', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitSyncRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.sync' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.sync' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.sync');
    if (absPath === null) return;
    const currentBranch = await doGetCurrentBranch(absPath);
    await doSyncRemote(absPath, currentBranch ?? '');
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });
}
