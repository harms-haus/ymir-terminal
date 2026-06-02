import {
  ErrorCodes,
  type RequestEnvelope,
  type ResponseEnvelope,
  type GitStatusRequest,
  type GitStatusResponse,
  type GitLogRequest,
  type GitLogResponse,
  type GitRepoDiscoveryRequest,
  type GitRepoDiscoveryResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, type MessageRouter } from '../../router';
import type { ResolvedGitDeps } from './index';
import { resolveSafeRepoPath } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerStatusHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const {
    doGetGitStatus,
    doGetGitStatusEnhanced,
    doGetGitLog,
    doGetWorkspace,
    doDiscoverRepos,
    persistentDb,
  } = deps;

  // --- git.status ---------------------------------------------------------
  router.handle('git.status', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitStatusRequest>;
    const payload = req.payload;

    if (payload == null || typeof payload !== 'object' || typeof payload.workspaceId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'git.status' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: workspaceId',
      );
      conn.send(err);
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'git.status' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      conn.send(err);
      return;
    }

    const gitDir = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.status');
    if (gitDir === null) return;

    if (payload.repoPath) {
      const result = await doGetGitStatusEnhanced(gitDir);

      const resp: ResponseEnvelope<GitStatusResponse> = createResponse(req, {
        branch: result?.branch ?? null,
        changes: result?.changes ?? [],
        staged: result?.staged ?? [],
        repoPath: payload.repoPath,
        hasRemote: result?.hasRemote ?? false,
        ahead: result?.ahead ?? 0,
        behind: result?.behind ?? 0,
      } satisfies GitStatusResponse);

      conn.send(resp);
    } else {
      const result = await doGetGitStatus(gitDir);

      const resp: ResponseEnvelope<GitStatusResponse> = createResponse(req, {
        branch: result?.branch ?? null,
        changes: result?.changes ?? [],
        staged: result?.staged ?? [],
        repoPath: payload.repoPath,
        hasRemote: result?.hasRemote ?? false,
        ahead: result?.ahead ?? 0,
        behind: result?.behind ?? 0,
      } satisfies GitStatusResponse);

      conn.send(resp);
    }
  });

  // --- git.log -----------------------------------------------------------
  router.handle('git.log', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitLogRequest>;
    const payload = req.payload;

    if (!payload || typeof payload.workspaceId !== 'string') {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.log' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid workspaceId',
        ),
      );
      return;
    }

    if (typeof payload.skip !== 'number' || typeof payload.limit !== 'number') {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.log' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid skip/limit',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.log' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          'Workspace not found',
        ),
      );
      return;
    }

    const gitDir = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.log');
    if (gitDir === null) return;
    const limit = Math.min(Math.max(payload.limit, 1), 100);
    const skip = Math.max(payload.skip, 0);
    const commits = await doGetGitLog(gitDir, skip, limit);
    const hasMore = commits.length === limit;

    const resp = createResponse(req, { commits, hasMore } satisfies GitLogResponse);
    conn.send(resp);
  });

  // --- git.repoDiscovery --------------------------------------------------
  router.handle('git.repoDiscovery', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitRepoDiscoveryRequest>;
    const payload = req.payload;

    if (!payload || typeof payload !== 'object' || typeof payload.workspaceId !== 'string') {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.repoDiscovery' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing required field: workspaceId',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.repoDiscovery' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const baseDir = resolveSafeRepoPath(
      workspace.cwd,
      payload.repoPath,
      conn,
      req,
      'git.repoDiscovery',
    );
    if (baseDir === null) return;
    const repos = await doDiscoverRepos(baseDir);
    const resp = createResponse(req, { repos } satisfies GitRepoDiscoveryResponse);
    conn.send(resp);
  });
}
