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
} from '../src/db/session';

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
});
