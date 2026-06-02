import { ErrorCodes, type RequestEnvelope, type ResponseEnvelope } from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse } from '../../router';
import type { Database } from 'bun:sqlite';
import type { Workspace } from '../../../db/persistent';
import { safePath } from '../../../lib/handler-validation';

// ---------------------------------------------------------------------------
// Re-exports consumed by domain sub-modules
// ---------------------------------------------------------------------------

export type { ClientConnection } from '../../connection';
export type { RequestEnvelope, ResponseEnvelope } from '@ymir/shared';
export { createError, createResponse, type MessageRouter } from '../../router';
export type { Database } from 'bun:sqlite';
export type { Workspace } from '../../../db/persistent';
export { safePath } from '../../../lib/handler-validation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SHA_REGEX = /^[0-9a-f]{4,64}$/i;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Resolve `userInput` within `workspaceCwd`, sending a path-traversal error
 * to the client if validation fails.
 *
 * @returns The resolved absolute path, or `null` if traversal was detected
 *          (an error response is sent on `conn`).
 */
export function resolveSafeRepoPath(
  workspaceCwd: string,
  repoPath: string | undefined | null,
  conn: ClientConnection,
  req: Pick<RequestEnvelope, 'id' | 'channel'>,
  channel: string,
): string | null {
  if (!repoPath) return workspaceCwd;
  try {
    return safePath(workspaceCwd, repoPath);
  } catch {
    conn.send(
      createError(
        { id: req.id, channel: req.channel ?? channel },
        ErrorCodes.PERMISSION_DENIED,
        'Path traversal detected',
      ),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generic git-request handler
// ---------------------------------------------------------------------------

/**
 * Common validate→workspace→operation pipeline shared by git handlers.
 *
 * 1. Validates that every field in `requiredFields` is present as a string
 *    on the payload.
 * 2. Looks up the workspace via `deps.getWorkspace`.
 * 3. Calls `operation(workspace, payload)` on success.
 * 4. Catches errors and sends an `INTERNAL_ERROR` response.
 *
 * The caller is responsible for sending the success response inside
 * `operation` (different handlers have different response shapes).
 */
export async function handleGitRequest(
  conn: ClientConnection,
  req: RequestEnvelope,
  deps: { persistentDb: Database; getWorkspace: (db: Database, id: string) => Workspace | null },
  requiredFields: string[],
  channel: string,
  operation: (workspace: Workspace, payload: any) => Promise<void>,
): Promise<void> {
  const payload = req.payload as Record<string, unknown> | null;

  // 1. Validate required fields are present strings
  if (
    payload == null ||
    typeof payload !== 'object' ||
    !requiredFields.every((f) => typeof (payload as Record<string, unknown>)[f] === 'string')
  ) {
    const err: ResponseEnvelope = createError(
      { id: req.id, channel: req.channel ?? channel },
      ErrorCodes.INVALID_MESSAGE,
      `Missing required fields: ${requiredFields.join(', ')}`,
    );
    conn.send(err);
    return;
  }

  // 2. Lookup workspace
  const workspace = deps.getWorkspace(deps.persistentDb, payload.workspaceId as string);
  if (!workspace) {
    const err: ResponseEnvelope = createError(
      { id: req.id, channel: req.channel ?? channel },
      ErrorCodes.WORKSPACE_NOT_FOUND,
      `Workspace not found: ${payload.workspaceId}`,
    );
    conn.send(err);
    return;
  }

  // 3. Execute operation
  try {
    await operation(workspace, payload);
  } catch (err) {
    conn.send(
      createError(
        { id: req.id, channel: req.channel ?? channel },
        ErrorCodes.INTERNAL_ERROR,
        err instanceof Error ? err.message : 'Internal error',
      ),
    );
  }
}
