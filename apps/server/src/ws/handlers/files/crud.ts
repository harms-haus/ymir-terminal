import { basename, join } from 'node:path';
import { stat } from 'node:fs/promises';
import {
  type MessageEnvelope,
  type RequestEnvelope,
  type FileWriteRequest,
  type FileDeleteRequest,
  type FileRenameRequest,
  type FileCreateRequest,
  type FileCopyRequest,
  type FileMoveRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import * as fileOps from '../../../files/operations';
import { type FileDeps, handleFileRequest } from './shared';
import type { MessageRouter } from '../../router';

// ---------------------------------------------------------------------------
// Registration — create, write, delete, rename, copy, move handlers
// ---------------------------------------------------------------------------

export function registerCrudHandlers(
  router: MessageRouter,
  deps: FileDeps,
): void {
  const { operations: ops } = deps;
  const doWrite = ops.writeFile ?? fileOps.writeFile;
  const doDelete = ops.deleteFile ?? fileOps.deleteFile;
  const doRename = ops.renameFile ?? fileOps.renameFile;
  const doCreateFile = ops.createFile ?? fileOps.createFile;
  const doCreateDir = ops.createDirectory ?? fileOps.createDirectory;
  const doCopyFile = ops.copyFile ?? fileOps.copyFile;
  const doCopyDir = ops.copyDirectory ?? fileOps.copyDirectory;
  const doFindName = ops.findAvailableName ?? fileOps.findAvailableName;

  // --- file.write ---------------------------------------------------------
  router.handle('file.write', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileWriteRequest>;
    await handleFileRequest(
      conn,
      req,
      deps,
      req.payload as unknown as Record<string, unknown>,
      ['workspaceId', 'path', 'content'],
      ['path'],
      async ({ path }) => {
        await doWrite(path, req.payload.content);
      },
    );
  });

  // --- file.delete --------------------------------------------------------
  router.handle('file.delete', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileDeleteRequest>;
    await handleFileRequest(
      conn,
      req,
      deps,
      req.payload as unknown as Record<string, unknown>,
      ['workspaceId', 'path'],
      ['path'],
      async ({ path }) => {
        await doDelete(path);
      },
    );
  });

  // --- file.rename --------------------------------------------------------
  router.handle('file.rename', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileRenameRequest>;
    await handleFileRequest(
      conn,
      req,
      deps,
      req.payload as unknown as Record<string, unknown>,
      ['workspaceId', 'oldPath', 'newPath'],
      ['oldPath', 'newPath'],
      async ({ oldPath, newPath }) => {
        await doRename(oldPath, newPath);
      },
    );
  });

  // --- file.create --------------------------------------------------------
  router.handle('file.create', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileCreateRequest>;
    await handleFileRequest(
      conn,
      req,
      deps,
      req.payload as unknown as Record<string, unknown>,
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

  // --- file.copy ----------------------------------------------------------
  router.handle('file.copy', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileCopyRequest>;
    await handleFileRequest(
      conn,
      req,
      deps,
      req.payload as unknown as Record<string, unknown>,
      ['workspaceId', 'srcPath', 'destDir'],
      ['srcPath', 'destDir'],
      async ({ srcPath, destDir: resolvedDestDir }) => {
        // Guard against copying into self or a descendant
        if (resolvedDestDir.startsWith(srcPath + '/')) {
          throw new Error('Cannot copy into a subdirectory of the source');
        }
        const baseName = basename(srcPath);
        const availableName = await doFindName(resolvedDestDir, baseName);
        const fullDestPath = join(resolvedDestDir, availableName);
        const srcStat = await stat(srcPath);
        if (srcStat.isDirectory()) {
          await doCopyDir(srcPath, fullDestPath);
        } else {
          await doCopyFile(srcPath, fullDestPath);
        }
      },
    );
  });

  // --- file.move ----------------------------------------------------------
  router.handle('file.move', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileMoveRequest>;
    await handleFileRequest(
      conn,
      req,
      deps,
      req.payload as unknown as Record<string, unknown>,
      ['workspaceId', 'srcPath', 'destDir'],
      ['srcPath', 'destDir'],
      async ({ srcPath, destDir: resolvedDestDir }) => {
        // Guard against moving into self or a descendant
        if (resolvedDestDir.startsWith(srcPath + '/')) {
          throw new Error('Cannot move into a subdirectory of the source');
        }
        const baseName = basename(srcPath);
        const availableName = await doFindName(resolvedDestDir, baseName);
        const fullDestPath = join(resolvedDestDir, availableName);
        await doRename(srcPath, fullDestPath);
      },
    );
  });
}
