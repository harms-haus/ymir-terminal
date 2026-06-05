import { wsClient } from './ws-client';
import { PROTOCOL_VERSION, generateId } from '@ymir/shared';
import type { MessageEnvelope, ResponseEnvelope } from '@ymir/shared';

/**
 * Send a request via the WebSocket client and return a promise that resolves
 * when the matching response (by id) arrives.
 */
export interface SendRequestOptions {
  signal?: AbortSignal;
  timeout?: number; // custom timeout in milliseconds, defaults to 10_000
}

export function sendRequest<T>(
  channel: string,
  payload: unknown,
  options?: SendRequestOptions,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = generateId();
    const epoch = wsClient.getDisconnectEpoch();

    // If already aborted, reject immediately
    if (options?.signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'));
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      if (wsClient.getDisconnectEpoch() !== epoch) {
        reject(new Error('Connection reset'));
      } else {
        reject(new Error('Request timeout'));
      }
    }, options?.timeout ?? 10_000);

    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      if (envelope.id === id) {
        if (wsClient.getDisconnectEpoch() !== epoch) {
          cleanup();
          reject(new Error('Connection reset'));
          return;
        }

        cleanup();

        const resp = envelope as ResponseEnvelope;
        if (resp.error) {
          reject(new Error(resp.error.message));
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
