import type { MessageEnvelope } from '@ymir/shared';

/**
 * Minimal shape of a WebSocket-like transport.  Declared separately so
 * {@link ClientConnection.close} can call `ws.close()` without an unsafe cast.
 */
interface WsLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/**
 * Wraps a Bun ServerWebSocket and tracks session-level state such as
 * authentication status and last-active timestamp.
 */
export class ClientConnection {
  readonly sessionId: string;
  isAuthenticated = false;
  lastActive = new Date();

  constructor(private readonly ws: WsLike) {
    this.sessionId = crypto.randomUUID();
  }

  /** Serialize an envelope to JSON and send it over the wire. */
  send(envelope: MessageEnvelope<unknown>): void {
    this.ws.send(JSON.stringify(envelope));
  }

  /** Close the underlying WebSocket connection. */
  close(): void {
    this.ws.close();
  }
}
