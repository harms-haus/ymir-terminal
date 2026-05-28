import { extname } from 'node:path';
import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type FileTreeRequest,
  type FileTreeResponse,
  type FileReadRequest,
  type FileReadResponse,
  type FileWriteRequest,
  type FileDeleteRequest,
  type FileRenameRequest,
  type FileCreateRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import {
  createError,
  createResponse,
  type MessageRouter,
} from '../router';
import { scanDirectory, type ScanFileNode } from '../../files/scanner';
import * as fileOps from '../../files/operations';
import type { Database } from 'bun:sqlite';
import type { Workspace } from '../../db/persistent';
import { getWorkspace as dbGetWorkspace } from '../../db/persistent';

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.htm': 'html',
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'bash',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.lua': 'lua',
  '.r': 'r',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.scala': 'scala',
  '.clj': 'clojure',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.zig': 'zig',
  '.nim': 'nim',
  '.dockerfile': 'dockerfile',
  '.ini': 'ini',
  '.conf': 'ini',
  '.csv': 'csv',
  '.txt': 'plaintext',
};

const FILENAME_MAP: Record<string, string> = {
  'Makefile': 'makefile',
  'Dockerfile': 'dockerfile',
  '.gitignore': 'plaintext',
  '.env': 'plaintext',
  '.eslintrc': 'json',
  '.prettierrc': 'json',
  'tsconfig.json': 'json',
  'package.json': 'json',
};

function detectLanguage(filePath: string): string {
  const basename = filePath.split('/').pop() ?? '';
  if (basename in FILENAME_MAP) {
    return FILENAME_MAP[basename];
  }
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'plaintext';
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface FileDeps {
  persistentDb: Database;
  scanner: {
    scanDirectory: (dirPath: string, options?: import('../../files/scanner').ScanOptions) => ScanFileNode[];
  };
  operations: {
    readFile: (path: string) => string;
    writeFile: (path: string, content: string) => void;
    deleteFile: (path: string) => void;
    renameFile: (oldPath: string, newPath: string) => void;
    createFile: (path: string) => void;
    createDirectory: (path: string) => void;
  };
  watcher: Record<string, unknown>;
  /** Internal: allows tests to inject mock functions. */
  _mocks?: {
    getWorkspace?: (db: Database, id: string) => Workspace | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWorkspace(
  deps: FileDeps,
  payload: Record<string, unknown>,
): Workspace | null {
  const wsId = payload.workspaceId;
  if (typeof wsId !== 'string' || wsId.length === 0) return null;
  const getWs = deps._mocks?.getWorkspace ?? dbGetWorkspace;
  return getWs(deps.persistentDb, wsId);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerFileHandlers(
  router: MessageRouter,
  deps: FileDeps,
): void {
  const { scanner: scannerMod, operations: ops } = deps;
  const doScan = scannerMod.scanDirectory ?? scanDirectory;
  const doRead = ops.readFile ?? fileOps.readFile;
  const doWrite = ops.writeFile ?? fileOps.writeFile;
  const doDelete = ops.deleteFile ?? fileOps.deleteFile;
  const doRename = ops.renameFile ?? fileOps.renameFile;
  const doCreateFile = ops.createFile ?? fileOps.createFile;
  const doCreateDir = ops.createDirectory ?? fileOps.createDirectory;

  // --- file.tree ----------------------------------------------------------
  router.handle('file.tree', async (conn: unknown, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileTreeRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.tree' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: workspaceId',
      );
      (conn as ClientConnection).send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.tree' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      (conn as ClientConnection).send(err);
      return;
    }

    const tree = doScan(workspace.cwd);

    const resp: ResponseEnvelope<FileTreeResponse> = createResponse(req, {
      tree,
    } satisfies FileTreeResponse);

    (conn as ClientConnection).send(resp);
  });

  // --- file.read ----------------------------------------------------------
  router.handle('file.read', async (conn: unknown, envelope: MessageEnvelope) => {
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
      (conn as ClientConnection).send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.read' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      (conn as ClientConnection).send(err);
      return;
    }

    const content = doRead(payload.path);
    const language = detectLanguage(payload.path);

    const resp: ResponseEnvelope<FileReadResponse> = createResponse(req, {
      content,
      language,
    } satisfies FileReadResponse);

    (conn as ClientConnection).send(resp);
  });

  // --- file.write ---------------------------------------------------------
  router.handle('file.write', async (conn: unknown, envelope: MessageEnvelope) => {
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
      (conn as ClientConnection).send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.write' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      (conn as ClientConnection).send(err);
      return;
    }

    doWrite(payload.path, payload.content);

    const resp: ResponseEnvelope = createResponse(req, { success: true });
    (conn as ClientConnection).send(resp);
  });

  // --- file.delete --------------------------------------------------------
  router.handle('file.delete', async (conn: unknown, envelope: MessageEnvelope) => {
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
      (conn as ClientConnection).send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.delete' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      (conn as ClientConnection).send(err);
      return;
    }

    doDelete(payload.path);

    const resp: ResponseEnvelope = createResponse(req, { success: true });
    (conn as ClientConnection).send(resp);
  });

  // --- file.rename --------------------------------------------------------
  router.handle('file.rename', async (conn: unknown, envelope: MessageEnvelope) => {
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
      (conn as ClientConnection).send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.rename' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      (conn as ClientConnection).send(err);
      return;
    }

    doRename(payload.oldPath, payload.newPath);

    const resp: ResponseEnvelope = createResponse(req, { success: true });
    (conn as ClientConnection).send(resp);
  });

  // --- file.create --------------------------------------------------------
  router.handle('file.create', async (conn: unknown, envelope: MessageEnvelope) => {
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
      (conn as ClientConnection).send(err);
      return;
    }

    const workspace = resolveWorkspace(deps, payload as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'file.create' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      (conn as ClientConnection).send(err);
      return;
    }

    if (payload.isDirectory) {
      doCreateDir(payload.path);
    } else {
      doCreateFile(payload.path);
    }

    const resp: ResponseEnvelope = createResponse(req, { success: true });
    (conn as ClientConnection).send(resp);
  });
}
