/**
 * Shared test utilities for server-side WebSocket handler tests.
 *
 * Provides reusable helpers that are currently duplicated across handler test
 * files. Import from `../../test-helpers/mock-utils` (or appropriate relative
 * path) to use in any test.
 */

import { Database } from 'bun:sqlite';
import { PROTOCOL_VERSION, type RequestEnvelope } from '@ymir/shared';
import { ClientConnection } from '../ws/connection';

// ---------------------------------------------------------------------------
// Mock connection
// ---------------------------------------------------------------------------

/**
 * A {@link ClientConnection} subclass with extra test-only properties.
 *
 * Extending the real class ensures structural compatibility (including
 * ECMAScript private fields like `#ws`) so tests pass strict type checks
 * without `as any` casts.
 */
export class MockConnection extends ClientConnection {
  /** Re-declared as writable so tests can override the value. */
  declare sessionId: string;
  /** Every argument passed to `send()` or captured from `ws.send()`. */
  sent: unknown[] = [];

  constructor(
    ws: { send: (data: string) => void; close: () => void },
    overrides?: { sessionId?: string; isAuthenticated?: boolean },
  ) {
    super(ws);
    if (overrides?.sessionId) (this as { sessionId: string }).sessionId = overrides.sessionId;
    if (overrides?.isAuthenticated !== undefined) this.isAuthenticated = overrides.isAuthenticated;
  }

  /** @override – capture the envelope in `sent`. */
  override send(envelope: unknown): void {
    this.sent.push(envelope);
  }

  /** @override – capture raw data in `sent`. */
  override sendRaw(data: string): void {
    this.sent.push(data);
  }

  /** @override – no-op for tests. */
  override close(): void {}
}

/**
 * Create a mock connection that tracks sent messages.
 *
 * Returns a {@link MockConnection} (which extends {@link ClientConnection})
 * so it is assignable anywhere `ClientConnection` is expected.
 *
 * @param overrides - Optional overrides for sessionId / isAuthenticated.
 *                    Defaults: `sessionId` → random UUID, `isAuthenticated` → true.
 */
export function mockConn(overrides?: {
  sessionId?: string;
  isAuthenticated?: boolean;
}): MockConnection {
  const sent: unknown[] = [];
  const ws = {
    send: (data: string) => {
      sent.push(data);
    },
    close: () => {},
  };
  const conn = new MockConnection(ws, overrides);
  // Share the sent array so ws.send also populates conn.sent
  conn.sent = sent;
  return conn;
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

/**
 * Build a `RequestEnvelope` for the given channel + payload.
 *
 * Produces the same shape as the local `request()` helpers in handler tests:
 * includes `PROTOCOL_VERSION`, a random `id`, and an optional `token`.
 *
 * @param channel - The channel string (e.g. 'auth', 'terminal.create').
 * @param payload - The request payload.
 * @param token   - Optional auth token to attach.
 */
export function request<T = unknown>(
  channel: string,
  payload: T,
  token?: string,
): RequestEnvelope<T> {
  return {
    v: PROTOCOL_VERSION,
    type: 'request',
    id: crypto.randomUUID(),
    channel,
    payload,
    ...(token ? { token } : {}),
  } as RequestEnvelope<T>;
}

// ---------------------------------------------------------------------------
// In-memory database helpers
// ---------------------------------------------------------------------------

/**
 * Create an in-memory SQLite database with the session schema.
 *
 * Runs the same DDL as `db/session.ts`'s `initSessionDb()` so that handler
 * tests have a fully initialised database without touching the filesystem.
 *
 * @returns A `Database` instance with all session tables created.
 */
export function createMockSessionDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE client_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE tabs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES client_sessions(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL,
      tab_type TEXT NOT NULL CHECK(tab_type IN ('terminal', 'editor', 'diff', 'git-tree')),
      title TEXT,
      file_path TEXT,
      pane TEXT NOT NULL DEFAULT 'content' CHECK(pane IN ('content', 'bottom')),
      active INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      diff_ref TEXT,
      repo_path TEXT,
      commit_sha TEXT,
      parent_sha TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE panes (
      id TEXT PRIMARY KEY,
      tab_id TEXT NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
      terminal_id TEXT,
      layout_json TEXT
    );

    CREATE TABLE terminal_instances (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES client_sessions(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL,
      pane_id TEXT REFERENCES panes(id),
      cols INTEGER NOT NULL DEFAULT 80,
      rows INTEGER NOT NULL DEFAULT 24,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE bottom_panel_tabs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES client_sessions(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL,
      terminal_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

/**
 * Create an in-memory SQLite database with the persistent schema.
 *
 * Runs the same DDL as `db/persistent.ts`'s `initDatabase()` so that handler
 * tests have a fully initialised database without touching the filesystem.
 *
 * @returns A `Database` instance with all persistent tables created.
 */
export function createMockPersistentDb(): Database {
  const db = new Database(':memory:');

  db.run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cwd TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#007acc',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS server_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS persisted_tabs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      tab_type TEXT NOT NULL CHECK(tab_type IN ('terminal', 'editor', 'diff', 'git-tree')),
      title TEXT,
      file_path TEXT,
      pane TEXT DEFAULT 'content',
      sort_order INTEGER DEFAULT 0,
      diff_ref TEXT,
      repo_path TEXT,
      commit_sha TEXT,
      parent_sha TEXT,
      cwd TEXT,
      custom_title TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}
