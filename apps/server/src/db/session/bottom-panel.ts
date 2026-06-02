import type { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';

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
