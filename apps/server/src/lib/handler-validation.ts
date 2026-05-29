import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { ErrorCodes, type RequestEnvelope, type ResponseEnvelope } from '@ymir/shared';
import type { ClientConnection } from '../ws/connection';
import type { Database } from '../db/session';
import { createError } from '../ws/router';
import type { Workspace } from '../db/persistent';
import { getWorkspace as dbGetWorkspace } from '../db/persistent';
import { getTerminalInstance } from '../db/session';

// ---------------------------------------------------------------------------
// Terminal ownership validation
// ---------------------------------------------------------------------------

/**
 * Result of a successful {@link validateTerminalOwnership} call.
 */
export interface TerminalOwnershipResult {
  /** The terminal instance DB row. */
  instance: Record<string, unknown>;
}

/**
 * Validate that a terminal exists and belongs to the requesting session.
 *
 * If validation fails the appropriate error is sent on `conn` and `null` is
 * returned so the caller can early-return.
 */
export function validateTerminalOwnership(
  sessionDb: Database,
  terminalId: string,
  sessionId: string,
  conn: ClientConnection,
  req: Pick<RequestEnvelope, 'id' | 'channel'>,
): TerminalOwnershipResult | null {
  const instance = getTerminalInstance(sessionDb, terminalId);
  if (!instance) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.TERMINAL_NOT_FOUND,
      `Terminal not found: ${terminalId}`,
    );
    conn.send(err);
    return null;
  }

  if (instance.session_id !== sessionId) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.PERMISSION_DENIED,
      'Terminal does not belong to this session',
    );
    conn.send(err);
    return null;
  }

  return { instance };
}

// ---------------------------------------------------------------------------
// Safe-path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a user-supplied path relative to `workspaceCwd`, guarding against
 * path-traversal attacks.
 *
 * @throws {Error} When the resolved path escapes the workspace root.
 */
export function safePath(workspaceCwd: string, userInput: string): string {
  const resolved = resolve(workspaceCwd, userInput);
  const normalizedCwd = resolve(workspaceCwd);

  try {
    const realResolved = realpathSync(resolved);
    const realCwd = realpathSync(normalizedCwd);
    if (!realResolved.startsWith(realCwd + '/') && realResolved !== realCwd) {
      throw new Error('Path traversal detected');
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'Path traversal detected') throw e;
    if (!resolved.startsWith(normalizedCwd + '/') && resolved !== normalizedCwd) {
      throw new Error('Path traversal detected');
    }
  }

  return resolved;
}

/**
 * Resolve a safe path or send a PERMISSION_DENIED error to the client.
 *
 * @returns The resolved absolute path, or `null` if an error was sent.
 */
export function resolveSafePathOrError(
  conn: ClientConnection,
  req: Pick<RequestEnvelope, 'id' | 'channel'>,
  workspaceCwd: string,
  userInput: string,
): string | null {
  try {
    return safePath(workspaceCwd, userInput);
  } catch {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.PERMISSION_DENIED,
      'Path traversal detected',
    );
    conn.send(err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Workspace resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a workspace from a handler payload.
 *
 * Extracts `workspaceId` from `payload`, looks it up via the persistent DB, and
 * returns the workspace record. On failure the appropriate error is sent on
 * `conn` and `null` is returned.
 */
export function resolveWorkspaceOrError(
  conn: ClientConnection,
  req: Pick<RequestEnvelope, 'id' | 'channel'>,
  persistentDb: Database,
  payload: Record<string, unknown>,
  getWorkspace: (db: Database, id: string) => Workspace | null = dbGetWorkspace,
): Workspace | null {
  const wsId = payload.workspaceId;
  if (typeof wsId !== 'string' || wsId.length === 0) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.WORKSPACE_NOT_FOUND,
      'Missing or invalid workspaceId',
    );
    conn.send(err);
    return null;
  }

  const workspace = getWorkspace(persistentDb, wsId);
  if (!workspace) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.WORKSPACE_NOT_FOUND,
      `Workspace not found: ${wsId}`,
    );
    conn.send(err);
    return null;
  }

  return workspace;
}
