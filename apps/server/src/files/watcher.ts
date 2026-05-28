import { watch, type FSWatcher } from 'node:fs';
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
  callback: (event: FileChangeEvent) => void
): ManagedWatcher {
  const watcher = watch(
    dirPath,
    { recursive: true },
    (eventType, filename) => {
      if (!filename) return;
      const fullPath = join(dirPath, filename);
      callback({
        path: fullPath,
        kind: eventType === 'rename' ? 'create' : 'modify',
      });
    }
  );
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
