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

  #ws: WsLike;
  #openWorkspaces = new Set<string>();

  constructor(ws: WsLike) {
    this.#ws = ws;
    this.sessionId = crypto.randomUUID();
  }

  /** Register interest in a workspace (receives broadcast events for it). */
  addWorkspace(id: string): void {
    this.#openWorkspaces.add(id);
  }

  /** Unsubscribe from a workspace (stops receiving broadcast events). */
  removeWorkspace(id: string): void {
    this.#openWorkspaces.delete(id);
  }

  /** Whether this connection is subscribed to the given workspace. */
  hasWorkspace(id: string): boolean {
    return this.#openWorkspaces.has(id);
  }

  /** Serialize an envelope to JSON and send it over the wire. */
  send(envelope: MessageEnvelope<unknown>): void {
    this.#ws.send(JSON.stringify(envelope));
  }

  /** Send a raw string over the wire without serialization. */
  sendRaw(data: string): void {
    this.#ws.send(data);
  }

  /** Close the underlying WebSocket connection. */
  close(): void {
    this.#ws.close();
  }
}
