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
  type WorkspaceSummary,
  type WorkspaceUpdateRequest,
} from '@ymir/shared';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { ClientConnection } from '../connection';
import { createError, createResponse, type MessageRouter } from '../router';
import {
  listWorkspaces as dbListWorkspaces,
  createWorkspace as dbCreateWorkspace,
  updateWorkspace as dbUpdateWorkspace,
  deleteWorkspace as dbDeleteWorkspace,
  getWorkspace as dbGetWorkspace,
  reorderWorkspaces as dbReorderWorkspaces,
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
  /** Map tracking git dir → workspace metadata (shared with git handlers). */
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
    discoverRepos?: (workspaceCwd: string, maxDepth?: number) => Promise<GitRepoInfo[]>;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip timestamp fields to produce a WorkspaceSummary. */
function toSummary(ws: Workspace): WorkspaceSummary {
  return {
    id: ws.id,
    name: ws.name,
    cwd: ws.cwd,
    color: ws.color,
    sortOrder: ws.sort_order,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorkspaceHandlers(router: MessageRouter, deps: WorkspaceDeps): void {
  const { persistentDb, _mocks } = deps;

  const doList = _mocks?.listWorkspaces ?? dbListWorkspaces;
  const doCreate = _mocks?.createWorkspace ?? dbCreateWorkspace;
  const doUpdate = _mocks?.updateWorkspace ?? dbUpdateWorkspace;
  const doDelete = _mocks?.deleteWorkspace ?? dbDeleteWorkspace;
  const doGet = _mocks?.getWorkspace ?? dbGetWorkspace;
  const doStartWatcher = _mocks?.startManagedWatcher ?? startManagedWatcher;
  const doStopWatcher = _mocks?.stopManagedWatcher ?? stopManagedWatcher;
  const doReorder = _mocks?.reorderWorkspaces ?? dbReorderWorkspaces;
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
    doDiscoverRepos(cwd)
      .then((repos) => {
        if (cancelledDiscovery.get(workspaceId)) {
          cancelledDiscovery.delete(workspaceId);
          return;
        }
        for (const repo of repos) {
          const repoRoot = join(cwd, repo.path);
          const gitDirPath = join(repoRoot, '.git');
          if (existsSync(gitDirPath)) {
            gitStatusWatcher.watchRepo(gitDirPath, repoRoot);
            watchedGitDirs.set(gitDirPath, { workspaceId, repoPath: repo.path });
          }
        }
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
  function stopGitWatchersForWorkspace(workspaceId: string): void {
    cancelledDiscovery.set(workspaceId, true);
    if (!gitStatusWatcher || !watchedGitDirs) return;
    // Collect keys first, then iterate to avoid mutation-while-iterating issues
    const toRemove: string[] = [];
    for (const [gitDir, info] of watchedGitDirs) {
      if (info.workspaceId === workspaceId) {
        toRemove.push(gitDir);
      }
    }
    for (const gitDir of toRemove) {
      gitStatusWatcher.unwatchRepo(gitDir);
      watchedGitDirs.delete(gitDir);
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
      stopGitWatchersForWorkspace(payload.id);
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
      stopGitWatchersForWorkspace(payload.id);
    }

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
}
