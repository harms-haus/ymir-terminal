import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
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
  savePersistedTab,
  listPersistedTabsByWorkspace,
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

  it('listWorkspaces returns all workspaces ordered by sort_order then name', () => {
    createWorkspace(db, { name: 'beta', cwd: '/tmp/beta' });
    createWorkspace(db, { name: 'alpha', cwd: '/tmp/alpha' });
    createWorkspace(db, { name: 'gamma', cwd: '/tmp/gamma' });

    const workspaces = listWorkspaces(db);

    expect(workspaces.length).toBe(3);
    // sort_order is assigned incrementally on creation: beta=0, alpha=1, gamma=2
    expect(workspaces[0].name).toBe('beta');
    expect(workspaces[1].name).toBe('alpha');
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

    // Sleep to ensure datetime('now') returns a different second (SQLite has second-granularity timestamps)
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

  // =========================================================================
  // worktree_path support in persisted tabs
  // =========================================================================

  describe('worktree_path in persisted tabs', () => {
    it('savePersistedTab with worktreePath stores worktree_path correctly', () => {
      savePersistedTab(db, {
        id: 'ptab-1',
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Worktree Tab',
        pane: 'content',
        sortOrder: 0,
        worktreePath: '/repos/my-repo/worktrees/feature-branch',
      } as Parameters<typeof savePersistedTab>[1]);

      const row = db
        .query('SELECT worktree_path FROM persisted_tabs WHERE id = ?')
        .get('ptab-1') as { worktree_path: string | null } | null;
      expect(row).not.toBeNull();
      expect(row!.worktree_path).toBe('/repos/my-repo/worktrees/feature-branch');
    });

    it('savePersistedTab without worktreePath stores NULL', () => {
      savePersistedTab(db, {
        id: 'ptab-2',
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Non-Worktree Tab',
        pane: 'content',
        sortOrder: 0,
      });

      const row = db
        .query('SELECT worktree_path FROM persisted_tabs WHERE id = ?')
        .get('ptab-2') as { worktree_path: string | null } | null;
      expect(row).not.toBeNull();
      expect(row!.worktree_path).toBeNull();
    });

    it('listPersistedTabsByWorkspace with worktreePath filter returns only matching tabs', () => {
      savePersistedTab(db, {
        id: 'ptab-3',
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Feature Tab',
        pane: 'content',
        sortOrder: 0,
        worktreePath: '/repos/my-repo/worktrees/feature',
      } as Parameters<typeof savePersistedTab>[1]);

      savePersistedTab(db, {
        id: 'ptab-4',
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Root Tab',
        pane: 'content',
        sortOrder: 1,
      });

      savePersistedTab(db, {
        id: 'ptab-5',
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Hotfix Tab',
        pane: 'content',
        sortOrder: 2,
        worktreePath: '/repos/my-repo/worktrees/hotfix',
      } as Parameters<typeof savePersistedTab>[1]);

      const filtered = listPersistedTabsByWorkspace(db, 'ws-1', '/repos/my-repo/worktrees/feature');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Feature Tab');
    });

    it('listPersistedTabsByWorkspace without worktreePath filter returns only NULL worktree_path tabs', () => {
      savePersistedTab(db, {
        id: 'ptab-6',
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Feature Tab',
        pane: 'content',
        sortOrder: 0,
        worktreePath: '/repos/my-repo/worktrees/feature',
      } as Parameters<typeof savePersistedTab>[1]);

      savePersistedTab(db, {
        id: 'ptab-7',
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Root Tab',
        pane: 'content',
        sortOrder: 1,
      });

      const filtered = listPersistedTabsByWorkspace(db, 'ws-1');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Root Tab');
    });

    it('listPersistedTabsByWorkspace with explicit null worktreePath returns only NULL worktree_path tabs', () => {
      savePersistedTab(db, {
        id: 'ptab-8',
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Feature Tab',
        pane: 'content',
        sortOrder: 0,
        worktreePath: '/repos/my-repo/worktrees/feature',
      } as Parameters<typeof savePersistedTab>[1]);

      savePersistedTab(db, {
        id: 'ptab-9',
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Root Tab',
        pane: 'content',
        sortOrder: 1,
      });

      // Pass null explicitly — should behave like undefined (IS NULL filter)
      const filtered = listPersistedTabsByWorkspace(db, 'ws-1', null);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Root Tab');
    });
  });

  // =========================================================================
  // worktree_path migration from old DB schema
  // =========================================================================

  describe('worktree_path migration', () => {
    let tmpDir: string;
    let tempDbPath: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'persistent-test-'));
      tempDbPath = join(tmpDir, 'test.db');
    });

    afterEach(() => {
      // On Windows, SQLite WAL/SHM files may still be locked briefly after db.close().
      // Retry removal with a small delay to handle EBUSY errors.
      let retries = 0;
      while (retries < 10) {
        try {
          rmSync(tmpDir, { recursive: true, force: true });
          break;
        } catch {
          retries++;
          // Synchronous busy-wait is fine in tests
          const end = Date.now() + 50;
          while (Date.now() < end) {}
        }
      }
    });

    it('upgrades an old persisted_tabs table (without worktree_path) via initDatabase', () => {
      // 1. Create an old-style persisted_tabs table (no worktree_path column)
      const oldDb = new Database(tempDbPath);
      oldDb.run(`
        CREATE TABLE persisted_tabs (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          tab_type TEXT NOT NULL CHECK(tab_type IN ('terminal', 'editor', 'diff', 'git-tree', 'agent')),
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
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // 2. Insert a row using the old schema (no worktree_path)
      oldDb.run(
        `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['old-tab-1', 'ws-1', 'terminal', 'Legacy Tab', 'content', 0],
      );

      // Verify the old row exists
      const oldRow = oldDb.query('SELECT id FROM persisted_tabs WHERE id = ?').get('old-tab-1') as {
        id: string;
      } | null;
      expect(oldRow).not.toBeNull();
      expect(oldRow!.id).toBe('old-tab-1');

      // 3. Close the old DB
      oldDb.close();

      // 4. Open with initDatabase — this should detect the missing column and add it
      const db = initDatabase(tempDbPath);

      // 5. Verify worktree_path column now exists in persisted_tabs
      const columns = db.query('PRAGMA table_info(persisted_tabs)').all() as { name: string }[];
      const hasWorktreePath = columns.some((col) => col.name === 'worktree_path');
      expect(hasWorktreePath).toBe(true);

      // 6. Verify the old row survived the migration
      const migratedRow = db
        .query('SELECT id, title FROM persisted_tabs WHERE id = ?')
        .get('old-tab-1') as { id: string; title: string } | null;
      expect(migratedRow).not.toBeNull();
      expect(migratedRow!.id).toBe('old-tab-1');
      expect(migratedRow!.title).toBe('Legacy Tab');

      // 7. Verify savePersistedTab with worktreePath succeeds without error
      savePersistedTab(db, {
        id: 'new-tab-1',
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Worktree Tab',
        pane: 'content',
        sortOrder: 1,
        worktreePath: '/repos/my-repo/worktrees/feature',
      } as Parameters<typeof savePersistedTab>[1]);

      const newRow = db
        .query('SELECT id, worktree_path FROM persisted_tabs WHERE id = ?')
        .get('new-tab-1') as { id: string; worktree_path: string | null } | null;
      expect(newRow).not.toBeNull();
      expect(newRow!.worktree_path).toBe('/repos/my-repo/worktrees/feature');

      // 8. Verify listPersistedTabsByWorkspace with worktreePath filter works
      const filtered = listPersistedTabsByWorkspace(db, 'ws-1', '/repos/my-repo/worktrees/feature');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('new-tab-1');
      expect(filtered[0].title).toBe('Worktree Tab');

      // 9. Verify the old row (no worktree_path) is returned when querying without filter
      const rootTabs = listPersistedTabsByWorkspace(db, 'ws-1');
      expect(rootTabs).toHaveLength(1);
      expect(rootTabs[0].id).toBe('old-tab-1');
      expect(rootTabs[0].title).toBe('Legacy Tab');

      db.close();
    });
  });
});
