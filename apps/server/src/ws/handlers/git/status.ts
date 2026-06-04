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
  type GitRepoDiscoveryProgressEvent,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createEvent, createResponse, type MessageRouter } from '../../router';
import type { ResolvedGitDeps } from './index';
import { resolveSafeRepoPath } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerStatusHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const {
    doGetGitStatusEnhanced,
    doGetGitLog,
    doGetWorkspace,
    doDiscoverRepos,
    persistentDb,
    gitStatusCache,
    gitStatusWatcher,
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

    // ------------------------------------------------------------------
    // Cache-aware status lookup
    // ------------------------------------------------------------------

    // 1. Fresh cache hit — serve immediately, no git process spawned
    if (gitStatusCache.isFresh(gitDir)) {
      const cached = gitStatusCache.get(gitDir);
      if (cached) {
        conn.send(
          createResponse(req, {
            ...cached,
            repoPath: payload.repoPath,
          } satisfies GitStatusResponse),
        );
        return;
      }
    }

    // 2. Stale cache hit — serve cached data, refresh in background
    if (gitStatusCache.has(gitDir)) {
      const cached = gitStatusCache.get(gitDir)!;
      conn.send(
        createResponse(req, {
          ...cached,
          repoPath: payload.repoPath,
        } satisfies GitStatusResponse),
      );
      if (gitStatusWatcher) {
        // Don't await — fire-and-forget background refresh
        gitStatusWatcher.refreshNow(gitDir).catch((err: unknown) => {
          console.error('Background git status refresh failed:', err);
        });
      }
      return;
    }

    // 3. Cache miss with watcher — use watcher to fetch and cache
    if (gitStatusWatcher) {
      await gitStatusWatcher.refreshNow(gitDir);
      const fresh = gitStatusCache.get(gitDir);
      if (fresh) {
        conn.send(
          createResponse(req, {
            ...fresh,
            repoPath: payload.repoPath,
          } satisfies GitStatusResponse),
        );
        return;
      }
    }

    // 4. Fallback — direct fetch (no cache or watcher unavailable)
    const result = await doGetGitStatusEnhanced(gitDir);

    if (result) {
      gitStatusCache.set(gitDir, result);
    }

    conn.send(
      createResponse(req, {
        branch: result?.branch ?? null,
        changes: result?.changes ?? [],
        staged: result?.staged ?? [],
        repoPath: payload.repoPath,
        hasRemote: result?.hasRemote ?? false,
        ahead: result?.ahead ?? 0,
        behind: result?.behind ?? 0,
      } satisfies GitStatusResponse),
    );
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
    const repos = await doDiscoverRepos(baseDir, undefined, (depthRepos, depth) => {
      try {
        const event = createEvent('git.repoDiscovery.progress', {
          workspaceId: payload.workspaceId,
          repos: depthRepos,
          depth,
          done: false,
        } satisfies GitRepoDiscoveryProgressEvent);
        conn.send(event);
      } catch {
        // Connection may have closed mid-discovery; continue discovering
      }
    });
    const resp = createResponse(req, { repos } satisfies GitRepoDiscoveryResponse);
    conn.send(resp);
  });
}
