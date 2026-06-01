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
import { resolve } from 'node:path';
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
import type { Database } from 'bun:sqlite';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface WorkspaceDeps {
  persistentDb: Database;
  sessionDb: Database;
  /** Broadcast an event envelope to all authenticated connected clients. */
  broadcastEvent: (envelope: EventEnvelope) => void;
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

    // If cwd changed, restart the file watcher on the new directory
    const cwdChanged = existing != null && input.cwd !== undefined && input.cwd !== existing.cwd;
    if (cwdChanged) {
      doStopWatcher(payload.id);
      doStartWatcher(payload.id, workspace.cwd, deps.broadcastEvent);
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

    // Stop watcher before deleting the workspace record
    const existing = doGet(persistentDb, payload.id);
    if (existing) {
      doStopWatcher(payload.id);
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
