import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  initDatabase,
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getConfigValue,
  setConfigValue,
} from './persistent';

describe('persistent database', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  it('initDatabase creates the workspaces table', () => {
    // Verify the table exists by querying its schema
    const tableInfo = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'")
      .all() as { name: string }[];
    expect(tableInfo.length).toBe(1);
    expect(tableInfo[0].name).toBe('workspaces');
  });

  it('createWorkspace inserts and returns workspace with generated UUID and timestamps', () => {
    const workspace = createWorkspace(db, {
      name: 'test',
      cwd: '/tmp/test',
      color: '#007acc',
    });

    expect(workspace.id).toBeDefined();
    expect(typeof workspace.id).toBe('string');
    expect(workspace.id.length).toBeGreaterThan(0);

    // Verify it's a valid UUID format
    expect(workspace.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    expect(workspace.name).toBe('test');
    expect(workspace.cwd).toBe('/tmp/test');
    expect(workspace.color).toBe('#007acc');
    expect(workspace.created_at).toBeDefined();
    expect(workspace.updated_at).toBeDefined();
    expect(typeof workspace.created_at).toBe('string');
    expect(typeof workspace.updated_at).toBe('string');
  });

  it('createWorkspace uses default color when not provided', () => {
    const workspace = createWorkspace(db, {
      name: 'no-color',
      cwd: '/tmp/no-color',
    });

    expect(workspace.color).toBe('#007acc');
  });

  it('listWorkspaces returns all workspaces ordered by name', () => {
    createWorkspace(db, { name: 'beta', cwd: '/tmp/beta' });
    createWorkspace(db, { name: 'alpha', cwd: '/tmp/alpha' });
    createWorkspace(db, { name: 'gamma', cwd: '/tmp/gamma' });

    const workspaces = listWorkspaces(db);

    expect(workspaces.length).toBe(3);
    expect(workspaces[0].name).toBe('alpha');
    expect(workspaces[1].name).toBe('beta');
    expect(workspaces[2].name).toBe('gamma');
  });

  it('listWorkspaces returns empty array when no workspaces exist', () => {
    const workspaces = listWorkspaces(db);
    expect(workspaces).toEqual([]);
  });

  it('getWorkspace returns single workspace by id', () => {
    const created = createWorkspace(db, {
      name: 'test',
      cwd: '/tmp/test',
      color: '#ff0000',
    });

    const fetched = getWorkspace(db, created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe('test');
    expect(fetched!.cwd).toBe('/tmp/test');
    expect(fetched!.color).toBe('#ff0000');
  });

  it('getWorkspace returns null for nonexistent id', () => {
    const result = getWorkspace(db, 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('updateWorkspace updates only provided fields and updates updated_at', async () => {
    const created = createWorkspace(db, {
      name: 'original',
      cwd: '/tmp/original',
      color: '#111111',
    });

    // Delay to ensure updated_at differs from created_at (datetime('now') has second granularity)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const updated = updateWorkspace(db, created.id, { name: 'updated' });

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(updated!.name).toBe('updated');
    expect(updated!.cwd).toBe('/tmp/original');
    expect(updated!.color).toBe('#111111');
    expect(updated!.created_at).toBe(created.created_at);
    expect(updated!.updated_at).not.toBe(created.updated_at);
  });

  it('updateWorkspace returns null for nonexistent id', () => {
    const result = updateWorkspace(db, 'nonexistent-id', { name: 'foo' });
    expect(result).toBeNull();
  });

  it('deleteWorkspace removes the workspace', () => {
    const created = createWorkspace(db, {
      name: 'to-delete',
      cwd: '/tmp/delete',
    });

    const deleted = deleteWorkspace(db, created.id);
    expect(deleted).toBe(true);

    const fetched = getWorkspace(db, created.id);
    expect(fetched).toBeNull();
  });

  it('deleteWorkspace returns false for nonexistent id', () => {
    const deleted = deleteWorkspace(db, 'nonexistent-id');
    expect(deleted).toBe(false);
  });

  it('initDatabase creates the server_config table', () => {
    const tableInfo = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='server_config'")
      .all() as { name: string }[];
    expect(tableInfo.length).toBe(1);
    expect(tableInfo[0].name).toBe('server_config');
  });

  it('getConfigValue returns null for a nonexistent key', () => {
    const result = getConfigValue(db, 'nonexistent-key');
    expect(result).toBeNull();
  });

  it('setConfigValue stores and getConfigValue retrieves the same value', () => {
    setConfigValue(db, 'theme', 'dark');
    const value = getConfigValue(db, 'theme');
    expect(value).toBe('dark');
  });

  it('setConfigValue with INSERT OR REPLACE updates an existing value', () => {
    setConfigValue(db, 'theme', 'dark');
    expect(getConfigValue(db, 'theme')).toBe('dark');

    setConfigValue(db, 'theme', 'light');
    expect(getConfigValue(db, 'theme')).toBe('light');
  });
});
