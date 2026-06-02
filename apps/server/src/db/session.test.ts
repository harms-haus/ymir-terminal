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
  createBottomPanelTab,
  listBottomPanelTabs,
  cleanupSession,
} from './session';

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

  // 15. cleanupSession deletes all related records
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
});
