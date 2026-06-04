import type { Server } from 'bun';
import type { Database } from 'bun:sqlite';
import { hashPassword } from './auth/password';
import { generateSigningSecret } from './auth/jwt';
import { initDatabase, getConfigValue, setConfigValue } from './db/persistent';
import { initSessionDb, cleanupSession } from './db/session';
import { startWebSocketServer, connections } from './ws/server';
import { MessageRouter } from './ws/router';
import { registerAuthHandlers } from './ws/handlers/auth';
import { registerTerminalHandlers } from './ws/handlers/terminal';
import { registerWorkspaceHandlers } from './ws/handlers/workspaces';
import { registerFileHandlers } from './ws/handlers/files/index';
import { registerGitHandlers } from './ws/handlers/git';
import { registerConfigHandlers } from './ws/handlers/config';
import { registerTabHandlers } from './ws/handlers/tabs';
import { PTYManager } from './pty/manager';
import { stopAllWatchers } from './files/watcher';
import * as fileScanner from './files/scanner';
import * as fileOperations from './files/operations';
import { GitStatusCache } from './git/status-cache';
import { GitStatusWatcher } from './git/status-watcher';
import { getGitStatusEnhanced } from './git/status';
import { createEvent } from './ws/router';
import { getDbPath, type EventEnvelope, type GitStatusChangeEvent } from '@ymir/shared';

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

  // 2. Init persistent DB
  const db: Database = initDatabase(getDbPath());

  // 3. Load or generate JWT signing secret
  let signingSecret = getConfigValue(db, 'jwt_signing_secret');
  if (!signingSecret) {
    signingSecret = generateSigningSecret();
    setConfigValue(db, 'jwt_signing_secret', signingSecret);
  }

  // 4. Init in-memory session DB
  const sessionDb: Database = initSessionDb();

  // 5. Create PTY manager
  const ptyManager = new PTYManager();

  // 5a. Create GitStatusCache and GitStatusWatcher (must be before handler registration)
  const gitStatusCache = new GitStatusCache();
  const gitStatusWatcher = new GitStatusWatcher({
    cache: gitStatusCache,
    getStatus: async (dir: string) =>
      (await getGitStatusEnhanced(dir)) ?? {
        branch: null,
        changes: [],
        staged: [],
        hasRemote: false,
        ahead: 0,
        behind: 0,
      },
  });

  // Track git dirs to workspace metadata for the status change handler
  const watchedGitDirs = new Map<string, { workspaceId: string; repoPath: string }>();

  // When git status changes, broadcast only to connections subscribed to the workspace.
  gitStatusWatcher.setStatusChangeHandler((absoluteGitDir, status) => {
    const info = watchedGitDirs.get(absoluteGitDir);
    if (info) {
      const event = createEvent('git.statusChange', {
        workspaceId: info.workspaceId,
        repoPath: info.repoPath,
        status,
      } satisfies GitStatusChangeEvent);
      const msg = JSON.stringify(event);
      for (const conn of connections.values()) {
        if (conn.isAuthenticated && conn.hasWorkspace(info.workspaceId)) {
          conn.sendRaw(msg);
        }
      }
    }
  });

  // 6. Create message router and register all handlers in order
  const router = new MessageRouter();

  // 6a. Auth handlers (must be first – installs auth middleware)
  const cleanupAuth = registerAuthHandlers(router, {
    passwordHash,
    signingSecret,
    sessionDb,
  });

  // 6b. Terminal handlers
  registerTerminalHandlers(router, {
    ptyManager,
    sessionDb,
    persistentDb: db,
  });

  // Shared broadcast function — only sends to connections subscribed to the workspace
  // identified in the event payload (if any). Events without a workspaceId are
  // broadcast to all authenticated connections.
  const broadcastEvent = (event: EventEnvelope) => {
    const msg = JSON.stringify(event);
    const payload = event.payload as { workspaceId?: string } | null | undefined;
    const workspaceId = payload?.workspaceId;
    for (const conn of connections.values()) {
      if (conn.isAuthenticated && (!workspaceId || conn.hasWorkspace(workspaceId))) {
        conn.sendRaw(msg);
      }
    }
  };

  // 6c. Workspace handlers
  registerWorkspaceHandlers(router, {
    persistentDb: db,
    sessionDb,
    broadcastEvent,
    gitStatusWatcher,
    watchedGitDirs,
  });

  // 6d. File handlers
  registerFileHandlers(router, {
    persistentDb: db,
    scanner: fileScanner,
    operations: fileOperations,
  });

  // 6e. Git handlers
  registerGitHandlers(router, {
    persistentDb: db,
    gitStatusCache,
    gitStatusWatcher,
    watchedGitDirs,
  });

  // 6f. Config handlers
  registerConfigHandlers(router, { persistentDb: db });

  // 6g. Tab handlers
  registerTabHandlers(router, {
    sessionDb,
    persistentDb: db,
    ptyManager,
  });

  // 7. Start WebSocket server with router as message dispatcher
  const server: Server<unknown> = await startWebSocketServer({
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
  console.log(`Ymir server listening on ${host}:${server.port}`);

  // 9. Graceful shutdown on SIGINT / SIGTERM
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nShutting down...');

    // Stop auth cleanup timer
    cleanupAuth();

    // Kill all PTY processes
    ptyManager.killAll();

    // Stop all file watchers
    stopAllWatchers();

    // Stop all git status watchers
    await gitStatusWatcher.unwatchAll();

    // Close all WebSocket connections
    for (const conn of connections.values()) {
      conn.close();
    }

    // Allow connections to finish draining before closing databases
    await new Promise((resolve) => setTimeout(resolve, 100));

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
