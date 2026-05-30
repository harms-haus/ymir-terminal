import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';

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
