/**
 * Shared test utilities for server-side WebSocket handler tests.
 *
 * Provides reusable helpers that are currently duplicated across handler test
 * files. Import from `../../test-helpers/mock-utils` (or appropriate relative
 * path) to use in any test.
 */

import { Database } from 'bun:sqlite';
import { PROTOCOL_VERSION, type RequestEnvelope } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock connection
// ---------------------------------------------------------------------------

export interface MockConnection {
  sessionId: string;
  isAuthenticated: boolean;
  sent: unknown[];
  send(data: unknown): void;
}

/**
 * Create a minimal mock connection object that tracks sent messages.
 *
 * Matches the local `mockConn()` definitions used in auth, terminal, files,
 * git, and workspaces handler tests. The `sent` array captures every argument
 * passed to `send()`.
 *
 * @param overrides - Optional overrides for sessionId / isAuthenticated.
 *                    Defaults: `sessionId` → random UUID, `isAuthenticated` → true.
 */
export function mockConn(
  overrides?: Partial<Pick<MockConnection, 'sessionId' | 'isAuthenticated'>>,
): MockConnection {
  const sent: unknown[] = [];
  return {
    sessionId: overrides?.sessionId ?? crypto.randomUUID(),
    isAuthenticated: overrides?.isAuthenticated ?? true,
    sent,
    send(data: unknown) {
      sent.push(data);
    },
  };
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
  db.exec('PRAGMA journal_mode = WAL');

  db.exec(`
    CREATE TABLE client_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE tabs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES client_sessions(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL,
      tab_type TEXT NOT NULL CHECK(tab_type IN ('terminal', 'editor')),
      title TEXT,
      file_path TEXT,
      active INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
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

  return db;
}
