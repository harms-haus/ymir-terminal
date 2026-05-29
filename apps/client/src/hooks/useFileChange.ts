import { useEffect } from 'react';
import { wsClient } from '../lib/ws-client';
import type { MessageEnvelope } from '@ymir/shared';

interface FileChangeEvent {
  workspaceId: string;
  path: string;
  kind: 'create' | 'modify' | 'delete';
}

export function useFileChange(
  workspaceId: string | null,
  callback: (event: FileChangeEvent) => void,
) {
  useEffect(() => {
    if (!workspaceId) return;

    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      const payload = envelope.payload as FileChangeEvent | undefined;
      if (envelope.channel === 'file.change' && payload?.workspaceId === workspaceId) {
        callback(payload);
      }
    });

    return unsub;
  }, [workspaceId, callback]);
}
