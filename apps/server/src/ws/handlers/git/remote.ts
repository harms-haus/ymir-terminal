import {
  ErrorCodes,
  type RequestEnvelope,
  type GitPushRequest,
  type GitFetchRequest,
  type GitRemoteAddRequest,
  type GitRemoteRemoveRequest,
  type GitRemoteListRequest,
  type GitRemoteListResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, type MessageRouter } from '../../router';
import type { ResolvedGitDeps } from './index';
import { resolveSafeRepoPath } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerRemoteHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const { doPushBranch, doFetchRemote, doAddRemote, doRemoveRemote, doListRemotes, doGetWorkspace, persistentDb } = deps;

  // --- git.push -----------------------------------------------------------
  router.handle('git.push', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitPushRequest>;
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
          { id: req.id, channel: req.channel ?? 'git.push' },
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
          { id: req.id, channel: req.channel ?? 'git.push' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.push');
    if (absPath === null) return;
    await doPushBranch(absPath, payload.branch);
    conn.send(createResponse(req, {}));
  });

  // --- git.fetch ----------------------------------------------------------
  router.handle('git.fetch', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitFetchRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.fetch' },
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
          { id: req.id, channel: req.channel ?? 'git.fetch' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.fetch');
    if (absPath === null) return;
    await doFetchRemote(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.remoteAdd ------------------------------------------------------
  router.handle('git.remoteAdd', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitRemoteAddRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.url !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.remoteAdd' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, name, url',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.remoteAdd' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.remoteAdd');
    if (absPath === null) return;
    await doAddRemote(absPath, payload.name, payload.url);
    conn.send(createResponse(req, {}));
  });

  // --- git.remoteRemove ---------------------------------------------------
  router.handle('git.remoteRemove', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitRemoteRemoveRequest>;
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
          { id: req.id, channel: req.channel ?? 'git.remoteRemove' },
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
          { id: req.id, channel: req.channel ?? 'git.remoteRemove' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.remoteRemove');
    if (absPath === null) return;
    await doRemoveRemote(absPath, payload.name);
    conn.send(createResponse(req, {}));
  });

  // --- git.remoteList -----------------------------------------------------
  router.handle('git.remoteList', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitRemoteListRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.remoteList' },
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
          { id: req.id, channel: req.channel ?? 'git.remoteList' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.remoteList');
    if (absPath === null) return;
    const remotes = await doListRemotes(absPath);
    const resp = createResponse(req, { remotes } satisfies GitRemoteListResponse);
    conn.send(resp);
  });
}
