import { useEffect } from 'react';
import { wsClient } from '../../lib/ws-client';
import type { MessageEnvelope, GitStatusChangeEvent, GitStatusResponse } from '@ymir/shared';

export function useGitStatusSubscription(
  workspaceId: string | null,
  callback: (repoPath: string, status: GitStatusResponse) => void,
) {
  useEffect(() => {
    if (!workspaceId) return;

    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      const payload = envelope.payload as GitStatusChangeEvent | undefined;
      if (
        envelope.type === 'event' &&
        envelope.channel === 'git.statusChange' &&
        payload?.workspaceId === workspaceId
      ) {
        callback(payload.repoPath, payload.status);
      }
    });

    return unsub;
  }, [workspaceId, callback]);
}
