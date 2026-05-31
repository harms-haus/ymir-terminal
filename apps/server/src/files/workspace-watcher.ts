import { type FileChangeEvent as FileChangePayload, type EventEnvelope } from '@ymir/shared';
import { createEvent } from '../ws/router';
import { startWorkspaceWatcher, stopWorkspaceWatcher, type FileChangeEvent } from './watcher';

/**
 * Start a managed file watcher for a workspace that broadcasts `file.change`
 * events to connected clients.
 */
export function startManagedWatcher(
  workspaceId: string,
  cwd: string,
  broadcastEvent: (envelope: EventEnvelope<FileChangePayload>) => void,
): void {
  startWorkspaceWatcher(workspaceId, cwd, (fileEvent: FileChangeEvent) => {
    broadcastEvent(
      createEvent('file.change', {
        workspaceId,
        path: fileEvent.path,
        kind: fileEvent.kind,
      }) as EventEnvelope<FileChangePayload>,
    );
  });
}

/**
 * Stop the managed file watcher for a workspace.
 */
export function stopManagedWatcher(workspaceId: string): void {
  stopWorkspaceWatcher(workspaceId);
}
