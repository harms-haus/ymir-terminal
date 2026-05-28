import { wsClient } from './ws-client';
import { PROTOCOL_VERSION } from '@ymir/shared';
import type { MessageEnvelope } from '@ymir/shared';

/**
 * Send a request via the WebSocket client and return a promise that resolves
 * when the matching response (by id) arrives.
 */
export function sendRequest<T>(channel: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    const timeout = setTimeout(() => {
      unsub();
      reject(new Error('Request timeout'));
    }, 10_000);

    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      if (envelope.id === id) {
        clearTimeout(timeout);
        unsub();

        if (envelope.error) {
          reject(new Error(envelope.error.message));
        } else {
          resolve(envelope.payload as T);
        }
      }
    });

    wsClient.send({
      v: PROTOCOL_VERSION,
      type: 'request',
      id,
      channel,
      payload,
    });
  });
}
