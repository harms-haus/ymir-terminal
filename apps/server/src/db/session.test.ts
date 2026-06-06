import { test, expect, describe, beforeEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import {
  initSessionDb,
  createSession,
  deleteSession,
  createTab,
  listTabs,
  updateTab,
  deleteTab,
  createPane,
  createTerminalInstance,
  getTerminalInstance,
  updateTerminalSize,
  deleteTerminalInstance,
  cleanupSession,
  createWorkspaceTerminal,
  getWorkspaceTerminal,
  listWorkspaceTerminalsByWorkspace,
  updateWorkspaceTerminalSize,
  deleteWorkspaceTerminal,
  deleteWorkspaceTerminalsByWorkspace,
} from './session';
import { createBottomPanelTab, listBottomPanelTabs } from './session/bottom-panel';

describe('session database', () => {
  let db: Database;

  beforeEach(() => {
    db = initSessionDb();
  });

  // 1. initSessionDb() returns a Database with all tables created
  test('initSessionDb returns a Database with all tables created', () => {
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('client_sessions');
    expect(tableNames).toContain('tabs');
    expect(tableNames).toContain('panes');
    expect(tableNames).toContain('terminal_instances');
    expect(tableNames).toContain('bottom_panel_tabs');
    expect(tableNames).toContain('workspace_terminals');
  });

  // 2. createSession(db) inserts into client_sessions and returns id
  test('createSession inserts into client_sessions and returns id', () => {
    const id = createSession(db);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');

    const row = db.query('SELECT id FROM client_sessions WHERE id = ?').get(id) as {
      id: string;
    } | null;
    expect(row).not.toBeNull();
    expect(row!.id).toBe(id);
  });

  // 3. deleteSession(db, sessionId) cascades deletes all related records
  test('deleteSession cascades deletes all related records', () => {
    const sessionId = createSession(db);
    const tabId = createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'Tab 1',
      order: 0,
    });
    const paneId = createPane(db, { tabId });
    const terminalId = createTerminalInstance(db, {
      sessionId,
      workspaceId: 'ws1',
      paneId,
      cols: 120,
      rows: 40,
    });
    const bptId = createBottomPanelTab(db, {
      sessionId,
      workspaceId: 'ws1',
      terminalId,
      order: 0,
    });

    // Verify records exist
    expect(db.query('SELECT id FROM tabs WHERE id = ?').get(tabId)).not.toBeNull();
    expect(db.query('SELECT id FROM panes WHERE id = ?').get(paneId)).not.toBeNull();
    expect(
      db.query('SELECT id FROM terminal_instances WHERE id = ?').get(terminalId),
    ).not.toBeNull();
    expect(db.query('SELECT id FROM bottom_panel_tabs WHERE id = ?').get(bptId)).not.toBeNull();

    // Delete session
    deleteSession(db, sessionId);

    // Verify all cascaded away
    expect(db.query('SELECT id FROM client_sessions WHERE id = ?').get(sessionId)).toBeNull();
    expect(db.query('SELECT id FROM tabs WHERE id = ?').get(tabId)).toBeNull();
    expect(db.query('SELECT id FROM panes WHERE id = ?').get(paneId)).toBeNull();
    expect(db.query('SELECT id FROM terminal_instances WHERE id = ?').get(terminalId)).toBeNull();
    expect(db.query('SELECT id FROM bottom_panel_tabs WHERE id = ?').get(bptId)).toBeNull();
  });

  // 4. createTab inserts and returns id
  test('createTab inserts and returns id', () => {
    const sessionId = createSession(db);
    const tabId = createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'My Tab',
      filePath: '/some/path.ts',
      order: 1,
    });

    expect(tabId).toBeTruthy();
    const row = db.query('SELECT * FROM tabs WHERE id = ?').get(tabId) as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.id).toBe(tabId);
    expect(row.session_id).toBe(sessionId);
    expect(row.workspace_id).toBe('ws1');
    expect(row.tab_type).toBe('terminal');
    expect(row.title).toBe('My Tab');
    expect(row.file_path).toBe('/some/path.ts');
    expect(row.sort_order).toBe(1);
  });

  // 5. listTabs returns tabs ordered by sort_order
  test('listTabs returns tabs ordered by sort_order', () => {
    const sessionId = createSession(db);

    createTab(db, { sessionId, workspaceId: 'ws1', tabType: 'terminal', title: 'C', order: 2 });
    createTab(db, { sessionId, workspaceId: 'ws1', tabType: 'editor', title: 'A', order: 0 });
    createTab(db, { sessionId, workspaceId: 'ws1', tabType: 'terminal', title: 'B', order: 1 });

    // Also create a tab in a different workspace to verify filtering
    createTab(db, { sessionId, workspaceId: 'ws2', tabType: 'terminal', title: 'Other', order: 0 });

    const tabs = listTabs(db, sessionId, 'ws1') as Record<string, unknown>[];
    expect(tabs.length).toBe(3);
    expect(tabs[0].title).toBe('A');
    expect(tabs[1].title).toBe('B');
    expect(tabs[2].title).toBe('C');
  });

  // 6. updateTab updates fields
  test('updateTab updates active and order fields', () => {
    const sessionId = createSession(db);
    const tabId = createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'Tab',
      order: 0,
    });

    updateTab(db, tabId, { active: 1, order: 5 });

    const row = db.query('SELECT active, sort_order FROM tabs WHERE id = ?').get(tabId) as {
      active: number;
      sort_order: number;
    };
    expect(row.active).toBe(1);
    expect(row.sort_order).toBe(5);
  });

  // 7. deleteTab removes tab
  test('deleteTab removes tab', () => {
    const sessionId = createSession(db);
    const tabId = createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'Tab',
      order: 0,
    });

    expect(db.query('SELECT id FROM tabs WHERE id = ?').get(tabId)).not.toBeNull();
    deleteTab(db, tabId);
    expect(db.query('SELECT id FROM tabs WHERE id = ?').get(tabId)).toBeNull();
  });

  // 8. createPane inserts and returns id
  test('createPane inserts and returns id', () => {
    const sessionId = createSession(db);
    const tabId = createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'Tab',
      order: 0,
    });

    const paneId = createPane(db, { tabId, terminalId: 't1' });
    expect(paneId).toBeTruthy();

    const row = db.query('SELECT * FROM panes WHERE id = ?').get(paneId) as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.id).toBe(paneId);
    expect(row.tab_id).toBe(tabId);
    expect(row.terminal_id).toBe('t1');
  });

  // 9. createTerminalInstance inserts and returns id
  test('createTerminalInstance inserts and returns id', () => {
    const sessionId = createSession(db);
    const tabId = createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'Tab',
      order: 0,
    });
    const paneId = createPane(db, { tabId });

    const terminalId = createTerminalInstance(db, {
      sessionId,
      workspaceId: 'ws1',
      paneId,
      cols: 120,
      rows: 40,
    });

    expect(terminalId).toBeTruthy();

    const row = db.query('SELECT * FROM terminal_instances WHERE id = ?').get(terminalId) as Record<
      string,
      unknown
    >;
    expect(row).not.toBeNull();
    expect(row.id).toBe(terminalId);
    expect(row.session_id).toBe(sessionId);
    expect(row.workspace_id).toBe('ws1');
    expect(row.pane_id).toBe(paneId);
    expect(row.cols).toBe(120);
    expect(row.rows).toBe(40);
  });

  // 10. getTerminalInstance returns instance or null
  test('getTerminalInstance returns instance or null', () => {
    const sessionId = createSession(db);

    // Not found
    expect(getTerminalInstance(db, 'nonexistent')).toBeNull();

    // Found
    const terminalId = createTerminalInstance(db, {
      sessionId,
      workspaceId: 'ws1',
      cols: 80,
      rows: 24,
    });

    const instance = getTerminalInstance(db, terminalId) as Record<string, unknown>;
    expect(instance).not.toBeNull();
    expect(instance!.id).toBe(terminalId);
  });

  // 11. updateTerminalSize updates size
  test('updateTerminalSize updates cols and rows', () => {
    const sessionId = createSession(db);
    const terminalId = createTerminalInstance(db, {
      sessionId,
      workspaceId: 'ws1',
      cols: 80,
      rows: 24,
    });

    updateTerminalSize(db, terminalId, 200, 50);

    const row = db
      .query('SELECT cols, rows FROM terminal_instances WHERE id = ?')
      .get(terminalId) as { cols: number; rows: number };
    expect(row.cols).toBe(200);
    expect(row.rows).toBe(50);
  });

  // 12. deleteTerminalInstance removes
  test('deleteTerminalInstance removes terminal', () => {
    const sessionId = createSession(db);
    const terminalId = createTerminalInstance(db, {
      sessionId,
      workspaceId: 'ws1',
      cols: 80,
      rows: 24,
    });

    expect(getTerminalInstance(db, terminalId)).not.toBeNull();
    deleteTerminalInstance(db, terminalId);
    expect(getTerminalInstance(db, terminalId)).toBeNull();
  });

  // 13. createBottomPanelTab inserts
  test('createBottomPanelTab inserts and returns id', () => {
    const sessionId = createSession(db);
    const bptId = createBottomPanelTab(db, {
      sessionId,
      workspaceId: 'ws1',
      terminalId: 'term1',
      order: 3,
    });

    expect(bptId).toBeTruthy();

    const row = db.query('SELECT * FROM bottom_panel_tabs WHERE id = ?').get(bptId) as Record<
      string,
      unknown
    >;
    expect(row).not.toBeNull();
    expect(row.id).toBe(bptId);
    expect(row.session_id).toBe(sessionId);
    expect(row.workspace_id).toBe('ws1');
    expect(row.terminal_id).toBe('term1');
    expect(row.sort_order).toBe(3);
  });

  // 14. listBottomPanelTabs returns ordered tabs
  test('listBottomPanelTabs returns ordered tabs', () => {
    const sessionId = createSession(db);

    createBottomPanelTab(db, { sessionId, workspaceId: 'ws1', order: 2 });
    createBottomPanelTab(db, { sessionId, workspaceId: 'ws1', order: 0 });
    createBottomPanelTab(db, { sessionId, workspaceId: 'ws1', order: 1 });

    // Different workspace - should not appear
    createBottomPanelTab(db, { sessionId, workspaceId: 'ws2', order: 0 });

    const tabs = listBottomPanelTabs(db, sessionId, 'ws1') as Record<string, unknown>[];
    expect(tabs.length).toBe(3);
    expect(tabs[0].sort_order).toBe(0);
    expect(tabs[1].sort_order).toBe(1);
    expect(tabs[2].sort_order).toBe(2);
  });

  // 15. createTab with arbitrary pane ID works
  test('createTab with arbitrary pane ID works', () => {
    const sessionId = createSession(db);
    const tabId = createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'Custom Pane Tab',
      pane: 'pane-abc-123',
      order: 0,
    });

    expect(tabId).toBeTruthy();

    const row = db.query('SELECT * FROM tabs WHERE id = ?').get(tabId) as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.pane).toBe('pane-abc-123');
  });

  // 16. listTabs filters by arbitrary pane ID
  test('listTabs filters by arbitrary pane ID', () => {
    const sessionId = createSession(db);

    // Create tabs with different panes
    createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'Pane A',
      pane: 'pane-abc-123',
      order: 0,
    });
    createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'editor',
      title: 'Pane B',
      pane: 'my-custom-pane',
      order: 1,
    });
    createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'Default Pane',
      pane: 'content',
      order: 2,
    });

    // Filter by arbitrary pane ID
    const filtered = listTabs(db, sessionId, 'ws1', 'pane-abc-123') as Record<string, unknown>[];
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe('Pane A');

    // Filter by another arbitrary pane ID
    const filtered2 = listTabs(db, sessionId, 'ws1', 'my-custom-pane') as Record<string, unknown>[];
    expect(filtered2.length).toBe(1);
    expect(filtered2[0].title).toBe('Pane B');

    // Filter by content (standard pane) still works
    const filtered3 = listTabs(db, sessionId, 'ws1', 'content') as Record<string, unknown>[];
    expect(filtered3.length).toBe(1);
    expect(filtered3[0].title).toBe('Default Pane');
  });

  // 17. cleanupSession deletes all related records
  test('cleanupSession deletes all related records', () => {
    const sessionId = createSession(db);
    const tabId = createTab(db, {
      sessionId,
      workspaceId: 'ws1',
      tabType: 'terminal',
      title: 'Tab',
      order: 0,
    });
    const paneId = createPane(db, { tabId });
    const terminalId = createTerminalInstance(db, {
      sessionId,
      workspaceId: 'ws1',
      paneId,
      cols: 80,
      rows: 24,
    });
    createBottomPanelTab(db, { sessionId, workspaceId: 'ws1', terminalId, order: 0 });

    // Verify all exist
    expect(db.query('SELECT id FROM tabs WHERE session_id = ?').all(sessionId).length).toBe(1);
    expect(db.query('SELECT id FROM panes WHERE tab_id = ?').all(tabId).length).toBe(1);
    expect(
      db.query('SELECT id FROM terminal_instances WHERE session_id = ?').all(sessionId).length,
    ).toBe(1);
    expect(
      db.query('SELECT id FROM bottom_panel_tabs WHERE session_id = ?').all(sessionId).length,
    ).toBe(1);

    cleanupSession(db, sessionId);

    // Session itself should also be deleted
    expect(
      db.query('SELECT id FROM client_sessions WHERE id = ?').get(sessionId) as {
        id: string;
      } | null,
    ).toBeNull();

    // All related records gone
    expect(db.query('SELECT id FROM tabs WHERE session_id = ?').all(sessionId).length).toBe(0);
    expect(db.query('SELECT id FROM panes WHERE tab_id = ?').all(tabId).length).toBe(0);
    expect(
      db.query('SELECT id FROM terminal_instances WHERE session_id = ?').all(sessionId).length,
    ).toBe(0);
    expect(
      db.query('SELECT id FROM bottom_panel_tabs WHERE session_id = ?').all(sessionId).length,
    ).toBe(0);
  });

  // =========================================================================
  // worktree_path support
  // =========================================================================

  describe('worktree_path in tabs', () => {
    test('createTab with worktreePath stores worktree_path correctly', () => {
      const sessionId = createSession(db);
      const tabId = createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'terminal',
        title: 'Worktree Tab',
        order: 0,
        worktreePath: '/repos/my-repo/worktrees/feature-branch',
      });

      const row = db.query('SELECT worktree_path FROM tabs WHERE id = ?').get(tabId) as {
        worktree_path: string | null;
      } | null;
      expect(row).not.toBeNull();
      expect(row!.worktree_path).toBe('/repos/my-repo/worktrees/feature-branch');
    });

    test('createTab without worktreePath stores NULL', () => {
      const sessionId = createSession(db);
      const tabId = createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'terminal',
        title: 'Non-Worktree Tab',
        order: 0,
      });

      const row = db.query('SELECT worktree_path FROM tabs WHERE id = ?').get(tabId) as {
        worktree_path: string | null;
      } | null;
      expect(row).not.toBeNull();
      expect(row!.worktree_path).toBeNull();
    });

    test('listTabs with worktreePath filter returns only matching tabs', () => {
      const sessionId = createSession(db);

      // Create a tab WITH worktree_path
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'terminal',
        title: 'Worktree Tab',
        order: 0,
        worktreePath: '/repos/my-repo/worktrees/feature',
      });

      // Create a tab WITHOUT worktree_path
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'editor',
        title: 'Non-Worktree Tab',
        order: 1,
      });

      // Create a tab with a DIFFERENT worktree_path
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'terminal',
        title: 'Other Worktree Tab',
        order: 2,
        worktreePath: '/repos/my-repo/worktrees/hotfix',
      });

      const filtered = listTabs(
        db,
        sessionId,
        'ws1',
        undefined,
        '/repos/my-repo/worktrees/feature',
      ) as Record<string, unknown>[];

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Worktree Tab');
    });

    test('listTabs without worktreePath filter returns only tabs where worktree_path IS NULL', () => {
      const sessionId = createSession(db);

      // Create a tab WITH worktree_path
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'terminal',
        title: 'Worktree Tab',
        order: 0,
        worktreePath: '/repos/my-repo/worktrees/feature',
      });

      // Create a tab WITHOUT worktree_path
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'editor',
        title: 'Non-Worktree Tab',
        order: 1,
      });

      const filtered = listTabs(db, sessionId, 'ws1') as Record<string, unknown>[];

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Non-Worktree Tab');
    });

    test('listTabs correctly filters mixed worktree and non-worktree tabs', () => {
      const sessionId = createSession(db);

      // Non-worktree tab
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'editor',
        title: 'Root Editor',
        order: 0,
      });

      // Worktree A tab
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'terminal',
        title: 'Feature Terminal',
        order: 1,
        worktreePath: '/repos/repo/worktrees/feature',
      });

      // Worktree B tab
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'terminal',
        title: 'Hotfix Terminal',
        order: 2,
        worktreePath: '/repos/repo/worktrees/hotfix',
      });

      // Another non-worktree tab
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'editor',
        title: 'Root Diff',
        order: 3,
      });

      // Filter: no worktreePath → should get only NULL worktree_path tabs
      const nullFiltered = listTabs(db, sessionId, 'ws1') as Record<string, unknown>[];
      expect(nullFiltered).toHaveLength(2);
      expect(nullFiltered.map((t) => t.title)).toEqual(['Root Editor', 'Root Diff']);

      // Filter: worktree A → only feature tab
      const featureFiltered = listTabs(
        db,
        sessionId,
        'ws1',
        undefined,
        '/repos/repo/worktrees/feature',
      ) as Record<string, unknown>[];
      expect(featureFiltered).toHaveLength(1);
      expect(featureFiltered[0].title).toBe('Feature Terminal');

      // Filter: worktree B → only hotfix tab
      const hotfixFiltered = listTabs(
        db,
        sessionId,
        'ws1',
        undefined,
        '/repos/repo/worktrees/hotfix',
      ) as Record<string, unknown>[];
      expect(hotfixFiltered).toHaveLength(1);
      expect(hotfixFiltered[0].title).toBe('Hotfix Terminal');
    });

    test('listTabs with explicit null worktreePath returns only non-worktree tabs', () => {
      const sessionId = createSession(db);

      // Create a tab WITH worktree_path
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'terminal',
        title: 'Worktree Tab',
        order: 0,
        worktreePath: '/repos/my-repo/worktrees/feature',
      });

      // Create a tab WITHOUT worktree_path
      createTab(db, {
        sessionId,
        workspaceId: 'ws1',
        tabType: 'editor',
        title: 'Non-Worktree Tab',
        order: 1,
      });

      // Pass null explicitly — should behave like undefined (IS NULL filter)
      const filtered = listTabs(db, sessionId, 'ws1', undefined, null) as Record<string, unknown>[];

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Non-Worktree Tab');
    });
  });

  // =========================================================================
  // workspace_terminals
  // =========================================================================

  describe('workspace_terminals', () => {
    test('createWorkspaceTerminal inserts a row', () => {
      createWorkspaceTerminal(db, {
        id: 'wt-1',
        workspaceId: 'ws1',
        cwd: '/home/user/project',
        cols: 120,
        rows: 40,
        shell: '/bin/zsh',
      });

      const row = getWorkspaceTerminal(db, 'wt-1') as Record<string, unknown>;
      expect(row).not.toBeNull();
      expect(row.id).toBe('wt-1');
      expect(row.workspace_id).toBe('ws1');
      expect(row.cwd).toBe('/home/user/project');
      expect(row.cols).toBe(120);
      expect(row.rows).toBe(40);
      expect(row.shell).toBe('/bin/zsh');
      expect(row.created_at).toBeTruthy();
    });

    test('getWorkspaceTerminal returns null for nonexistent id', () => {
      expect(getWorkspaceTerminal(db, 'nonexistent')).toBeNull();
    });

    test('listWorkspaceTerminalsByWorkspace returns only terminals for given workspace', () => {
      createWorkspaceTerminal(db, {
        id: 'wt-1',
        workspaceId: 'ws1',
        cwd: '/a',
        cols: 80,
        rows: 24,
      });
      createWorkspaceTerminal(db, {
        id: 'wt-2',
        workspaceId: 'ws1',
        cwd: '/b',
        cols: 80,
        rows: 24,
      });
      createWorkspaceTerminal(db, {
        id: 'wt-3',
        workspaceId: 'ws2',
        cwd: '/c',
        cols: 80,
        rows: 24,
      });

      const ws1 = listWorkspaceTerminalsByWorkspace(db, 'ws1');
      expect(ws1).toHaveLength(2);
      expect(ws1.map((r) => r.id)).toEqual(['wt-1', 'wt-2']);

      const ws2 = listWorkspaceTerminalsByWorkspace(db, 'ws2');
      expect(ws2).toHaveLength(1);
      expect(ws2[0].id).toBe('wt-3');
    });

    test('updateWorkspaceTerminalSize updates cols and rows', () => {
      createWorkspaceTerminal(db, {
        id: 'wt-1',
        workspaceId: 'ws1',
        cwd: '/home',
        cols: 80,
        rows: 24,
      });

      updateWorkspaceTerminalSize(db, 'wt-1', 200, 50);

      const row = getWorkspaceTerminal(db, 'wt-1') as Record<string, unknown>;
      expect(row.cols).toBe(200);
      expect(row.rows).toBe(50);
    });

    test('deleteWorkspaceTerminal removes the row', () => {
      createWorkspaceTerminal(db, {
        id: 'wt-1',
        workspaceId: 'ws1',
        cwd: '/home',
        cols: 80,
        rows: 24,
      });

      expect(getWorkspaceTerminal(db, 'wt-1')).not.toBeNull();
      deleteWorkspaceTerminal(db, 'wt-1');
      expect(getWorkspaceTerminal(db, 'wt-1')).toBeNull();
    });

    test('deleteWorkspaceTerminal is idempotent', () => {
      // Should not throw on nonexistent id
      deleteWorkspaceTerminal(db, 'nonexistent');
    });

    test('deleteWorkspaceTerminalsByWorkspace removes all terminals for workspace', () => {
      createWorkspaceTerminal(db, {
        id: 'wt-1',
        workspaceId: 'ws1',
        cwd: '/a',
        cols: 80,
        rows: 24,
      });
      createWorkspaceTerminal(db, {
        id: 'wt-2',
        workspaceId: 'ws1',
        cwd: '/b',
        cols: 80,
        rows: 24,
      });
      createWorkspaceTerminal(db, {
        id: 'wt-3',
        workspaceId: 'ws2',
        cwd: '/c',
        cols: 80,
        rows: 24,
      });

      deleteWorkspaceTerminalsByWorkspace(db, 'ws1');

      expect(listWorkspaceTerminalsByWorkspace(db, 'ws1')).toHaveLength(0);
      expect(listWorkspaceTerminalsByWorkspace(db, 'ws2')).toHaveLength(1);
    });

    test('workspace terminals survive session cleanup', () => {
      const sessionId = createSession(db);

      createWorkspaceTerminal(db, {
        id: 'wt-survive',
        workspaceId: 'ws1',
        cwd: '/home/user/project',
        cols: 100,
        rows: 30,
        shell: '/bin/bash',
      });

      // Also create a session-scoped terminal to verify it gets cleaned up
      const terminalId = createTerminalInstance(db, {
        sessionId,
        workspaceId: 'ws1',
        cols: 80,
        rows: 24,
      });

      cleanupSession(db, sessionId);

      // Session-scoped terminal should be gone
      expect(getTerminalInstance(db, terminalId)).toBeNull();

      // Workspace terminal must still exist
      const row = getWorkspaceTerminal(db, 'wt-survive') as Record<string, unknown>;
      expect(row).not.toBeNull();
      expect(row.id).toBe('wt-survive');
      expect(row.workspace_id).toBe('ws1');
      expect(row.cwd).toBe('/home/user/project');
      expect(row.cols).toBe(100);
      expect(row.rows).toBe(30);
      expect(row.shell).toBe('/bin/bash');
    });
  });

  // =========================================================================
  // worktree_path in workspace_terminals
  // =========================================================================

  describe('worktree_path in workspace_terminals', () => {
    test('createWorkspaceTerminal with worktreePath stores worktree_path correctly', () => {
      createWorkspaceTerminal(db, {
        id: 'wt-wt-1',
        workspaceId: 'ws1',
        cwd: '/repos/repo',
        cols: 80,
        rows: 24,
        worktreePath: '/repos/repo/worktrees/feature',
      });

      const row = db
        .query('SELECT worktree_path FROM workspace_terminals WHERE id = ?')
        .get('wt-wt-1') as { worktree_path: string | null } | null;
      expect(row).not.toBeNull();
      expect(row!.worktree_path).toBe('/repos/repo/worktrees/feature');
    });

    test('createWorkspaceTerminal without worktreePath stores NULL', () => {
      createWorkspaceTerminal(db, {
        id: 'wt-wt-2',
        workspaceId: 'ws1',
        cwd: '/repos/repo',
        cols: 80,
        rows: 24,
      });

      const row = db
        .query('SELECT worktree_path FROM workspace_terminals WHERE id = ?')
        .get('wt-wt-2') as { worktree_path: string | null } | null;
      expect(row).not.toBeNull();
      expect(row!.worktree_path).toBeNull();
    });

    test('listWorkspaceTerminalsByWorkspace with worktreePath filter returns only matching terminals', () => {
      // Create terminals with different worktree_path values in the same workspace
      createWorkspaceTerminal(db, {
        id: 'wt-feat',
        workspaceId: 'ws1',
        cwd: '/repos/repo',
        cols: 80,
        rows: 24,
        worktreePath: '/repos/repo/worktrees/feature',
      });
      createWorkspaceTerminal(db, {
        id: 'wt-fix',
        workspaceId: 'ws1',
        cwd: '/repos/repo',
        cols: 80,
        rows: 24,
        worktreePath: '/repos/repo/worktrees/hotfix',
      });
      createWorkspaceTerminal(db, {
        id: 'wt-null',
        workspaceId: 'ws1',
        cwd: '/repos/repo',
        cols: 80,
        rows: 24,
      });

      const filtered = listWorkspaceTerminalsByWorkspace(
        db,
        'ws1',
        '/repos/repo/worktrees/feature',
      ) as Record<string, unknown>[];

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('wt-feat');
    });

    test('listWorkspaceTerminalsByWorkspace without worktreePath filter returns only NULL worktree_path terminals', () => {
      // Create terminals with different worktree_path values
      createWorkspaceTerminal(db, {
        id: 'wt-feat',
        workspaceId: 'ws1',
        cwd: '/repos/repo',
        cols: 80,
        rows: 24,
        worktreePath: '/repos/repo/worktrees/feature',
      });
      createWorkspaceTerminal(db, {
        id: 'wt-null',
        workspaceId: 'ws1',
        cwd: '/repos/repo',
        cols: 80,
        rows: 24,
      });

      const filtered = listWorkspaceTerminalsByWorkspace(db, 'ws1') as Record<string, unknown>[];

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('wt-null');
    });

    test('listWorkspaceTerminalsByWorkspace with explicit null worktreePath returns only NULL worktree_path terminals', () => {
      // Create terminals with different worktree_path values
      createWorkspaceTerminal(db, {
        id: 'wt-feat',
        workspaceId: 'ws1',
        cwd: '/repos/repo',
        cols: 80,
        rows: 24,
        worktreePath: '/repos/repo/worktrees/feature',
      });
      createWorkspaceTerminal(db, {
        id: 'wt-null',
        workspaceId: 'ws1',
        cwd: '/repos/repo',
        cols: 80,
        rows: 24,
      });

      const filtered = listWorkspaceTerminalsByWorkspace(db, 'ws1', null) as Record<
        string,
        unknown
      >[];

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('wt-null');
    });
  });
});
