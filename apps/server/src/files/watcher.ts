import chokidar from 'chokidar';

export interface FileChangeEvent {
  path: string;
  kind: 'create' | 'modify' | 'delete';
}

export interface ManagedWatcher {
  watcher: InstanceType<typeof chokidar.FSWatcher>;
  dirPath: string;
  close: () => void;
}

const MAX_FILE_WATCHERS = 200;
const activeWatchers = new Map<string, ManagedWatcher>();

export function startWatcher(
  dirPath: string,
  callback: (event: FileChangeEvent) => void,
): ManagedWatcher {
  if (activeWatchers.size >= MAX_FILE_WATCHERS) {
    throw new Error(`Max file watchers (${MAX_FILE_WATCHERS}) reached`);
  }

  // Close existing watcher for this path if any
  if (activeWatchers.has(dirPath)) {
    const existing = activeWatchers.get(dirPath)!;
    existing.watcher.close();
    activeWatchers.delete(dirPath);
  }

  const watcher = chokidar.watch(dirPath, {
    ignoreInitial: true,
    depth: 20,
    ignored: /node_modules|\.git/,
  });

  watcher.on('add', (path) => callback({ path, kind: 'create' }));
  watcher.on('change', (path) => callback({ path, kind: 'modify' }));
  watcher.on('unlink', (path) => callback({ path, kind: 'delete' }));
  watcher.on('addDir', (path) => callback({ path, kind: 'create' }));
  watcher.on('unlinkDir', (path) => callback({ path, kind: 'delete' }));

  const managed = {
    watcher,
    dirPath,
    close: () => {
      watcher.close();
    },
  };
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
  const paths = [...activeWatchers.keys()];
  for (const path of paths) {
    stopWatcher(path);
  }
  activeWatchersByWorkspace.clear();
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
