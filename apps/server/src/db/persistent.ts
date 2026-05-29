import { chmodSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { generateId } from '@ymir/shared';

export interface Workspace {
  id: string;
  name: string;
  cwd: string;
  color: string;
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

export function createWorkspace(db: Database, input: CreateWorkspaceInput): Workspace {
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO workspaces (id, name, cwd, color)
    VALUES ($id, $name, $cwd, COALESCE($color, '#007acc'))
    RETURNING id, name, cwd, color, created_at, updated_at
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
    'SELECT id, name, cwd, color, created_at, updated_at FROM workspaces ORDER BY name ASC',
  );
  return stmt.all() as Workspace[];
}

export function getWorkspace(db: Database, id: string): Workspace | null {
  const stmt = db.prepare(
    'SELECT id, name, cwd, color, created_at, updated_at FROM workspaces WHERE id = $id',
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
    RETURNING id, name, cwd, color, created_at, updated_at
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


