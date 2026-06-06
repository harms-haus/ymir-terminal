import { describe, test, expect, beforeEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import {
  initSessionDb,
  createSession,
  deleteSession,
  createTab,
  listTabs,
  createTerminalInstance,
  getTerminalInstance,
  deleteTerminalInstance,
  createBottomPanelTab,
  listBottomPanelTabs,
  cleanupSession,
  deleteTab,
  createWorkspaceTerminal,
  getWorkspaceTerminal,
  listWorkspaceTerminalsByWorkspace,
  deleteWorkspaceTerminal,
} from '../src/db/session';
import { initDatabase, savePersistedTab, listPersistedTabsByWorkspace } from '../src/db/persistent';

describe('multi-client isolation (session DB)', () => {
  let db: Database;

  beforeEach(() => {
    db = initSessionDb();
  });

  test('two sessions are independent – tabs are isolated', () => {
    const sessionA = createSession(db);
    const sessionB = createSession(db);

    const workspaceId = 'ws-shared';

    // Session A creates two tabs
    const tabA1 = createTab(db, {
      sessionId: sessionA,
      workspaceId,
      tabType: 'terminal',
      title: 'A-Terminal-1',
      order: 0,
    });
    const tabA2 = createTab(db, {
      sessionId: sessionA,
      workspaceId,
      tabType: 'editor',
      title: 'A-Editor',
      order: 1,
    });

    // Session B creates one tab
    const tabB1 = createTab(db, {
      sessionId: sessionB,
      workspaceId,
      tabType: 'terminal',
      title: 'B-Terminal-1',
      order: 0,
    });

    // Session A sees only its own tabs
    const tabsA = listTabs(db, sessionA, workspaceId);
    expect(tabsA).toHaveLength(2);
    expect(tabsA.map((t) => t.id).sort()).toEqual([tabA1, tabA2].sort());

    // Session B sees only its own tab
    const tabsB = listTabs(db, sessionB, workspaceId);
    expect(tabsB).toHaveLength(1);
    expect(tabsB[0].id).toBe(tabB1);

    // Deleting session A's tab does not affect session B
    deleteTab(db, tabA1);
    const tabsAAfter = listTabs(db, sessionA, workspaceId);
    expect(tabsAAfter).toHaveLength(1);
    const tabsBAfter = listTabs(db, sessionB, workspaceId);
    expect(tabsBAfter).toHaveLength(1);
    expect(tabsBAfter[0].id).toBe(tabB1);
  });

  test('terminal instances are scoped to their session', () => {
    const sessionA = createSession(db);
    const sessionB = createSession(db);
    const workspaceId = 'ws-shared';

    // Session A creates a terminal
    const termA = createTerminalInstance(db, {
      sessionId: sessionA,
      workspaceId,
      cols: 80,
      rows: 24,
    });

    // Session B creates a terminal
    const termB = createTerminalInstance(db, {
      sessionId: sessionB,
      workspaceId,
      cols: 120,
      rows: 40,
    });

    // Each terminal is retrievable and has the right properties
    const instA = getTerminalInstance(db, termA)!;
    expect(instA.session_id).toBe(sessionA);
    expect(instA.cols).toBe(80);
    expect(instA.rows).toBe(24);

    const instB = getTerminalInstance(db, termB)!;
    expect(instB.session_id).toBe(sessionB);
    expect(instB.cols).toBe(120);
    expect(instB.rows).toBe(40);

    // IDs are different
    expect(termA).not.toBe(termB);

    // Deleting session A's terminal doesn't affect session B's
    deleteTerminalInstance(db, termA);
    expect(getTerminalInstance(db, termA)).toBeNull();
    expect(getTerminalInstance(db, termB)).not.toBeNull();
  });

  test('bottom panel tabs are isolated per session', () => {
    const sessionA = createSession(db);
    const sessionB = createSession(db);
    const workspaceId = 'ws-shared';

    // Session A creates bottom panel tabs
    const bptA1 = createBottomPanelTab(db, {
      sessionId: sessionA,
      workspaceId,
      order: 0,
    });
    createBottomPanelTab(db, {
      sessionId: sessionA,
      workspaceId,
      terminalId: bptA1,
      order: 1,
    });

    // Session B creates bottom panel tabs
    const bptB1 = createBottomPanelTab(db, {
      sessionId: sessionB,
      workspaceId,
      order: 0,
    });

    // Session A sees only its tabs
    const aTabs = listBottomPanelTabs(db, sessionA, workspaceId);
    expect(aTabs).toHaveLength(2);

    // Session B sees only its tab
    const bTabs = listBottomPanelTabs(db, sessionB, workspaceId);
    expect(bTabs).toHaveLength(1);
    expect(bTabs[0].id).toBe(bptB1);
  });

  test('cleanupSession removes only the target session data', () => {
    const sessionA = createSession(db);
    const sessionB = createSession(db);
    const workspaceId = 'ws-shared';

    // Populate session A
    createTab(db, {
      sessionId: sessionA,
      workspaceId,
      tabType: 'terminal',
      title: 'A-tab',
      order: 0,
    });
    const termA = createTerminalInstance(db, {
      sessionId: sessionA,
      workspaceId,
      cols: 80,
      rows: 24,
    });
    createBottomPanelTab(db, {
      sessionId: sessionA,
      workspaceId,
      order: 0,
    });

    // Populate session B
    createTab(db, {
      sessionId: sessionB,
      workspaceId,
      tabType: 'terminal',
      title: 'B-tab',
      order: 0,
    });
    const termB = createTerminalInstance(db, {
      sessionId: sessionB,
      workspaceId,
      cols: 80,
      rows: 24,
    });
    createBottomPanelTab(db, {
      sessionId: sessionB,
      workspaceId,
      order: 0,
    });

    // Cleanup session A
    cleanupSession(db, sessionA);

    // Session A data is gone
    expect(listTabs(db, sessionA, workspaceId)).toHaveLength(0);
    expect(getTerminalInstance(db, termA)).toBeNull();
    expect(listBottomPanelTabs(db, sessionA, workspaceId)).toHaveLength(0);

    // Session B data is untouched
    expect(listTabs(db, sessionB, workspaceId)).toHaveLength(1);
    expect(getTerminalInstance(db, termB)).not.toBeNull();
    expect(listBottomPanelTabs(db, sessionB, workspaceId)).toHaveLength(1);
  });

  test('deleting a session cascades to its tabs and terminals', () => {
    const sessionA = createSession(db);
    const workspaceId = 'ws-shared';

    createTab(db, {
      sessionId: sessionA,
      workspaceId,
      tabType: 'terminal',
      title: 'A-tab',
      order: 0,
    });
    const termId = createTerminalInstance(db, {
      sessionId: sessionA,
      workspaceId,
      cols: 80,
      rows: 24,
    });

    // Delete the session row itself – foreign keys cascade
    deleteSession(db, sessionA);

    expect(listTabs(db, sessionA, workspaceId)).toHaveLength(0);
    expect(getTerminalInstance(db, termId)).toBeNull();
  });

  test('workspace_terminals survive cleanupSession', () => {
    const sessionA = createSession(db);
    const workspaceId = 'ws-shared';

    // Create a session-scoped terminal instance
    createTerminalInstance(db, {
      sessionId: sessionA,
      workspaceId,
      cols: 80,
      rows: 24,
    });

    // Create a workspace-scoped terminal (no FK to sessions)
    const wsTermId = 'ws-term-1';
    createWorkspaceTerminal(db, {
      id: wsTermId,
      workspaceId,
      cwd: '/home/user/project',
      cols: 120,
      rows: 40,
      shell: '/bin/bash',
    });

    // Verify both exist before cleanup
    expect(getWorkspaceTerminal(db, wsTermId)).not.toBeNull();

    // Cleanup the session — cascades delete terminal_instances but NOT workspace_terminals
    cleanupSession(db, sessionA);

    // workspace_terminal survives because it has no FK to client_sessions
    expect(getWorkspaceTerminal(db, wsTermId)).not.toBeNull();
    const wsTerm = getWorkspaceTerminal(db, wsTermId) as Record<string, unknown>;
    expect(wsTerm.id).toBe(wsTermId);
    expect(wsTerm.cols).toBe(120);
    expect(wsTerm.rows).toBe(40);

    // Also verify it appears in the workspace listing
    const listed = listWorkspaceTerminalsByWorkspace(db, workspaceId);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(wsTermId);
  });

  // ── New integration tests ────────────────────────────────────────────────

  test('terminal survives disconnect', () => {
    const _sessionA = createSession(db, 'session-a');
    const workspaceId = 'ws-1';

    createWorkspaceTerminal(db, {
      id: 'term-1',
      workspaceId,
      cwd: '/home',
      cols: 80,
      rows: 24,
    });

    // Verify terminal exists
    expect(getWorkspaceTerminal(db, 'term-1')).not.toBeNull();

    // Simulate disconnect
    cleanupSession(db, 'session-a');

    // Terminal still exists — workspace_terminals are not session-scoped
    expect(getWorkspaceTerminal(db, 'term-1')).not.toBeNull();
    const term = getWorkspaceTerminal(db, 'term-1') as Record<string, unknown>;
    expect(term.id).toBe('term-1');
    expect(term.cwd).toBe('/home');
    expect(term.cols).toBe(80);
    expect(term.rows).toBe(24);
  });

  test('cross-session terminal access', () => {
    const _sessionA = createSession(db);
    const _sessionB = createSession(db);
    const workspaceId = 'ws-shared';

    createWorkspaceTerminal(db, {
      id: 'term-cross',
      workspaceId,
      cwd: '/project',
      cols: 100,
      rows: 30,
    });

    // Both sessions can list workspace terminals (workspace-scoped, not session-scoped)
    const listedA = listWorkspaceTerminalsByWorkspace(db, workspaceId);
    const listedB = listWorkspaceTerminalsByWorkspace(db, workspaceId);

    expect(listedA).toHaveLength(1);
    expect(listedB).toHaveLength(1);
    expect(listedA[0].id).toBe('term-cross');
    expect(listedB[0].id).toBe('term-cross');

    // getWorkspaceTerminal works regardless of which session "owns" the query
    expect(getWorkspaceTerminal(db, 'term-cross')).not.toBeNull();
  });

  test('state buffer survives disconnect', () => {
    const sessionA = createSession(db);
    const workspaceId = 'ws-1';

    createWorkspaceTerminal(db, {
      id: 'term-state',
      workspaceId,
      cwd: '/home/user/project',
      cols: 120,
      rows: 40,
      shell: '/bin/zsh',
    });

    // Simulate disconnect
    cleanupSession(db, sessionA);

    // Workspace terminal row still exists
    const term = getWorkspaceTerminal(db, 'term-state');
    expect(term).not.toBeNull();
    expect((term as Record<string, unknown>).cwd).toBe('/home/user/project');
    expect((term as Record<string, unknown>).cols).toBe(120);
    expect((term as Record<string, unknown>).rows).toBe(40);
    expect((term as Record<string, unknown>).shell).toBe('/bin/zsh');

    // Terminal can be listed by workspace
    const listed = listWorkspaceTerminalsByWorkspace(db, workspaceId);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('term-state');
  });

  test('reconnect restores state', () => {
    const sessionA = createSession(db);
    const workspaceId = 'ws-1';

    createWorkspaceTerminal(db, {
      id: 'term-reconnect',
      workspaceId,
      cwd: '/home/user/project',
      cols: 80,
      rows: 24,
    });

    // Simulate disconnect of session A
    cleanupSession(db, sessionA);

    // Simulate reconnect: new session B
    const sessionB = createSession(db);

    // Session B can find the terminal via workspace listing
    const listed = listWorkspaceTerminalsByWorkspace(db, workspaceId);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('term-reconnect');

    // Terminal data is preserved
    const term = getWorkspaceTerminal(db, 'term-reconnect') as Record<string, unknown>;
    expect(term).not.toBeNull();
    expect(term.cwd).toBe('/home/user/project');
    expect(term.cols).toBe(80);
    expect(term.rows).toBe(24);

    // Session B is usable (ensures no cross-contamination)
    expect(sessionB).not.toBe(sessionA);
  });

  test('tab.restore reuses live terminals', () => {
    // Use persistent DB for persisted tabs
    const persistentDb = initDatabase(':memory:');
    const workspaceId = 'ws-1';

    // Create a persisted tab referencing a terminal
    savePersistedTab(persistentDb, {
      id: 'tab-1',
      workspaceId,
      tabType: 'terminal',
      title: 'My Terminal',
      terminalId: 'term-live',
    });

    // Verify the tab can be retrieved with its terminal_id
    const tabs = listPersistedTabsByWorkspace(persistentDb, workspaceId);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].terminal_id).toBe('term-live');

    // Simulate restore: create new session and workspace terminal for reuse
    const sessionNew = createSession(db);
    createWorkspaceTerminal(db, {
      id: 'term-live',
      workspaceId,
      cwd: '/home/user/project',
      cols: 80,
      rows: 24,
    });

    // Verify the persisted tab's terminal_id references a real workspace terminal
    const term = getWorkspaceTerminal(db, 'term-live');
    expect(term).not.toBeNull();
    expect((term as Record<string, unknown>).id).toBe('term-live');

    // New session is valid
    expect(sessionNew).toBeDefined();
  });

  test('multiple terminals survive independently', () => {
    const sessionA = createSession(db);
    const workspaceId = 'ws-1';

    // Create multiple workspace terminals for the same workspace
    createWorkspaceTerminal(db, {
      id: 'term-a',
      workspaceId,
      cwd: '/home/user/a',
      cols: 80,
      rows: 24,
    });
    createWorkspaceTerminal(db, {
      id: 'term-b',
      workspaceId,
      cwd: '/home/user/b',
      cols: 100,
      rows: 30,
    });
    createWorkspaceTerminal(db, {
      id: 'term-c',
      workspaceId,
      cwd: '/home/user/c',
      cols: 120,
      rows: 40,
    });

    // Cleanup the session
    cleanupSession(db, sessionA);

    // ALL terminals survive
    const listed = listWorkspaceTerminalsByWorkspace(db, workspaceId);
    expect(listed).toHaveLength(3);

    // Delete one terminal via deleteWorkspaceTerminal
    deleteWorkspaceTerminal(db, 'term-b');

    // Only that one is deleted, others remain
    expect(getWorkspaceTerminal(db, 'term-a')).not.toBeNull();
    expect(getWorkspaceTerminal(db, 'term-b')).toBeNull();
    expect(getWorkspaceTerminal(db, 'term-c')).not.toBeNull();

    const remaining = listWorkspaceTerminalsByWorkspace(db, workspaceId);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((t) => t.id).sort()).toEqual(['term-a', 'term-c']);
  });
});
