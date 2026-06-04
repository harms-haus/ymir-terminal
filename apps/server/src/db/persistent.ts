import { chmodSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { generateId } from '@ymir/shared';

export interface Workspace {
  id: string;
  name: string;
  cwd: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceInput {
  name: string;
  cwd: string;
  color?: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  cwd?: string;
  color?: string;
}

export function initDatabase(dbPath: string): Database {
  const db = new Database(dbPath);

  // Restrict file permissions to owner-only to protect the JWT signing secret
  if (dbPath !== ':memory:') {
    chmodSync(dbPath, 0o600);
  }

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

  // Idempotent migration: add sort_order column if it doesn't exist
  const columns = db.prepare('PRAGMA table_info(workspaces)').all() as { name: string }[];
  const hasSortOrder = columns.some((col) => col.name === 'sort_order');
  if (!hasSortOrder) {
    db.run('ALTER TABLE workspaces ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }

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
      worktree_path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
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

export function createWorkspace(db: Database, input: CreateWorkspaceInput): Workspace {
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO workspaces (id, name, cwd, color, sort_order)
    VALUES ($id, $name, $cwd, COALESCE($color, '#007acc'), (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM workspaces))
    RETURNING id, name, cwd, color, sort_order, created_at, updated_at
  `);
  return stmt.get({
    $id: id,
    $name: input.name,
    $cwd: input.cwd,
    $color: input.color ?? null,
  }) as Workspace;
}

export function listWorkspaces(db: Database): Workspace[] {
  const stmt = db.prepare(
    'SELECT id, name, cwd, color, sort_order, created_at, updated_at FROM workspaces ORDER BY sort_order ASC, name ASC',
  );
  return stmt.all() as Workspace[];
}

export function getWorkspace(db: Database, id: string): Workspace | null {
  const stmt = db.prepare(
    'SELECT id, name, cwd, color, sort_order, created_at, updated_at FROM workspaces WHERE id = $id',
  );
  return (stmt.get({ $id: id }) as Workspace | null) ?? null;
}

export function updateWorkspace(
  db: Database,
  id: string,
  input: UpdateWorkspaceInput,
): Workspace | null {
  const existing = getWorkspace(db, id);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const cwd = input.cwd ?? existing.cwd;
  const color = input.color ?? existing.color;

  const stmt = db.prepare(`
    UPDATE workspaces
    SET name = $name, cwd = $cwd, color = $color, updated_at = datetime('now')
    WHERE id = $id
    RETURNING id, name, cwd, color, sort_order, created_at, updated_at
  `);
  return stmt.get({
    $id: id,
    $name: name,
    $cwd: cwd,
    $color: color,
  }) as Workspace;
}

export function deleteWorkspace(db: Database, id: string): boolean {
  const stmt = db.prepare('DELETE FROM workspaces WHERE id = $id');
  const result = stmt.run({ $id: id });
  return result.changes > 0;
}

export function getConfigValue(db: Database, key: string): string | null {
  const stmt = db.prepare('SELECT value FROM server_config WHERE key = $key');
  const row = stmt.get({ $key: key }) as { value: string } | null;
  return row?.value ?? null;
}

export function setConfigValue(db: Database, key: string, value: string): void {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO server_config (key, value) VALUES ($key, $value)',
  );
  stmt.run({ $key: key, $value: value });
}

export function reorderWorkspaces(db: Database, workspaceIds: string[]): void {
  const updateStmt = db.prepare('UPDATE workspaces SET sort_order = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (let i = 0; i < workspaceIds.length; i++) {
      updateStmt.run(i, workspaceIds[i]);
    }
  });
  tx();
}

// ---------------------------------------------------------------------------
// Persisted tabs
// ---------------------------------------------------------------------------

export interface PersistedTab {
  id: string;
  workspace_id: string;
  tab_type: string;
  title: string | null;
  file_path: string | null;
  pane: string;
  sort_order: number;
  diff_ref: string | null;
  repo_path: string | null;
  commit_sha: string | null;
  parent_sha: string | null;
  cwd: string | null;
  custom_title: string | null;
  worktree_path: string | null;
  created_at: string;
}

export interface SavePersistedTabInput {
  id: string;
  workspaceId: string;
  tabType: string;
  title?: string | null;
  filePath?: string | null;
  pane?: string;
  sortOrder?: number;
  diffRef?: string | null;
  repoPath?: string | null;
  commitSha?: string | null;
  parentSha?: string | null;
  cwd?: string | null;
  customTitle?: string | null;
  worktreePath?: string | null;
}

export function savePersistedTab(db: Database, input: SavePersistedTabInput): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO persisted_tabs
      (id, workspace_id, tab_type, title, file_path, pane, sort_order, diff_ref, repo_path, commit_sha, parent_sha, cwd, custom_title, worktree_path)
    VALUES
      ($id, $workspaceId, $tabType, $title, $filePath, $pane, $sortOrder, $diffRef, $repoPath, $commitSha, $parentSha, $cwd, $customTitle, $worktreePath)
  `);
  stmt.run({
    $id: input.id,
    $workspaceId: input.workspaceId,
    $tabType: input.tabType,
    $title: input.title ?? null,
    $filePath: input.filePath ?? null,
    $pane: input.pane ?? 'content',
    $sortOrder: input.sortOrder ?? 0,
    $diffRef: input.diffRef ?? null,
    $repoPath: input.repoPath ?? null,
    $commitSha: input.commitSha ?? null,
    $parentSha: input.parentSha ?? null,
    $cwd: input.cwd ?? null,
    $customTitle: input.customTitle ?? null,
    $worktreePath: input.worktreePath ?? null,
  });
}

export function deletePersistedTab(db: Database, tabId: string): boolean {
  const stmt = db.prepare('DELETE FROM persisted_tabs WHERE id = ?');
  const result = stmt.run(tabId);
  return result.changes > 0;
}

export function updatePersistedTabOrder(db: Database, tabIds: string[]): void {
  const updateStmt = db.prepare('UPDATE persisted_tabs SET sort_order = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (let i = 0; i < tabIds.length; i++) {
      updateStmt.run(i, tabIds[i]);
    }
  });
  tx();
}

export function updatePersistedTabTitle(db: Database, tabId: string, title: string): void {
  db.prepare('UPDATE persisted_tabs SET custom_title = ? WHERE id = ?').run(title, tabId);
}

export function listPersistedTabsByWorkspace(
  db: Database,
  workspaceId: string,
  worktreePath?: string | null,
): PersistedTab[] {
  let query = 'SELECT * FROM persisted_tabs WHERE workspace_id = ?';
  const params: string[] = [workspaceId];

  if (worktreePath !== undefined && worktreePath !== null) {
    query += ' AND worktree_path = ?';
    params.push(worktreePath);
  } else {
    query += ' AND worktree_path IS NULL';
  }

  query += ' ORDER BY sort_order ASC';
  const stmt = db.prepare(query);
  return stmt.all(...params) as PersistedTab[];
}

export function deletePersistedTabsByWorkspace(db: Database, workspaceId: string): void {
  db.prepare('DELETE FROM persisted_tabs WHERE workspace_id = ?').run(workspaceId);
}
