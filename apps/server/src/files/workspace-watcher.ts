import {
  PROTOCOL_VERSION,
  type EventEnvelope,
  type FileChangeEvent as FileChangePayload,
} from '@ymir/shared';
import {
  startWorkspaceWatcher,
  stopWorkspaceWatcher,
  type FileChangeEvent,
} from './watcher';

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
    const event: EventEnvelope<FileChangePayload> = {
      v: PROTOCOL_VERSION,
      type: 'event',
      channel: 'file.change',
      payload: {
        workspaceId,
        path: fileEvent.path,
        kind: fileEvent.kind,
      },
    };
    broadcastEvent(event);
  });
}

/**
 * Stop the managed file watcher for a workspace.
 */
export function stopManagedWatcher(workspaceId: string): void {
  stopWorkspaceWatcher(workspaceId);
}
