import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type GitStatusRequest,
  type GitStatusResponse,
  type GitLogRequest,
  type GitLogResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import { createError, createResponse, type MessageRouter } from '../router';
import { getGitStatus as nativeGetGitStatus } from '../../git/status';
import { getGitLog as nativeGetGitLog } from '../../git/log';
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
    getGitStatus?: (dirPath: string) => Promise<GitStatusResponse | null>;
    getGitLog?: (dirPath: string, skip: number, limit: number) => Promise<import('@ymir/shared').GitLogItem[]>;
    getWorkspace?: (db: Database, id: string) => Workspace | null;
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGitHandlers(router: MessageRouter, deps: GitDeps): void {
  const doGetGitStatus = deps._mocks?.getGitStatus ?? nativeGetGitStatus;
  const doGetGitLog = deps._mocks?.getGitLog ?? nativeGetGitLog;
  const doGetWorkspace = deps._mocks?.getWorkspace ?? dbGetWorkspace;

  // --- git.status ---------------------------------------------------------
  router.handle('git.status', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'git.status' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      conn.send(err);
      return;
    }

    const result = await doGetGitStatus(workspace.cwd);

    const resp: ResponseEnvelope<GitStatusResponse> = createResponse(req, {
      branch: result?.branch ?? null,
      changes: result?.changes ?? [],
      staged: result?.staged ?? [],
    } satisfies GitStatusResponse);

    conn.send(resp);
  });

  // --- git.log -----------------------------------------------------------
  router.handle('git.log', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitLogRequest>;
    const payload = req.payload;

    if (!payload || typeof payload.workspaceId !== 'string') {
      conn.send(createError(
        { id: req.id, channel: req.channel ?? 'git.log' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid workspaceId',
      ));
      return;
    }

    if (typeof payload.skip !== 'number' || typeof payload.limit !== 'number') {
      conn.send(createError(
        { id: req.id, channel: req.channel ?? 'git.log' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid skip/limit',
      ));
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(createError(
        { id: req.id, channel: req.channel ?? 'git.log' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        'Workspace not found',
      ));
      return;
    }

    const limit = Math.min(Math.max(payload.limit, 1), 100);
    const skip = Math.max(payload.skip, 0);
    const commits = await doGetGitLog(workspace.cwd, skip, limit);
    const hasMore = commits.length === limit;

    const resp = createResponse(req, { commits, hasMore } satisfies GitLogResponse);
    conn.send(resp);
  });
}
