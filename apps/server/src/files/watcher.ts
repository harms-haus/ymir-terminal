import { watch, existsSync, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

export interface FileChangeEvent {
  path: string;
  kind: 'create' | 'modify' | 'delete';
}

export interface ManagedWatcher {
  watcher: FSWatcher;
  dirPath: string;
  close: () => void;
}

const activeWatchers = new Map<string, ManagedWatcher>();

export function startWatcher(
  dirPath: string,
  callback: (event: FileChangeEvent) => void,
): ManagedWatcher {
  // Close existing watcher for this path if any
  if (activeWatchers.has(dirPath)) {
    const existing = activeWatchers.get(dirPath)!;
    existing.watcher.close();
    activeWatchers.delete(dirPath);
  }

  // NOTE: recursive fs.watch is only reliable on macOS/Windows.
  // On Linux, this silently fails for nested directories.
  // TODO: Implement manual recursive watching or use a library like chokidar for Linux support.
  const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const fullPath = join(dirPath, filename);
    let kind: 'create' | 'modify' | 'delete';
    if (eventType === 'rename') {
      kind = existsSync(fullPath) ? 'create' : 'delete';
    } else {
      kind = 'modify';
    }
    callback({ path: fullPath, kind });
  });
  const managed = { watcher, dirPath, close: () => watcher.close() };
  activeWatchers.set(dirPath, managed);
  return managed;
}

export function stopWatcher(dirPath: string): void {
  const managed = activeWatchers.get(dirPath);
  if (managed) {
    managed.close();
    activeWatchers.delete(dirPath);
  }
}

export function stopAllWatchers(): void {
  for (const [path] of activeWatchers) {
    stopWatcher(path);
  }
}

// ---------------------------------------------------------------------------
// Workspace-level watcher management
// ---------------------------------------------------------------------------

const activeWatchersByWorkspace = new Map<string, { dirPath: string }>();

export function startWorkspaceWatcher(
  workspaceId: string,
  dirPath: string,
  callback: (event: FileChangeEvent) => void,
): void {
  // Stop existing watcher for this workspace if any
  stopWorkspaceWatcher(workspaceId);
  startWatcher(dirPath, callback);
  activeWatchersByWorkspace.set(workspaceId, { dirPath });
}

export function stopWorkspaceWatcher(workspaceId: string): void {
  const entry = activeWatchersByWorkspace.get(workspaceId);
  if (entry) {
    stopWatcher(entry.dirPath);
    activeWatchersByWorkspace.delete(workspaceId);
  }
}
