import {
  ErrorCodes,
  expandTilde,
  type EventEnvelope,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type FileChangeEvent as FileChangePayload,
  type WorkspaceCreateRequest,
  type WorkspaceCreateResponse,
  type WorkspaceDeleteRequest,
  type WorkspaceListResponse,
  type WorkspaceReorderRequest,
  type WorkspaceSubscribeRequest,
  type WorkspaceSummary,
  type WorkspaceUnsubscribeRequest,
  type WorkspaceUpdateRequest,
  type CwdCompression,
} from '@ymir/shared';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { buildCompressionMap, shortenPath } from '../../lib/path-compression';
import type { ClientConnection } from '../connection';
import { createError, createResponse, type MessageRouter } from '../router';
import {
  listWorkspaces as dbListWorkspaces,
  createWorkspace as dbCreateWorkspace,
  updateWorkspace as dbUpdateWorkspace,
  deleteWorkspace as dbDeleteWorkspace,
  getWorkspace as dbGetWorkspace,
  reorderWorkspaces as dbReorderWorkspaces,
  deletePersistedTabsByWorkspace as dbDeletePersistedTabsByWorkspace,
  type Workspace,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
} from '../../db/persistent';
import { startManagedWatcher, stopManagedWatcher } from '../../files/workspace-watcher';
import { discoverRepos as nativeDiscoverRepos } from '../../git/discovery';
import type { GitRepoInfo } from '@ymir/shared';
import type { Database } from 'bun:sqlite';
import type { GitStatusWatcher } from '../../git/status-watcher';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface WorkspaceDeps {
  persistentDb: Database;
  sessionDb: Database;
  /** Broadcast an event envelope to all authenticated connected clients. */
  broadcastEvent: (envelope: EventEnvelope) => void;
  /** GitStatusWatcher instance (optional — used when available). */
  gitStatusWatcher?: GitStatusWatcher;
  /** Map tracking repo root → workspace metadata (shared with git handlers). */
  watchedGitDirs?: Map<string, { workspaceId: string; repoPath: string }>;
  /** Internal: allows tests to inject mock CRUD functions. */
  _mocks?: {
    listWorkspaces?: (db: Database) => Workspace[];
    createWorkspace?: (db: Database, input: CreateWorkspaceInput) => Workspace;
    updateWorkspace?: (db: Database, id: string, input: UpdateWorkspaceInput) => Workspace | null;
    deleteWorkspace?: (db: Database, id: string) => boolean;
    getWorkspace?: (db: Database, id: string) => Workspace | null;
    startManagedWatcher?: (
      workspaceId: string,
      cwd: string,
      broadcastEvent: (envelope: EventEnvelope<FileChangePayload>) => void,
    ) => void;
    stopManagedWatcher?: (workspaceId: string) => void;
    reorderWorkspaces?: (db: Database, ids: string[]) => void;
    deletePersistedTabsByWorkspace?: (db: Database, workspaceId: string) => void;
    discoverRepos?: (
      workspaceCwd: string,
      maxDepth?: number,
      onDepthComplete?: (repos: GitRepoInfo[], depth: number) => void,
    ) => Promise<GitRepoInfo[]>;
    buildCompressionMap?: (shortenedPath: string) => CwdCompression;
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorkspaceHandlers(router: MessageRouter, deps: WorkspaceDeps): void {
  const { persistentDb, _mocks } = deps;

  const doBuildCompression = _mocks?.buildCompressionMap ?? buildCompressionMap;

  /** Strip timestamp fields to produce a WorkspaceSummary. */
  function toSummary(ws: Workspace): WorkspaceSummary {
    const shortened = shortenPath(ws.cwd, homedir());
    const cwdCompression = doBuildCompression(shortened);
    return {
      id: ws.id,
      name: ws.name,
      cwd: ws.cwd,
      cwdCompression,
      color: ws.color,
      sortOrder: ws.sort_order,
    };
  }

  const doList = _mocks?.listWorkspaces ?? dbListWorkspaces;
  const doCreate = _mocks?.createWorkspace ?? dbCreateWorkspace;
  const doUpdate = _mocks?.updateWorkspace ?? dbUpdateWorkspace;
  const doDelete = _mocks?.deleteWorkspace ?? dbDeleteWorkspace;
  const doGet = _mocks?.getWorkspace ?? dbGetWorkspace;
  const doStartWatcher = _mocks?.startManagedWatcher ?? startManagedWatcher;
  const doStopWatcher = _mocks?.stopManagedWatcher ?? stopManagedWatcher;
  const doReorder = _mocks?.reorderWorkspaces ?? dbReorderWorkspaces;
  const doDeletePersistedTabs =
    _mocks?.deletePersistedTabsByWorkspace ?? dbDeletePersistedTabsByWorkspace;
  const doDiscoverRepos = _mocks?.discoverRepos ?? nativeDiscoverRepos;

  const { gitStatusWatcher, watchedGitDirs } = deps;

  // Tracks in-flight discovery promises that should be cancelled (e.g. if a
  // workspace is deleted while its repos are still being discovered).
  const cancelledDiscovery = new Map<string, boolean>();

  /**
   * Discover git repos in a directory and start watching each one.
   * Fire-and-forget — errors are isolated and logged.
   */
  function startGitWatchersForWorkspace(workspaceId: string, cwd: string): void {
    if (!gitStatusWatcher || !watchedGitDirs) return;
    cancelledDiscovery.delete(workspaceId);
    doDiscoverRepos(cwd, undefined, (depthRepos, _depth) => {
      if (cancelledDiscovery.get(workspaceId)) return;
      for (const repo of depthRepos) {
        const repoRoot = join(cwd, repo.path);
        // Use repo-root as the canonical key throughout the watcher/cache/broadcast system
        gitStatusWatcher.watchRepo(repoRoot, repoRoot);
        watchedGitDirs.set(repoRoot, { workspaceId, repoPath: repo.path });
      }
    })
      .then(() => {
        cancelledDiscovery.delete(workspaceId);
      })
      .catch((err: unknown) => {
        cancelledDiscovery.delete(workspaceId);
        console.error('Failed to discover git repos for workspace', workspaceId, err);
      });
  }

  /**
   * Stop watching all git repos belonging to a workspace and remove their
   * entries from the reverse mapping.  Also cancels any in-flight discovery
   * so that watchers are not started for a deleted workspace.
   */
  async function stopGitWatchersForWorkspace(workspaceId: string): Promise<void> {
    cancelledDiscovery.set(workspaceId, true);
    if (!gitStatusWatcher || !watchedGitDirs) return;
    // Collect keys first, then iterate to avoid mutation-while-iterating issues
    const toRemove: string[] = [];
    for (const [repoRootKey, info] of watchedGitDirs) {
      if (info.workspaceId === workspaceId) {
        toRemove.push(repoRootKey);
      }
    }
    for (const repoRootKey of toRemove) {
      await gitStatusWatcher.unwatchRepo(repoRootKey);
      watchedGitDirs.delete(repoRootKey);
    }
  }

  // --- workspace.list -----------------------------------------------------
  router.handle('workspace.list', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope;

    const workspaces = doList(persistentDb);
    const summaries = workspaces.map(toSummary);

    const resp: ResponseEnvelope<WorkspaceListResponse> = createResponse(req, {
      workspaces: summaries,
    });

    conn.send(resp);
  });

  // --- workspace.create ---------------------------------------------------
  router.handle('workspace.create', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<WorkspaceCreateRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.name !== 'string' ||
      typeof payload.cwd !== 'string' ||
      typeof payload.color !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'workspace.create' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required fields: name, cwd, color',
      );
      conn.send(err);
      return;
    }

    const normalizedCwd = resolve(expandTilde(payload.cwd));

    const workspace = doCreate(persistentDb, {
      name: payload.name,
      cwd: normalizedCwd,
      color: payload.color,
    });

    // Auto-subscribe the creator to the new workspace
    conn.addWorkspace(workspace.id);

    doStartWatcher(workspace.id, workspace.cwd, deps.broadcastEvent);

    // Fire-and-forget git repo discovery and watcher setup
    startGitWatchersForWorkspace(workspace.id, workspace.cwd);

    const resp: ResponseEnvelope<WorkspaceCreateResponse> = createResponse(req, {
      workspace: toSummary(workspace),
    });

    conn.send(resp);
  });

  // --- workspace.update ---------------------------------------------------
  router.handle('workspace.update', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<WorkspaceUpdateRequest>;
    const payload = req.payload;

    if (payload == null || typeof payload !== 'object' || typeof payload.id !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'workspace.update' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: id',
      );
      conn.send(err);
      return;
    }

    // Capture existing workspace before update to detect cwd changes
    const existing = doGet(persistentDb, payload.id);

    // Build update input from only the provided optional fields
    const input: UpdateWorkspaceInput = {};
    if (payload.name !== undefined) input.name = payload.name;
    if (payload.cwd !== undefined) input.cwd = resolve(expandTilde(payload.cwd));
    if (payload.color !== undefined) input.color = payload.color;

    const workspace = doUpdate(persistentDb, payload.id, input);

    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'workspace.update' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.id}`,
      );
      conn.send(err);
      return;
    }

    // If cwd changed, restart the file watcher and git watchers on the new directory
    const cwdChanged = existing != null && input.cwd !== undefined && input.cwd !== existing.cwd;
    if (cwdChanged) {
      doStopWatcher(payload.id);
      doStartWatcher(payload.id, workspace.cwd, deps.broadcastEvent);

      // Restart git watchers for the new cwd
      await stopGitWatchersForWorkspace(payload.id);
      startGitWatchersForWorkspace(payload.id, workspace.cwd);
    }

    const resp: ResponseEnvelope = createResponse(req, {
      workspace: toSummary(workspace),
    });

    conn.send(resp);
  });

  // --- workspace.delete ---------------------------------------------------
  router.handle('workspace.delete', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<WorkspaceDeleteRequest>;
    const payload = req.payload;

    if (payload == null || typeof payload !== 'object' || typeof payload.id !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'workspace.delete' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: id',
      );
      conn.send(err);
      return;
    }

    // Stop watchers before deleting the workspace record
    const existing = doGet(persistentDb, payload.id);
    if (existing) {
      doStopWatcher(payload.id);
      await stopGitWatchersForWorkspace(payload.id);
    }

    // Clean up orphaned persisted tabs for this workspace
    doDeletePersistedTabs(persistentDb, payload.id);

    const deleted = doDelete(persistentDb, payload.id);

    if (!deleted) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'workspace.delete' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.id}`,
      );
      conn.send(err);
      return;
    }

    const resp: ResponseEnvelope = createResponse(req, { deleted: true });

    conn.send(resp);
  });

  // --- workspace.reorder --------------------------------------------------
  router.handle('workspace.reorder', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<WorkspaceReorderRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      !Array.isArray(payload.workspaceIds) ||
      payload.workspaceIds.length === 0 ||
      !payload.workspaceIds.every((id: unknown) => typeof id === 'string')
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'workspace.reorder' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: workspaceIds (non-empty string array)',
      );
      conn.send(err);
      return;
    }

    doReorder(persistentDb, payload.workspaceIds);

    const resp: ResponseEnvelope = createResponse(req, null);
    conn.send(resp);
  });

  // --- workspace.subscribe -------------------------------------------------
  router.handle(
    'workspace.subscribe',
    async (conn: ClientConnection, envelope: MessageEnvelope) => {
      const req = envelope as RequestEnvelope<WorkspaceSubscribeRequest>;
      const payload = req.payload;

      if (
        payload == null ||
        typeof payload !== 'object' ||
        typeof payload.workspaceId !== 'string'
      ) {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel: req.channel ?? 'workspace.subscribe' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing required field: workspaceId',
        );
        conn.send(err);
        return;
      }

      conn.addWorkspace(payload.workspaceId);

      const resp: ResponseEnvelope = createResponse(req, null);
      conn.send(resp);
    },
  );

  // --- workspace.unsubscribe -----------------------------------------------
  router.handle(
    'workspace.unsubscribe',
    async (conn: ClientConnection, envelope: MessageEnvelope) => {
      const req = envelope as RequestEnvelope<WorkspaceUnsubscribeRequest>;
      const payload = req.payload;

      if (
        payload == null ||
        typeof payload !== 'object' ||
        typeof payload.workspaceId !== 'string'
      ) {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel: req.channel ?? 'workspace.unsubscribe' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing required field: workspaceId',
        );
        conn.send(err);
        return;
      }

      conn.removeWorkspace(payload.workspaceId);

      const resp: ResponseEnvelope = createResponse(req, null);
      conn.send(resp);
    },
  );
}
