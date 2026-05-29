import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type FileWriteRequest,
  type FileDeleteRequest,
  type FileRenameRequest,
  type FileCreateRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse } from '../../router';
import * as fileOps from '../../../files/operations';
import { safePath, resolveWorkspace, type FileDeps } from './shared';

// ---------------------------------------------------------------------------
// Registration — create, write, delete, rename handlers
// ---------------------------------------------------------------------------

export function registerCrudHandlers(
  router: import('../../router').MessageRouter,
  deps: FileDeps,
): void {
  const { operations: ops } = deps;
  const doWrite = ops.writeFile ?? fileOps.writeFile;
  const doDelete = ops.deleteFile ?? fileOps.deleteFile;
  const doRename = ops.renameFile ?? fileOps.renameFile;
  const doCreateFile = ops.createFile ?? fileOps.createFile;
  const doCreateDir = ops.createDirectory ?? fileOps.createDirectory;

  // --- file.write ---------------------------------------------------------
  router.handle('file.write', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileWriteRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.path !== 'string' ||
      typeof payload.content !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.write' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required fields: workspaceId, path, content',
      );
      conn.send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as unknown as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.write' },
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
        { id: req.id, channel: req.channel ?? 'file.write' },
        ErrorCodes.PERMISSION_DENIED,
        'Path traversal detected',
      );
      conn.send(err);
      return;
    }

    doWrite(resolvedPath, payload.content);

    const resp: ResponseEnvelope = createResponse(req, { success: true });
    conn.send(resp);
  });

  // --- file.delete --------------------------------------------------------
  router.handle('file.delete', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileDeleteRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.path !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.delete' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required fields: workspaceId, path',
      );
      conn.send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as unknown as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.delete' },
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
        { id: req.id, channel: req.channel ?? 'file.delete' },
        ErrorCodes.PERMISSION_DENIED,
        'Path traversal detected',
      );
      conn.send(err);
      return;
    }

    doDelete(resolvedPath);

    const resp: ResponseEnvelope = createResponse(req, { success: true });
    conn.send(resp);
  });

  // --- file.rename --------------------------------------------------------
  router.handle('file.rename', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileRenameRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.oldPath !== 'string' ||
      typeof payload.newPath !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.rename' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required fields: workspaceId, oldPath, newPath',
      );
      conn.send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as unknown as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.rename' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      conn.send(err);
      return;
    }

    let resolvedOldPath: string;
    let resolvedNewPath: string;
    try {
      resolvedOldPath = safePath(workspace.cwd, payload.oldPath);
      resolvedNewPath = safePath(workspace.cwd, payload.newPath);
    } catch {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.rename' },
        ErrorCodes.PERMISSION_DENIED,
        'Path traversal detected',
      );
      conn.send(err);
      return;
    }

    doRename(resolvedOldPath, resolvedNewPath);

    const resp: ResponseEnvelope = createResponse(req, { success: true });
    conn.send(resp);
  });

  // --- file.create --------------------------------------------------------
  router.handle('file.create', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileCreateRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.path !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.create' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required fields: workspaceId, path',
      );
      conn.send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as unknown as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.create' },
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
        { id: req.id, channel: req.channel ?? 'file.create' },
        ErrorCodes.PERMISSION_DENIED,
        'Path traversal detected',
      );
      conn.send(err);
      return;
    }

    if (payload.isDirectory) {
      doCreateDir(resolvedPath);
    } else {
      doCreateFile(resolvedPath);
    }

    const resp: ResponseEnvelope = createResponse(req, { success: true });
    conn.send(resp);
  });
}
