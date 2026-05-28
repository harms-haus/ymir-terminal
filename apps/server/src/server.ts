import type { Server } from 'bun';
import type { Database } from 'bun:sqlite';
import { hashPassword } from './auth/password';
import { generateSigningSecret } from './auth/jwt';
import { initDatabase } from './db/persistent';
import { initSessionDb, cleanupSession } from './db/session';
import { startWebSocketServer, connections } from './ws/server';
import { MessageRouter } from './ws/router';
import { registerAuthHandlers } from './ws/handlers/auth';
import { registerTerminalHandlers } from './ws/handlers/terminal';
import { registerWorkspaceHandlers } from './ws/handlers/workspaces';
import { registerFileHandlers } from './ws/handlers/files';
import { registerGitHandlers } from './ws/handlers/git';
import { PTYManager } from './pty/manager';
import { stopAllWatchers } from './files/watcher';
import * as fileScanner from './files/scanner';
import * as fileOperations from './files/operations';
import { getDbPath } from '@ymir/shared';

export interface StartServerOptions {
  password: string;
  port: number;
  host: string;
  staticDir?: string;
}

export async function startServer(options: StartServerOptions): Promise<void> {
  const { password, port, host, staticDir } = options;

  // 1. Hash password at startup
  const passwordHash = await hashPassword(password);

  // 2. Generate JWT signing secret
  const signingSecret = generateSigningSecret();

  // 3. Init persistent DB
  const db: Database = initDatabase(getDbPath());

  // 4. Init in-memory session DB
  const sessionDb: Database = initSessionDb();

  // 5. Create PTY manager
  const ptyManager = new PTYManager();

  // 6. Create message router and register all handlers in order
  const router = new MessageRouter();

  // 6a. Auth handlers (must be first – installs auth middleware)
  registerAuthHandlers(router, { passwordHash, signingSecret, sessionDb });

  // 6b. Terminal handlers
  registerTerminalHandlers(router, { ptyManager, sessionDb });

  // 6c. Workspace handlers
  registerWorkspaceHandlers(router, { persistentDb: db, sessionDb });

  // 6d. File handlers
  registerFileHandlers(router, {
    persistentDb: db,
    scanner: fileScanner,
    operations: fileOperations,
    watcher: {},
  });

  // 6e. Git handlers
  registerGitHandlers(router, { persistentDb: db });

  // 7. Start WebSocket server with router as message dispatcher
  const server: Server = await startWebSocketServer({
    port,
    host,
    staticDir,
    onMessage(conn, envelope) {
      router.route(conn, envelope).catch((err: unknown) => {
        console.error('Router error:', err);
      });
    },
    onClose(conn) {
      // Query all terminal instances for this session and kill each PTY
      const terminals = sessionDb
        .prepare('SELECT id FROM terminal_instances WHERE session_id = ?')
        .all(conn.sessionId) as { id: string }[];
      for (const { id } of terminals) {
        ptyManager.kill(id);
      }
      // Remove all session DB rows (tabs, panes, terminal_instances, etc.)
      cleanupSession(sessionDb, conn.sessionId);
    },
  });

  // 8. Log startup info
  console.log(`Ymir server listening on ${host}:${port}`);

  // 9. Graceful shutdown on SIGINT / SIGTERM
  const shutdown = async () => {
    console.log('\nShutting down...');

    // Kill all PTY processes
    ptyManager.killAll();

    // Stop all file watchers
    stopAllWatchers();

    // Close all WebSocket connections
    for (const conn of connections.values()) {
      conn.close();
    }

    // Close databases
    try {
      db.close();
    } catch {
      // Ignore close errors during shutdown
    }
    try {
      sessionDb.close();
    } catch {
      // Ignore close errors during shutdown
    }

    // Stop the HTTP/WebSocket server
    server.stop(true);

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
