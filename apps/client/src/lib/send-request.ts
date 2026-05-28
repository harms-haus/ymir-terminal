import { wsClient } from './ws-client';
import { PROTOCOL_VERSION } from '@ymir/shared';
import type { MessageEnvelope } from '@ymir/shared';

/**
 * Send a request via the WebSocket client and return a promise that resolves
 * when the matching response (by id) arrives.
 */
export interface SendRequestOptions {
  signal?: AbortSignal;
}

export function sendRequest<T>(
  channel: string,
  payload: unknown,
  options?: SendRequestOptions,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    // If already aborted, reject immediately
    if (options?.signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'));
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Request timeout'));
    }, 10_000);

    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      if (envelope.id === id) {
        cleanup();

        if (envelope.error) {
          reject(new Error(envelope.error.message));
        } else {
          resolve(envelope.payload as T);
        }
      }
    });

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Request aborted', 'AbortError'));
    };

    function cleanup() {
      clearTimeout(timeout);
      unsub();
      options?.signal?.removeEventListener('abort', onAbort);
    }

    options?.signal?.addEventListener('abort', onAbort);

    wsClient.send({
      v: PROTOCOL_VERSION,
      type: 'request',
      id,
      channel,
      payload,
    });
  });
}
