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
    pane?: string;
    order: number;
    diffRef?: string;
    repoPath?: string;
    commitSha?: string;
    parentSha?: string;
  },
): string {
  const id = randomUUID();
  const stmt = db.prepare(
    'INSERT INTO tabs (id, session_id, workspace_id, tab_type, title, file_path, pane, sort_order, diff_ref, repo_path, commit_sha, parent_sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  stmt.run(
    id,
    opts.sessionId,
    opts.workspaceId,
    opts.tabType,
    opts.title ?? null,
    opts.filePath ?? null,
    opts.pane ?? 'content',
    opts.order,
    opts.diffRef ?? null,
    opts.repoPath ?? null,
    opts.commitSha ?? null,
    opts.parentSha ?? null,
  );
  return id;
}

export function listTabs(
  db: Database,
  sessionId: string,
  workspaceId: string,
  pane?: string,
): Record<string, unknown>[] {
  if (pane !== undefined) {
    const stmt = db.prepare(
      'SELECT * FROM tabs WHERE session_id = ? AND workspace_id = ? AND pane = ? ORDER BY sort_order ASC',
    );
    return stmt.all(sessionId, workspaceId, pane) as Record<string, unknown>[];
  }
  const stmt = db.prepare(
    'SELECT * FROM tabs WHERE session_id = ? AND workspace_id = ? ORDER BY sort_order ASC',
  );
  return stmt.all(sessionId, workspaceId) as Record<string, unknown>[];
}

export function getTab(db: Database, tabId: string): Record<string, unknown> | null {
  const stmt = db.prepare('SELECT * FROM tabs WHERE id = ?');
  return stmt.get(tabId) as Record<string, unknown> | null;
}

export function updateTab(
  db: Database,
  tabId: string,
  opts: { active?: number; order?: number; title?: string },
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
  if (opts.title !== undefined) {
    sets.push('title = ?');
    values.push(opts.title);
  }

  if (sets.length === 0) return;

  values.push(tabId);
  db.prepare(`UPDATE tabs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteTab(db: Database, tabId: string): void {
  db.prepare('DELETE FROM tabs WHERE id = ?').run(tabId);
}

export function reorderTabs(
  db: Database,
  sessionId: string,
  workspaceId: string,
  tabIds: string[],
): void {
  const updateStmt = db.prepare(
    'UPDATE tabs SET sort_order = ? WHERE id = ? AND session_id = ? AND workspace_id = ?',
  );

  const tx = db.transaction(() => {
    for (let i = 0; i < tabIds.length; i++) {
      updateStmt.run(i, tabIds[i], sessionId, workspaceId);
    }
  });

  tx();
}

export function setActiveTab(
  db: Database,
  sessionId: string,
  workspaceId: string,
  pane: string,
  tabId: string,
): void {
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE tabs SET active = 0 WHERE session_id = ? AND workspace_id = ? AND pane = ?',
    ).run(sessionId, workspaceId, pane);
    db.prepare(
      'UPDATE tabs SET active = 1 WHERE id = ? AND session_id = ? AND workspace_id = ? AND pane = ?',
    ).run(tabId, sessionId, workspaceId, pane);
  });

  tx();
}

export function createPane(db: Database, opts: { tabId: string; terminalId?: string }): string {
  const id = randomUUID();
  const stmt = db.prepare('INSERT INTO panes (id, tab_id, terminal_id) VALUES (?, ?, ?)');
  stmt.run(id, opts.tabId, opts.terminalId ?? null);
  return id;
}
