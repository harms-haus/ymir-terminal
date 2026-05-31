import { useEffect } from 'react';
import { wsClient } from '../lib/ws-client';
import type { MessageEnvelope, FileChangeEvent } from '@ymir/shared';

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
