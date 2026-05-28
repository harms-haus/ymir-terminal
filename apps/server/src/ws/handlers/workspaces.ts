import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type WorkspaceCreateRequest,
  type WorkspaceCreateResponse,
  type WorkspaceDeleteRequest,
  type WorkspaceListResponse,
  type WorkspaceSummary,
  type WorkspaceUpdateRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import {
  createError,
  createResponse,
  type MessageRouter,
} from '../router';
import {
  listWorkspaces as dbListWorkspaces,
  createWorkspace as dbCreateWorkspace,
  updateWorkspace as dbUpdateWorkspace,
  deleteWorkspace as dbDeleteWorkspace,
  type Workspace,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
} from '../../db/persistent';
import type { Database } from 'bun:sqlite';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface WorkspaceDeps {
  persistentDb: Database;
  sessionDb: Database;
  /** Internal: allows tests to inject mock CRUD functions. */
  _mocks?: {
    listWorkspaces?: (db: Database) => Workspace[];
    createWorkspace?: (db: Database, input: CreateWorkspaceInput) => Workspace;
    updateWorkspace?: (
      db: Database,
      id: string,
      input: UpdateWorkspaceInput,
    ) => Workspace | null;
    deleteWorkspace?: (db: Database, id: string) => boolean;
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
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorkspaceHandlers(
  router: MessageRouter,
  deps: WorkspaceDeps,
): void {
  const { persistentDb, _mocks } = deps;

  const doList = _mocks?.listWorkspaces ?? dbListWorkspaces;
  const doCreate = _mocks?.createWorkspace ?? dbCreateWorkspace;
  const doUpdate = _mocks?.updateWorkspace ?? dbUpdateWorkspace;
  const doDelete = _mocks?.deleteWorkspace ?? dbDeleteWorkspace;

  // --- workspace.list -----------------------------------------------------
  router.handle(
    'workspace.list',
    async (conn: unknown, envelope: MessageEnvelope) => {
      const req = envelope as RequestEnvelope;

      const workspaces = doList(persistentDb);
      const summaries = workspaces.map(toSummary);

      const resp: ResponseEnvelope<WorkspaceListResponse> = createResponse(req, {
        workspaces: summaries,
      });

      (conn as ClientConnection).send(resp);
    },
  );

  // --- workspace.create ---------------------------------------------------
  router.handle(
    'workspace.create',
    async (conn: unknown, envelope: MessageEnvelope) => {
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
        (conn as ClientConnection).send(err);
        return;
      }

      const workspace = doCreate(persistentDb, {
        name: payload.name,
        cwd: payload.cwd,
        color: payload.color,
      });

      const resp: ResponseEnvelope<WorkspaceCreateResponse> = createResponse(
        req,
        { workspace: toSummary(workspace) },
      );

      (conn as ClientConnection).send(resp);
    },
  );

  // --- workspace.update ---------------------------------------------------
  router.handle(
    'workspace.update',
    async (conn: unknown, envelope: MessageEnvelope) => {
      const req = envelope as RequestEnvelope<WorkspaceUpdateRequest>;
      const payload = req.payload;

      if (
        payload == null ||
        typeof payload !== 'object' ||
        typeof payload.id !== 'string'
      ) {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel: req.channel ?? 'workspace.update' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing required field: id',
        );
        (conn as ClientConnection).send(err);
        return;
      }

      // Build update input from only the provided optional fields
      const input: UpdateWorkspaceInput = {};
      if (payload.name !== undefined) input.name = payload.name;
      if (payload.cwd !== undefined) input.cwd = payload.cwd;
      if (payload.color !== undefined) input.color = payload.color;

      const workspace = doUpdate(persistentDb, payload.id, input);

      if (!workspace) {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel: req.channel ?? 'workspace.update' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.id}`,
        );
        (conn as ClientConnection).send(err);
        return;
      }

      const resp: ResponseEnvelope = createResponse(req, {
        workspace: toSummary(workspace),
      });

      (conn as ClientConnection).send(resp);
    },
  );

  // --- workspace.delete ---------------------------------------------------
  router.handle(
    'workspace.delete',
    async (conn: unknown, envelope: MessageEnvelope) => {
      const req = envelope as RequestEnvelope<WorkspaceDeleteRequest>;
      const payload = req.payload;

      if (
        payload == null ||
        typeof payload !== 'object' ||
        typeof payload.id !== 'string'
      ) {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel: req.channel ?? 'workspace.delete' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing required field: id',
        );
        (conn as ClientConnection).send(err);
        return;
      }

      const deleted = doDelete(persistentDb, payload.id);

      if (!deleted) {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel: req.channel ?? 'workspace.delete' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.id}`,
        );
        (conn as ClientConnection).send(err);
        return;
      }

      const resp: ResponseEnvelope = createResponse(req, { deleted: true });

      (conn as ClientConnection).send(resp);
    },
  );
}
