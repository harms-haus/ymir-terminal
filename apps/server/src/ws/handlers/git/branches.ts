import {
  ErrorCodes,
  type RequestEnvelope,
  type GitBranchesRequest,
  type GitBranchesResponse,
  type GitCheckoutRequest,
  type GitBranchRenameRequest,
  type GitBranchDeleteRequest,
  type GitBranchDeleteRemoteRequest,
  type GitBranchPublishRequest,
  type GitBranchesRemoteRequest,
  type GitBranchesRemoteResponse,
  type GitBranchCreateFromRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, type MessageRouter } from '../../router';
import type { ResolvedGitDeps } from './index';
import { resolveSafeRepoPath } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerBranchesHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const {
    doListBranches,
    doCreateBranch,
    doCheckoutBranch,
    doRenameBranch,
    doDeleteBranch,
    doDeleteRemoteBranch,
    doPublishBranch,
    doListRemoteBranches,
    doCreateBranchFrom,
    doInvalidateAndRefresh,
    doGetWorkspace,
    persistentDb,
  } = deps;

  // --- git.branches -------------------------------------------------------
  router.handle('git.branches', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitBranchesRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branches' },
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
          { id: req.id, channel: req.channel ?? 'git.branches' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.branches');
    if (absPath === null) return;
    const result = await doListBranches(absPath);
    const resp = createResponse(req, result satisfies GitBranchesResponse);
    conn.send(resp);
  });

  // --- git.checkout -------------------------------------------------------
  router.handle('git.checkout', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitCheckoutRequest>;
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
          { id: req.id, channel: req.channel ?? 'git.checkout' },
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
          { id: req.id, channel: req.channel ?? 'git.checkout' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.checkout');
    if (absPath === null) return;
    if (payload.createNew) {
      await doCreateBranch(absPath, payload.branch);
    } else {
      await doCheckoutBranch(absPath, payload.branch);
    }
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.branchRename ---------------------------------------------------
  router.handle('git.branchRename', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitBranchRenameRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.oldName !== 'string' ||
      typeof payload.newName !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchRename' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, oldName, newName',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchRename' },
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
      'git.branchRename',
    );
    if (absPath === null) return;
    await doRenameBranch(absPath, payload.oldName, payload.newName);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.branchDelete ---------------------------------------------------
  router.handle('git.branchDelete', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitBranchDeleteRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.name !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchDelete' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, name',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchDelete' },
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
      'git.branchDelete',
    );
    if (absPath === null) return;
    await doDeleteBranch(absPath, payload.name, payload.force);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.branchDeleteRemote ---------------------------------------------
  router.handle('git.branchDeleteRemote', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitBranchDeleteRemoteRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.remote !== 'string' ||
      typeof payload.branch !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchDeleteRemote' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, remote, branch',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchDeleteRemote' },
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
      'git.branchDeleteRemote',
    );
    if (absPath === null) return;
    await doDeleteRemoteBranch(absPath, payload.remote, payload.branch);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.branchPublish --------------------------------------------------
  router.handle('git.branchPublish', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitBranchPublishRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchPublish' },
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
          { id: req.id, channel: req.channel ?? 'git.branchPublish' },
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
      'git.branchPublish',
    );
    if (absPath === null) return;
    await doPublishBranch(absPath, payload.remote);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.branchesRemote -------------------------------------------------
  router.handle('git.branchesRemote', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitBranchesRemoteRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchesRemote' },
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
          { id: req.id, channel: req.channel ?? 'git.branchesRemote' },
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
      'git.branchesRemote',
    );
    if (absPath === null) return;
    const result = await doListRemoteBranches(absPath);
    const resp = createResponse(req, {
      branches: result.branches,
    } satisfies GitBranchesRemoteResponse);
    conn.send(resp);
  });

  // --- git.branchCreateFrom -----------------------------------------------
  router.handle('git.branchCreateFrom', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitBranchCreateFromRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.startPoint !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchCreateFrom' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, name, startPoint',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branchCreateFrom' },
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
      'git.branchCreateFrom',
    );
    if (absPath === null) return;
    await doCreateBranchFrom(absPath, payload.name, payload.startPoint);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });
}
