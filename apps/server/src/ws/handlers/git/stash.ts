import {
  ErrorCodes,
  type RequestEnvelope,
  type GitStashPushRequest,
  type GitStashPushResponse,
  type GitStashListRequest,
  type GitStashListResponse,
  type GitStashApplyRequest,
  type GitStashPopRequest,
  type GitStashDropRequest,
  type GitStashClearRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, type MessageRouter } from '../../router';
import type { ResolvedGitDeps } from './index';
import { resolveSafeRepoPath } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerStashHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const {
    doStashPush,
    doStashList,
    doStashApply,
    doStashPop,
    doStashDrop,
    doStashClear,
    doGetWorkspace,
    persistentDb,
  } = deps;

  // --- git.stashPush -------------------------------------------------------
  router.handle('git.stashPush', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitStashPushRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashPush' },
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
          { id: req.id, channel: req.channel ?? 'git.stashPush' },
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
      'git.stashPush',
    );
    if (absPath === null) return;

    try {
      const stashRef = await doStashPush(absPath, {
        includeUntracked: payload.includeUntracked,
        message: payload.message,
      });
      conn.send(createResponse(req, { stashRef } satisfies GitStashPushResponse));
    } catch (err) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashPush' },
          ErrorCodes.INTERNAL_ERROR,
          err instanceof Error ? err.message : 'Internal error',
        ),
      );
    }
  });

  // --- git.stashList -------------------------------------------------------
  router.handle('git.stashList', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitStashListRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashList' },
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
          { id: req.id, channel: req.channel ?? 'git.stashList' },
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
      'git.stashList',
    );
    if (absPath === null) return;

    try {
      const stashes = await doStashList(absPath);
      conn.send(createResponse(req, { stashes } satisfies GitStashListResponse));
    } catch (err) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashList' },
          ErrorCodes.INTERNAL_ERROR,
          err instanceof Error ? err.message : 'Internal error',
        ),
      );
    }
  });

  // --- git.stashApply ------------------------------------------------------
  router.handle('git.stashApply', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitStashApplyRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashApply' },
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
          { id: req.id, channel: req.channel ?? 'git.stashApply' },
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
      'git.stashApply',
    );
    if (absPath === null) return;

    try {
      await doStashApply(absPath, payload.stashRef);
      conn.send(createResponse(req, {}));
    } catch (err) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashApply' },
          ErrorCodes.INTERNAL_ERROR,
          err instanceof Error ? err.message : 'Internal error',
        ),
      );
    }
  });

  // --- git.stashPop --------------------------------------------------------
  router.handle('git.stashPop', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitStashPopRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashPop' },
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
          { id: req.id, channel: req.channel ?? 'git.stashPop' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.stashPop');
    if (absPath === null) return;

    try {
      await doStashPop(absPath, payload.stashRef);
      conn.send(createResponse(req, {}));
    } catch (err) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashPop' },
          ErrorCodes.INTERNAL_ERROR,
          err instanceof Error ? err.message : 'Internal error',
        ),
      );
    }
  });

  // --- git.stashDrop -------------------------------------------------------
  router.handle('git.stashDrop', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitStashDropRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.stashRef !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashDrop' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, stashRef',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashDrop' },
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
      'git.stashDrop',
    );
    if (absPath === null) return;

    try {
      await doStashDrop(absPath, payload.stashRef);
      conn.send(createResponse(req, {}));
    } catch (err) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashDrop' },
          ErrorCodes.INTERNAL_ERROR,
          err instanceof Error ? err.message : 'Internal error',
        ),
      );
    }
  });

  // --- git.stashClear ------------------------------------------------------
  router.handle('git.stashClear', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitStashClearRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashClear' },
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
          { id: req.id, channel: req.channel ?? 'git.stashClear' },
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
      'git.stashClear',
    );
    if (absPath === null) return;

    try {
      await doStashClear(absPath);
      conn.send(createResponse(req, {}));
    } catch (err) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stashClear' },
          ErrorCodes.INTERNAL_ERROR,
          err instanceof Error ? err.message : 'Internal error',
        ),
      );
    }
  });
}
