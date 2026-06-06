import type { Database } from 'bun:sqlite';

export function createWorkspaceTerminal(
  db: Database,
  opts: {
    id: string;
    workspaceId: string;
    cwd: string;
    cols: number;
    rows: number;
    shell?: string;
    worktreePath?: string | null;
  },
): void {
  const stmt = db.prepare(
    'INSERT INTO workspace_terminals (id, workspace_id, cwd, cols, rows, shell, worktree_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  stmt.run(
    opts.id,
    opts.workspaceId,
    opts.cwd,
    opts.cols,
    opts.rows,
    opts.shell ?? null,
    opts.worktreePath ?? null,
  );
}

export function getWorkspaceTerminal(db: Database, id: string): Record<string, unknown> | null {
  const stmt = db.prepare('SELECT * FROM workspace_terminals WHERE id = ?');
  return stmt.get(id) as Record<string, unknown> | null;
}

export function listWorkspaceTerminalsByWorkspace(
  db: Database,
  workspaceId: string,
  worktreePath?: string | null,
): Record<string, unknown>[] {
  let query = 'SELECT * FROM workspace_terminals WHERE workspace_id = ?';
  const params: string[] = [workspaceId];

  if (worktreePath !== undefined && worktreePath !== null) {
    query += ' AND worktree_path = ?';
    params.push(worktreePath);
  } else {
    query += ' AND worktree_path IS NULL';
  }

  query += ' ORDER BY created_at';
  return db.prepare(query).all(...params) as Record<string, unknown>[];
}

export function updateWorkspaceTerminalSize(
  db: Database,
  id: string,
  cols: number,
  rows: number,
): void {
  db.prepare('UPDATE workspace_terminals SET cols = ?, rows = ? WHERE id = ?').run(cols, rows, id);
}

export function deleteWorkspaceTerminal(db: Database, id: string): void {
  try {
    db.prepare('DELETE FROM workspace_terminals WHERE id = ?').run(id);
  } catch {
    // Idempotent: the row may have already been removed, or the in-memory
    // DB may have been closed during shutdown before this callback fired.
  }
}

export function deleteWorkspaceTerminalsByWorkspace(db: Database, workspaceId: string): void {
  db.prepare('DELETE FROM workspace_terminals WHERE workspace_id = ?').run(workspaceId);
}
