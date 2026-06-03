import {
  ErrorCodes,
  type RequestEnvelope,
  type GitStageRequest,
  type GitUnstageRequest,
  type GitDiscardRequest,
  type GitCommitRequest,
  type GitCommitResponse,
  type GitCommitAmendResponse,
  type GitCommitAllResponse,
  type GitStageAllRequest,
  type GitUnstageAllRequest,
  type GitDiscardAllRequest,
  type GitCommitAmendRequest,
  type GitCommitAllRequest,
  type GitResetSoftRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, type MessageRouter } from '../../router';
import type { ResolvedGitDeps } from './index';
import { resolveSafeRepoPath } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerOperationsHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const {
    doStageFiles,
    doUnstageFiles,
    doDiscardChanges,
    doCommitChanges,
    doStageAllFiles,
    doUnstageAllFiles,
    doDiscardAllChanges,
    doCommitAmend,
    doCommitAll,
    doResetSoft,
    doInvalidateAndRefresh,
    doGetWorkspace,
    persistentDb,
  } = deps;

  // --- git.stage ----------------------------------------------------------
  router.handle('git.stage', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitStageRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stage' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, files (non-empty array)',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stage' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.stage');
    if (absPath === null) return;
    for (const f of payload.files) {
      if (typeof f !== 'string' || f.includes('..') || f.startsWith('/')) {
        conn.send(
          createError(
            { id: req.id, channel: req.channel ?? 'git.stage' },
            ErrorCodes.INVALID_MESSAGE,
            'Invalid file path in files array',
          ),
        );
        return;
      }
    }
    await doStageFiles(absPath, payload.files);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.unstage --------------------------------------------------------
  router.handle('git.unstage', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitUnstageRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.unstage' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, files (non-empty array)',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.unstage' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.unstage');
    if (absPath === null) return;
    for (const f of payload.files) {
      if (typeof f !== 'string' || f.includes('..') || f.startsWith('/')) {
        conn.send(
          createError(
            { id: req.id, channel: req.channel ?? 'git.unstage' },
            ErrorCodes.INVALID_MESSAGE,
            'Invalid file path in files array',
          ),
        );
        return;
      }
    }
    await doUnstageFiles(absPath, payload.files);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.discard --------------------------------------------------------
  router.handle('git.discard', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitDiscardRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.discard' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, files (non-empty array)',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.discard' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.discard');
    if (absPath === null) return;
    for (const f of payload.files) {
      if (typeof f !== 'string' || f.includes('..') || f.startsWith('/')) {
        conn.send(
          createError(
            { id: req.id, channel: req.channel ?? 'git.discard' },
            ErrorCodes.INVALID_MESSAGE,
            'Invalid file path in files array',
          ),
        );
        return;
      }
    }
    await doDiscardChanges(absPath, payload.files);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.commit ---------------------------------------------------------
  router.handle('git.commit', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitCommitRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.message !== 'string' ||
      payload.message.trim().length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commit' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, message (non-empty string)',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commit' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.commit');
    if (absPath === null) return;
    const commitHash = await doCommitChanges(absPath, payload.message);
    void doInvalidateAndRefresh(absPath);
    const resp = createResponse(req, { commitHash } satisfies GitCommitResponse);
    conn.send(resp);
  });

  // --- git.stageAll -------------------------------------------------------
  router.handle('git.stageAll', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitStageAllRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stageAll' },
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
          { id: req.id, channel: req.channel ?? 'git.stageAll' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.stageAll');
    if (absPath === null) return;
    await doStageAllFiles(absPath);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.unstageAll -----------------------------------------------------
  router.handle('git.unstageAll', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitUnstageAllRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.unstageAll' },
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
          { id: req.id, channel: req.channel ?? 'git.unstageAll' },
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
      'git.unstageAll',
    );
    if (absPath === null) return;
    await doUnstageAllFiles(absPath);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.discardAll -----------------------------------------------------
  router.handle('git.discardAll', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitDiscardAllRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.discardAll' },
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
          { id: req.id, channel: req.channel ?? 'git.discardAll' },
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
      'git.discardAll',
    );
    if (absPath === null) return;
    await doDiscardAllChanges(absPath);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.commitAmend ----------------------------------------------------
  router.handle('git.commitAmend', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitCommitAmendRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitAmend' },
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
          { id: req.id, channel: req.channel ?? 'git.commitAmend' },
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
      'git.commitAmend',
    );
    if (absPath === null) return;
    const commitHash = await doCommitAmend(absPath, {
      message: payload.message,
      noEdit: payload.noEdit,
    });
    void doInvalidateAndRefresh(absPath);
    const resp = createResponse(req, { commitHash } satisfies GitCommitAmendResponse);
    conn.send(resp);
  });

  // --- git.commitAll ------------------------------------------------------
  router.handle('git.commitAll', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitCommitAllRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.message !== 'string' ||
      payload.message.trim().length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitAll' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, message (non-empty string)',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitAll' },
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
      'git.commitAll',
    );
    if (absPath === null) return;
    const commitHash = await doCommitAll(absPath, payload.message, {
      includeUntracked: payload.includeUntracked,
      amend: payload.amend,
    });
    void doInvalidateAndRefresh(absPath);
    const resp = createResponse(req, { commitHash } satisfies GitCommitAllResponse);
    conn.send(resp);
  });

  // --- git.resetSoft ------------------------------------------------------
  router.handle('git.resetSoft', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitResetSoftRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.resetSoft' },
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
          { id: req.id, channel: req.channel ?? 'git.resetSoft' },
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
      'git.resetSoft',
    );
    if (absPath === null) return;
    await doResetSoft(absPath, payload.ref);
    void doInvalidateAndRefresh(absPath);
    conn.send(createResponse(req, {}));
  });
}
