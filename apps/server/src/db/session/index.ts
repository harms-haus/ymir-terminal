import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';

export type { Database };

// ── Sub-modules ──────────────────────────────────────────────────────────────
export {
  createTab,
  listTabs,
  getTab,
  updateTab,
  deleteTab,
  reorderTabs,
  setActiveTab,
  createPane,
} from './tabs';
export {
  createTerminalInstance,
  getTerminalInstance,
  updateTerminalSize,
  deleteTerminalInstance,
} from './terminals';
export { createBottomPanelTab, listBottomPanelTabs } from './bottom-panel';

// ── DDL & session lifecycle ──────────────────────────────────────────────────

export function initSessionDb(): Database {
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

export function createSession(db: Database, id?: string): string {
  const sessionId = id ?? randomUUID();
  const stmt = db.prepare('INSERT INTO client_sessions (id) VALUES (?)');
  stmt.run(sessionId);
  return sessionId;
}

export function deleteSession(db: Database, sessionId: string): void {
  const stmt = db.prepare('DELETE FROM client_sessions WHERE id = ?');
  stmt.run(sessionId);
}

export function cleanupSession(db: Database, sessionId: string): void {
  deleteSession(db, sessionId);
}
