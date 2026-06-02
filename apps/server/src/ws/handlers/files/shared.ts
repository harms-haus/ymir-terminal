import type { Database } from 'bun:sqlite';
import type { Workspace } from '../../../db/persistent';
import { getWorkspace as dbGetWorkspace } from '../../../db/persistent';
import { safePath as _safePath } from '../../../lib/handler-validation';
import { ErrorCodes, type RequestEnvelope, type ResponseEnvelope } from '@ymir/shared';
import type { ScanOptions } from '../../../files/scanner';
import type { FileNode } from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse } from '../../router';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface FileDeps {
  persistentDb: Database;
  scanner: {
    scanDirectory: (
      dirPath: string,
      options?: ScanOptions,
    ) => Promise<FileNode[]>;
  };
  operations: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    deleteFile: (path: string) => Promise<void>;
    renameFile: (oldPath: string, newPath: string) => Promise<void>;
    createFile: (path: string) => Promise<void>;
    createDirectory: (path: string) => Promise<void>;
    copyFile: (srcPath: string, destPath: string) => Promise<void>;
    copyDirectory: (srcPath: string, destPath: string) => Promise<void>;
    findAvailableName: (dirPath: string, baseName: string) => Promise<string>;
  };
  /** Internal: allows tests to inject mock functions. */
  _mocks?: {
    getWorkspace?: (db: Database, id: string) => Workspace | null;
  };
}

// Re-export safePath from the centralized handler-validation module so that
// existing file-handler consumers can import it from this shared module.
export const safePath = _safePath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function resolveWorkspace(
  deps: FileDeps,
  payload: Record<string, unknown>,
): Workspace | null {
  const wsId = payload.workspaceId;
  if (typeof wsId !== 'string' || wsId.length === 0) return null;
  const getWs = deps._mocks?.getWorkspace ?? dbGetWorkspace;
  return getWs(deps.persistentDb, wsId);
}

// ---------------------------------------------------------------------------
// Generic file-request handler
// ---------------------------------------------------------------------------

/**
 * Common validate→workspace→safePath→execute→respond pipeline shared by all
 * CRUD file handlers.
 *
 * @param conn      The client connection (used to send responses).
 * @param req       The incoming request envelope.
 * @param deps      File-handler dependencies.
 * @param payload   The raw payload object to validate.
 * @param requiredFields  Field names that must be present as strings.
 * @param pathFields      Field names that must be resolved through `safePath`.
 *                        The resolved values are passed to `operation` keyed
 *                        by the same name (or `"path"` for the single-path
 *                        shorthand).
 * @param operation The business logic to run once all paths are resolved.
 */
export async function handleFileRequest(
  conn: ClientConnection,
  req: RequestEnvelope,
  deps: FileDeps,
  payload: Record<string, unknown>,
  requiredFields: string[],
  pathFields: string[],
  operation: (resolvedPaths: Record<string, string>) => void | Promise<void>,
): Promise<void> {
  const channel = req.channel ?? 'file';

  // 1. Validate required fields
  if (
    payload == null ||
    typeof payload !== 'object' ||
    !requiredFields.every((f) => typeof (payload as Record<string, unknown>)[f] === 'string')
  ) {
    const err: ResponseEnvelope = createError(
      { id: req.id, channel },
      ErrorCodes.INVALID_MESSAGE,
      `Missing required fields: ${requiredFields.join(', ')}`,
    );
    conn.send(err);
    return;
  }

  // 2. Resolve workspace
  const workspace = resolveWorkspace(deps, payload);
  if (!workspace) {
    const err: ResponseEnvelope = createError(
      { id: req.id, channel },
      ErrorCodes.WORKSPACE_NOT_FOUND,
      `Workspace not found: ${payload.workspaceId}`,
    );
    conn.send(err);
    return;
  }

  // 3. Resolve safe paths
  const resolvedPaths: Record<string, string> = {};
  try {
    for (const field of pathFields) {
      resolvedPaths[field] = safePath(
        workspace.cwd,
        (payload as Record<string, unknown>)[field] as string,
      );
    }
  } catch {
    const err: ResponseEnvelope = createError(
      { id: req.id, channel },
      ErrorCodes.PERMISSION_DENIED,
      'Path traversal detected',
    );
    conn.send(err);
    return;
  }

  // 4. Execute operation
  await operation(resolvedPaths);

  // 5. Send success response
  const resp: ResponseEnvelope = createResponse(req, { success: true });
  conn.send(resp);
}
