import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type GitStatusRequest,
  type GitStatusResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import {
  createError,
  createResponse,
  type MessageRouter,
} from '../router';
import { getGitStatus as nativeGetGitStatus, type GitStatusResult } from '../../git/status';
import type { Database } from 'bun:sqlite';
import type { Workspace } from '../../db/persistent';
import { getWorkspace as dbGetWorkspace } from '../../db/persistent';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface GitDeps {
  persistentDb: Database;
  /** Internal: allows tests to inject mock functions. */
  _mocks?: {
    getGitStatus?: (dirPath: string) => GitStatusResult | null;
    getWorkspace?: (db: Database, id: string) => Workspace | null;
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGitHandlers(
  router: MessageRouter,
  deps: GitDeps,
): void {
  const doGetGitStatus = deps._mocks?.getGitStatus ?? nativeGetGitStatus;
  const doGetWorkspace = deps._mocks?.getWorkspace ?? dbGetWorkspace;

  // --- git.status ---------------------------------------------------------
  router.handle('git.status', async (conn: unknown, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitStatusRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'git.status' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: workspaceId',
      );
      (conn as ClientConnection).send(err);
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'git.status' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      (conn as ClientConnection).send(err);
      return;
    }

    const result = doGetGitStatus(workspace.cwd);

    const resp: ResponseEnvelope<GitStatusResponse> = createResponse(req, {
      branch: result?.branch ?? null,
      changes: result?.changes ?? [],
      staged: result?.staged ?? [],
    } satisfies GitStatusResponse);

    (conn as ClientConnection).send(resp);
  });
}
