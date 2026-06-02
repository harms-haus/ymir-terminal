import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type FileTreeRequest,
  type FileTreeResponse,
  type FileReadRequest,
  type FileReadResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse } from '../../router';
import { scanDirectory } from '../../../files/scanner';
import * as fileOps from '../../../files/operations';
import { detectLanguage } from './language';
import { safePath, resolveWorkspace, type FileDeps } from './shared';
import type { MessageRouter } from '../../router';

// ---------------------------------------------------------------------------
// Registration — tree & read handlers
// ---------------------------------------------------------------------------

export function registerTreeHandlers(
  router: MessageRouter,
  deps: FileDeps,
): void {
  const { scanner: scannerMod, operations: ops } = deps;
  const doScan = scannerMod.scanDirectory ?? scanDirectory;
  const doRead = ops.readFile ?? fileOps.readFile;

  // --- file.tree ----------------------------------------------------------
  router.handle('file.tree', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileTreeRequest>;
    const payload = req.payload;

    if (payload == null || typeof payload !== 'object' || typeof payload.workspaceId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.tree' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: workspaceId',
      );
      conn.send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as unknown as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.tree' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      conn.send(err);
      return;
    }

    let scanRoot = workspace.cwd;
    if (typeof payload.path === 'string') {
      try {
        scanRoot = safePath(workspace.cwd, payload.path);
      } catch {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel: req.channel ?? 'file.tree' },
          ErrorCodes.PERMISSION_DENIED,
          'Path traversal detected',
        );
        conn.send(err);
        return;
      }
    }

    const tree = await doScan(scanRoot, { includeHidden: payload.includeHidden });

    const resp: ResponseEnvelope<FileTreeResponse> = createResponse(req, {
      tree,
    } satisfies FileTreeResponse);

    conn.send(resp);
  });

  // --- file.read ----------------------------------------------------------
  router.handle('file.read', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileReadRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.path !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.read' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required fields: workspaceId, path',
      );
      conn.send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as unknown as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.read' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      conn.send(err);
      return;
    }

    let resolvedPath: string;
    try {
      resolvedPath = safePath(workspace.cwd, payload.path);
    } catch {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.read' },
        ErrorCodes.PERMISSION_DENIED,
        'Path traversal detected',
      );
      conn.send(err);
      return;
    }

    const content = await doRead(resolvedPath);
    const language = detectLanguage(resolvedPath);

    const resp: ResponseEnvelope<FileReadResponse> = createResponse(req, {
      content,
      language,
    } satisfies FileReadResponse);

    conn.send(resp);
  });
}
