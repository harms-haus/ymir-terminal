import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';

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

export function createTab(
  db: Database,
  opts: {
    sessionId: string;
    workspaceId: string;
    tabType: string;
    title?: string;
    filePath?: string;
    order: number;
  },
): string {
  const id = randomUUID();
  const stmt = db.prepare(
    'INSERT INTO tabs (id, session_id, workspace_id, tab_type, title, file_path, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  stmt.run(
    id,
    opts.sessionId,
    opts.workspaceId,
    opts.tabType,
    opts.title ?? null,
    opts.filePath ?? null,
    opts.order,
  );
  return id;
}

export function listTabs(
  db: Database,
  sessionId: string,
  workspaceId: string,
): Record<string, unknown>[] {
  const stmt = db.prepare(
    'SELECT * FROM tabs WHERE session_id = ? AND workspace_id = ? ORDER BY sort_order ASC',
  );
  return stmt.all(sessionId, workspaceId) as Record<string, unknown>[];
}

export function updateTab(
  db: Database,
  tabId: string,
  opts: { active?: number; order?: number },
): void {
  const sets: string[] = [];
  const values: (number | string)[] = [];

  if (opts.active !== undefined) {
    sets.push('active = ?');
    values.push(opts.active);
  }
  if (opts.order !== undefined) {
    sets.push('sort_order = ?');
    values.push(opts.order);
  }

  if (sets.length === 0) return;

  values.push(tabId);
  db.prepare(`UPDATE tabs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteTab(db: Database, tabId: string): void {
  db.prepare('DELETE FROM tabs WHERE id = ?').run(tabId);
}

export function createPane(db: Database, opts: { tabId: string; terminalId?: string }): string {
  const id = randomUUID();
  const stmt = db.prepare('INSERT INTO panes (id, tab_id, terminal_id) VALUES (?, ?, ?)');
  stmt.run(id, opts.tabId, opts.terminalId ?? null);
  return id;
}

export function createTerminalInstance(
  db: Database,
  opts: {
    sessionId: string;
    workspaceId: string;
    paneId?: string;
    cols: number;
    rows: number;
  },
): string {
  const id = randomUUID();
  const stmt = db.prepare(
    'INSERT INTO terminal_instances (id, session_id, workspace_id, pane_id, cols, rows) VALUES (?, ?, ?, ?, ?, ?)',
  );
  stmt.run(id, opts.sessionId, opts.workspaceId, opts.paneId ?? null, opts.cols, opts.rows);
  return id;
}

export function getTerminalInstance(
  db: Database,
  terminalId: string,
): Record<string, unknown> | null {
  const stmt = db.prepare('SELECT * FROM terminal_instances WHERE id = ?');
  return stmt.get(terminalId) as Record<string, unknown> | null;
}

export function updateTerminalSize(
  db: Database,
  terminalId: string,
  cols: number,
  rows: number,
): void {
  db.prepare('UPDATE terminal_instances SET cols = ?, rows = ? WHERE id = ?').run(
    cols,
    rows,
    terminalId,
  );
}

export function deleteTerminalInstance(db: Database, terminalId: string): void {
  db.prepare('DELETE FROM terminal_instances WHERE id = ?').run(terminalId);
}

export function createBottomPanelTab(
  db: Database,
  opts: {
    sessionId: string;
    workspaceId: string;
    terminalId?: string;
    order: number;
  },
): string {
  const id = randomUUID();
  const stmt = db.prepare(
    'INSERT INTO bottom_panel_tabs (id, session_id, workspace_id, terminal_id, sort_order) VALUES (?, ?, ?, ?, ?)',
  );
  stmt.run(id, opts.sessionId, opts.workspaceId, opts.terminalId ?? null, opts.order);
  return id;
}

export function listBottomPanelTabs(
  db: Database,
  sessionId: string,
  workspaceId: string,
): Record<string, unknown>[] {
  const stmt = db.prepare(
    'SELECT * FROM bottom_panel_tabs WHERE session_id = ? AND workspace_id = ? ORDER BY sort_order ASC',
  );
  return stmt.all(sessionId, workspaceId) as Record<string, unknown>[];
}

export function cleanupSession(db: Database, sessionId: string): void {
  deleteSession(db, sessionId);
}
