import type { Database } from 'bun:sqlite';
import type { Workspace } from '../../../db/persistent';
import { getWorkspace as dbGetWorkspace } from '../../../db/persistent';
import { safePath as _safePath } from '../../../lib/handler-validation';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface FileDeps {
  persistentDb: Database;
  scanner: {
    scanDirectory: (
      dirPath: string,
      options?: import('../../../files/scanner').ScanOptions,
    ) => Promise<import('@ymir/shared').FileNode[]>;
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
