import type { Server, ServerWebSocket } from 'bun';
import {
  ErrorCodes,
  type ResponseEnvelope,
  type MessageEnvelope,
} from '@ymir/shared';
import { ClientConnection } from './connection';

/** Active connections keyed by session ID. */
export const connections = new Map<string, ClientConnection>();

export interface WsServerOptions {
  port: number;
  host: string;
  onMessage?: (conn: ClientConnection, message: string) => void;
}

/**
 * Start a WebSocket server using Bun.serve.
 *
 * - On `open`: create a ClientConnection and store it in the connections map.
 * - On `message`: parse JSON; if the connection is not authenticated only
 *   messages with `channel === 'auth'` are forwarded. Others receive an
 *   `AUTH_REQUIRED` error response.
 * - On `close`: remove the connection from the map (does NOT destroy PTYs).
 */
export async function startWebSocketServer(
  options: WsServerOptions,
): Promise<Server> {
  const { port, host, onMessage } = options;

  const server = Bun.serve({
    port,
    hostname: host,
    fetch(req, s) {
      // Upgrade HTTP requests to WebSocket
      if (req.headers.get('upgrade') === 'websocket') {
        const success = s.upgrade(req);
        if (!success) {
          return new Response('WebSocket upgrade failed', { status: 500 });
        }
        // Return void — Bun handles the upgrade
      }
      return new Response('Ymir WebSocket server', { status: 200 });
    },
    websocket: {
      open(ws: ServerWebSocket) {
        const conn = new ClientConnection(ws);
        (ws as unknown as Record<string, unknown>).__conn = conn;
        connections.set(conn.sessionId, conn);
      },

      message(ws: ServerWebSocket, data: string | Buffer) {
        const conn = getConnection(ws);
        if (!conn) return;

        conn.lastActive = new Date();

        const raw = typeof data === 'string' ? data : data.toString();

        let parsed: MessageEnvelope;
        try {
          parsed = JSON.parse(raw);
        } catch {
          conn.send({
            v: 1,
            type: 'response',
            id: 'unknown',
            payload: null,
            error: {
              code: ErrorCodes.INVALID_MESSAGE,
              message: 'Invalid JSON',
            },
          } as ResponseEnvelope);
          return;
        }

        // Unauthenticated connections may only send on the 'auth' channel
        if (!conn.isAuthenticated && parsed.channel !== 'auth') {
          conn.send({
            v: 1,
            type: 'response',
            id: parsed.id ?? 'unknown',
            payload: null,
            error: {
              code: ErrorCodes.AUTH_REQUIRED,
              message: 'Authentication required',
            },
          } as ResponseEnvelope);
          return;
        }

        if (onMessage) {
          onMessage(conn, raw);
        }
      },

      close(ws: ServerWebSocket) {
        const conn = getConnection(ws);
        if (conn) {
          connections.delete(conn.sessionId);
        }
        // Intentionally does NOT destroy PTY processes on disconnect.
      },
    },
  });

  return server;
}

/** Retrieve the ClientConnection stored on a ServerWebSocket. */
function getConnection(ws: ServerWebSocket): ClientConnection | undefined {
  const conn = (ws as unknown as Record<string, unknown>).__conn;
  return conn instanceof ClientConnection ? conn : undefined;
}
