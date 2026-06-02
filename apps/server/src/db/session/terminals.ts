import type { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';

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
