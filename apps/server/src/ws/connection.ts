import type { MessageEnvelope } from '@ymir/shared';

/**
 * Wraps a Bun ServerWebSocket and tracks session-level state such as
 * authentication status and last-active timestamp.
 */
export class ClientConnection {
  readonly sessionId: string;
  isAuthenticated: boolean;
  lastActive: Date;

  constructor(private readonly ws: { send(data: string): void }) {
    this.sessionId = crypto.randomUUID();
    this.isAuthenticated = false;
    this.lastActive = new Date();
  }

  /** Serialize an envelope to JSON and send it over the wire. */
  send(envelope: MessageEnvelope<unknown>): void {
    this.ws.send(JSON.stringify(envelope));
  }

  /** Close the underlying WebSocket connection. */
  close(): void {
    // ServerWebSocket in Bun has a close method; cast to access it.
    (this.ws as unknown as { close(): void }).close();
  }
}
