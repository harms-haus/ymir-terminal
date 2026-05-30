import {
  type MessageEnvelope,
  type RequestEnvelope,
  type FileWriteRequest,
  type FileDeleteRequest,
  type FileRenameRequest,
  type FileCreateRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import * as fileOps from '../../../files/operations';
import { type FileDeps, handleFileRequest } from './shared';

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
    await handleFileRequest(
      conn, req, deps, req.payload as unknown as Record<string, unknown>,
      ['workspaceId', 'path', 'content'],
      ['path'],
      async ({ path }) => { await doWrite(path, req.payload.content); },
    );
  });

  // --- file.delete --------------------------------------------------------
  router.handle('file.delete', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileDeleteRequest>;
    await handleFileRequest(
      conn, req, deps, req.payload as unknown as Record<string, unknown>,
      ['workspaceId', 'path'],
      ['path'],
      async ({ path }) => { await doDelete(path); },
    );
  });

  // --- file.rename --------------------------------------------------------
  router.handle('file.rename', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileRenameRequest>;
    await handleFileRequest(
      conn, req, deps, req.payload as unknown as Record<string, unknown>,
      ['workspaceId', 'oldPath', 'newPath'],
      ['oldPath', 'newPath'],
      async ({ oldPath, newPath }) => { await doRename(oldPath, newPath); },
    );
  });

  // --- file.create --------------------------------------------------------
  router.handle('file.create', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileCreateRequest>;
    await handleFileRequest(
      conn, req, deps, req.payload as unknown as Record<string, unknown>,
      ['workspaceId', 'path'],
      ['path'],
      async ({ path }) => {
        if (req.payload.isDirectory) {
          await doCreateDir(path);
        } else {
          await doCreateFile(path);
        }
      },
    );
  });
}
