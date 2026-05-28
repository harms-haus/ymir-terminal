import { useEffect, useCallback } from 'react';
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
  const stableCallback = useCallback((e: FileChangeEvent) => callback(e), [callback]);

  useEffect(() => {
    if (!workspaceId) return;

    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      if (envelope.channel === 'file.change' && envelope.payload?.workspaceId === workspaceId) {
        stableCallback(envelope.payload as FileChangeEvent);
      }
    });

    return unsub;
  }, [workspaceId, stableCallback]);
}
