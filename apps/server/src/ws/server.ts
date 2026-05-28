import type { Server, ServerWebSocket } from 'bun';
import { resolve, join, extname } from 'node:path';
import {
  ErrorCodes,
  type ResponseEnvelope,
  type MessageEnvelope,
} from '@ymir/shared';
import { ClientConnection } from './connection';

/** Active connections keyed by session ID. */
export const connections = new Map<string, ClientConnection>();

/** MIME types for common static file extensions. */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.map': 'application/json',
};

export interface WsServerOptions {
  port: number;
  host: string;
  staticDir?: string;
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

  // Resolve the static files directory (for SPA serving)
  const staticDir = options.staticDir
    ? resolve(options.staticDir)
    : resolve(import.meta.dirname, '../../client/dist');

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req, s) {
      // Upgrade HTTP requests to WebSocket
      if (req.headers.get('upgrade') === 'websocket') {
        const success = s.upgrade(req);
        if (!success) {
          return new Response('WebSocket upgrade failed', { status: 500 });
        }
        // Return void — Bun handles the upgrade
        return;
      }

      // Serve static files from the client build directory
      const url = new URL(req.url);
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = join(staticDir, pathname);

      // Prevent directory traversal
      if (!filePath.startsWith(staticDir)) {
        return new Response('Forbidden', { status: 403 });
      }

      const file = Bun.file(filePath);
      const exists = await file.exists();

      if (exists) {
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        return new Response(file, {
          headers: { 'Content-Type': contentType },
        });
      }

      // SPA fallback: serve index.html for unmatched routes
      const indexFile = Bun.file(join(staticDir, 'index.html'));
      const indexExists = await indexFile.exists();
      if (indexExists) {
        return new Response(indexFile, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      return new Response('Not Found', { status: 404 });
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
