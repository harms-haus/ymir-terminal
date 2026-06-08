import { resolve as pathResolve } from 'node:path';
import { describe, expect, it, beforeEach, mock, type Mock } from 'bun:test';
import {
  ErrorCodes,
  type ResponseEnvelope,
  type TabCreateResponse,
  type TabCreateRequest,
} from '@ymir/shared';
import { mockConn, request } from '../../test-helpers/mock-utils';
import { MessageRouter } from '../router';
import { registerTabHandlers, type TabDeps } from './tabs';
import { initSessionDb, createSession, type Database } from '../../db/session';
import { initDatabase as initPersistentDb } from '../../db/persistent';
import { type PTYManager } from '../../pty/manager';

type MockPty = {
  terminals: Map<string, { terminal: unknown; process: unknown }>;
  create: Mock<(id: string, options: unknown) => string>;
  write: Mock<(id: string, data: string) => void>;
  resize: Mock<(id: string, cols: number, rows: number) => void>;
  kill: Mock<(id: string) => void>;
  has: Mock<(id: string) => boolean>;
  killAll: Mock<() => void>;
  getBufferSnapshot: Mock<(id: string) => Uint8Array | null>;
  getDimensions: Mock<(id: string) => { cols: number; rows: number } | null>;
  hasExited: Mock<(id: string) => boolean>;
  setOutputTarget: Mock<
    (id: string, onData: (data: string) => void, onExit?: (code: number | null) => void) => void
  >;
};

function mockPtyManager(): MockPty & PTYManager {
  return {
    terminals: new Map<string, { terminal: unknown; process: unknown }>(),
    create: mock((...args: unknown[]) => args[0] as string) as Mock<
      (id: string, options: unknown) => string
    >,
    write: mock(() => {}) as Mock<(id: string, data: string) => void>,
    resize: mock(() => {}) as Mock<(id: string, cols: number, rows: number) => void>,
    kill: mock(() => {}) as Mock<(id: string) => void>,
    has: mock(() => false) as Mock<(id: string) => boolean>,
    killAll: mock(() => {}) as Mock<() => void>,
    getBufferSnapshot: mock(() => null) as Mock<(id: string) => Uint8Array | null>,
    getDimensions: mock(() => null) as Mock<(id: string) => { cols: number; rows: number } | null>,
    hasExited: mock(() => true) as Mock<(id: string) => boolean>,
    setOutputTarget: mock(() => {}) as Mock<
      (id: string, onData: (data: string) => void, onExit?: (code: number | null) => void) => void
    >,
  } as MockPty & PTYManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerTabHandlers — update, delete, reorder & persistence', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let sessionDb: Database;
  let persistentDb: Database;
  let sessionId: string;
  let ptyManager: ReturnType<typeof mockPtyManager>;
  let deps: TabDeps;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();
    sessionDb = initSessionDb();
    persistentDb = initPersistentDb(':memory:');
    ptyManager = mockPtyManager();
    deps = { sessionDb, persistentDb, ptyManager };
    sessionId = createSession(sessionDb);
    conn.sessionId = sessionId;
  });

  // -------------------------------------------------------------------------
  // Helper: create a tab via the handler and return the tabId
  // -------------------------------------------------------------------------
  async function createTabViaHandler(
    opts: Partial<TabCreateRequest> & {
      workspaceId: string;
      tabType: 'terminal' | 'editor';
      title: string;
      pane: 'content' | 'bottom';
    },
  ): Promise<string> {
    const req = request<TabCreateRequest>('tab.create', {
      workspaceId: opts.workspaceId,
      tabType: opts.tabType,
      title: opts.title,
      pane: opts.pane,
      terminalId: opts.terminalId,
      filePath: opts.filePath,
    });
    await router.route(conn, req);
    const resp = conn.sent[conn.sent.length - 1] as ResponseEnvelope<TabCreateResponse>;
    return resp.payload!.tabId;
  }

  // =========================================================================
  // tab.update
  // =========================================================================

  describe('tab.update', () => {
    it('updates active flag in the DB', async () => {
      registerTabHandlers(router, deps);

      // Create two tabs in the same pane
      const tabId1 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'T1',
        pane: 'content',
      });
      const tabId2 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'T2',
        pane: 'content',
      });

      conn.sent.length = 0;

      // Set tab2 as active
      const req = request('tab.update', { tabId: tabId2, active: true });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      // Verify DB: tab2 is active, tab1 is not
      const row1 = sessionDb.prepare('SELECT active FROM tabs WHERE id = ?').get(tabId1) as {
        active: number;
      };
      const row2 = sessionDb.prepare('SELECT active FROM tabs WHERE id = ?').get(tabId2) as {
        active: number;
      };
      expect(row1.active).toBe(0);
      expect(row2.active).toBe(1);
    });

    it('updates title', async () => {
      registerTabHandlers(router, deps);

      const tabId = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Original',
        pane: 'content',
      });

      conn.sent.length = 0;

      const req = request('tab.update', { tabId, title: 'Renamed' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeUndefined();

      const row = sessionDb.prepare('SELECT title FROM tabs WHERE id = ?').get(tabId) as {
        title: string;
      };
      expect(row.title).toBe('Renamed');
    });

    it('returns INVALID_MESSAGE when tabId is missing', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.update', { active: true });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns TAB_NOT_FOUND when tab does not exist', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.update', { tabId: 'nonexistent-id', active: true });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.TAB_NOT_FOUND);
    });
  });

  // =========================================================================
  // tab.delete
  // =========================================================================

  describe('tab.delete', () => {
    it('removes the tab from the DB', async () => {
      registerTabHandlers(router, deps);

      const tabId = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'To Delete',
        pane: 'content',
      });

      // Verify it exists
      const before = sessionDb.prepare('SELECT id FROM tabs WHERE id = ?').get(tabId);
      expect(before).toBeDefined();

      conn.sent.length = 0;

      const req = request('tab.delete', { tabId });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      // Verify it was removed
      const after = sessionDb.prepare('SELECT id FROM tabs WHERE id = ?').get(tabId);
      expect(after).toBeNull();
    });

    it('returns INVALID_MESSAGE when tabId is missing', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.delete', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // =========================================================================
  // tab.delete ownership check
  // =========================================================================

  describe('tab.delete ownership check', () => {
    it('rejects deletion of a tab from a different session', async () => {
      registerTabHandlers(router, deps);

      const tabId = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Owned Tab',
        pane: 'content',
      });

      // Use a connection from a different session
      const otherSessionId = createSession(sessionDb);
      const otherConn = mockConn({ sessionId: otherSessionId });

      const req = request('tab.delete', { tabId });
      await router.route(otherConn, req);

      const resp = otherConn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(ErrorCodes.PERMISSION_DENIED);

      // Verify the tab still exists
      const row = sessionDb.prepare('SELECT id FROM tabs WHERE id = ?').get(tabId);
      expect(row).toBeDefined();
    });
  });

  // =========================================================================
  // tab.reorder
  // =========================================================================

  describe('tab.reorder', () => {
    it('reorders tabs according to the provided tabIds order', async () => {
      registerTabHandlers(router, deps);

      const tabId1 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Tab 1',
        pane: 'content',
      });
      const tabId2 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Tab 2',
        pane: 'content',
      });
      const tabId3 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Tab 3',
        pane: 'content',
      });

      conn.sent.length = 0;

      // Reverse the order: 3, 2, 1
      const req = request('tab.reorder', { tabIds: [tabId3, tabId2, tabId1] });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      // Verify sort_order values
      const row3 = sessionDb.prepare('SELECT sort_order FROM tabs WHERE id = ?').get(tabId3) as {
        sort_order: number;
      };
      const row2 = sessionDb.prepare('SELECT sort_order FROM tabs WHERE id = ?').get(tabId2) as {
        sort_order: number;
      };
      const row1 = sessionDb.prepare('SELECT sort_order FROM tabs WHERE id = ?').get(tabId1) as {
        sort_order: number;
      };

      expect(row3.sort_order).toBe(0);
      expect(row2.sort_order).toBe(1);
      expect(row1.sort_order).toBe(2);
    });

    it('returns INVALID_MESSAGE when tabIds is empty', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.reorder', { tabIds: [] });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when tabIds contains non-strings', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.reorder', { tabIds: [123, 456] as unknown as string[] });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when tabIds is missing', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.reorder', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // =========================================================================
  // tab.reorder ownership check
  // =========================================================================

  describe('tab.reorder ownership check', () => {
    it('rejects reorder when one tab belongs to a different session', async () => {
      registerTabHandlers(router, deps);

      const tabId1 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Tab 1',
        pane: 'content',
      });
      const _tabId2 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Tab 2',
        pane: 'content',
      });

      // Create another session and a tab under it
      const otherSessionId = createSession(sessionDb);
      const otherConn = mockConn({ sessionId: otherSessionId });

      // Switch the original conn to the other session to create a tab there
      const origSessionId = conn.sessionId;
      conn.sessionId = otherSessionId;
      const otherTabId = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Other Tab',
        pane: 'content',
      });
      conn.sessionId = origSessionId;

      // Try to reorder using the other session's connection
      const req = request('tab.reorder', { tabIds: [tabId1, otherTabId] });
      await router.route(otherConn, req);

      const resp = otherConn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeDefined();
      // The handler validates ownership of all tabs; first failure stops it
      expect(resp.error!.code).toBe(ErrorCodes.PERMISSION_DENIED);
    });
  });

  // =========================================================================
  // Persistent tab mirroring
  // =========================================================================

  describe('persistent tab mirroring', () => {
    it('tab.create persists to persistent DB', async () => {
      registerTabHandlers(router, deps);

      const tabId = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Persisted Tab',
        pane: 'content',
      });

      const rows = persistentDb
        .prepare('SELECT * FROM persisted_tabs WHERE id = ?')
        .all(tabId) as Record<string, unknown>[];
      expect(rows).toHaveLength(1);
      expect(rows[0].tab_type).toBe('terminal');
      expect(rows[0].workspace_id).toBe('ws-1');
      expect(rows[0].title).toBe('Persisted Tab');
      expect(rows[0].pane).toBe('content');
    });

    it('tab.create persists cwd and customTitle when provided', async () => {
      // Seed a workspace so path validation can resolve relative paths
      const wsCwd = process.cwd();
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', wsCwd, '#007acc');

      registerTabHandlers(router, deps);

      const _tabId = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'My Tab',
        pane: 'content',
      });

      // The helper doesn't pass cwd/customTitle, so create directly
      conn.sent.length = 0;
      const req = request<TabCreateRequest>('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Editor',
        pane: 'content',
        cwd: 'src',
        customTitle: 'My Custom',
      });
      await router.route(conn, req);
      const resp = conn.sent[conn.sent.length - 1] as ResponseEnvelope<TabCreateResponse>;
      const editorTabId = resp.payload!.tabId;

      const row = persistentDb
        .prepare('SELECT * FROM persisted_tabs WHERE id = ?')
        .get(editorTabId) as Record<string, unknown>;
      expect(row.cwd).toBe(pathResolve(wsCwd, 'src'));
      expect(row.custom_title).toBe('My Custom');
    });

    it('tab.delete removes from persistent DB', async () => {
      registerTabHandlers(router, deps);

      const tabId = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'To Delete',
        pane: 'content',
      });

      // Verify persisted
      expect(
        persistentDb.prepare('SELECT id FROM persisted_tabs WHERE id = ?').get(tabId),
      ).toBeDefined();

      conn.sent.length = 0;
      const req = request('tab.delete', { tabId });
      await router.route(conn, req);

      // Verify removed from persistent DB
      expect(
        persistentDb.prepare('SELECT id FROM persisted_tabs WHERE id = ?').get(tabId),
      ).toBeNull();
    });

    it('tab.reorder updates sort_order in persistent DB', async () => {
      registerTabHandlers(router, deps);

      const tabId1 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Tab 1',
        pane: 'content',
      });
      const tabId2 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Tab 2',
        pane: 'content',
      });

      conn.sent.length = 0;
      const req = request('tab.reorder', { tabIds: [tabId2, tabId1] });
      await router.route(conn, req);

      const row1 = persistentDb
        .prepare('SELECT sort_order FROM persisted_tabs WHERE id = ?')
        .get(tabId1) as { sort_order: number };
      const row2 = persistentDb
        .prepare('SELECT sort_order FROM persisted_tabs WHERE id = ?')
        .get(tabId2) as { sort_order: number };

      expect(row2.sort_order).toBe(0);
      expect(row1.sort_order).toBe(1);
    });

    it('tab.update mirrors title to persistent DB', async () => {
      registerTabHandlers(router, deps);

      const tabId = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Original',
        pane: 'content',
      });

      conn.sent.length = 0;
      const req = request('tab.update', { tabId, title: 'Updated' });
      await router.route(conn, req);

      const row = persistentDb
        .prepare('SELECT custom_title FROM persisted_tabs WHERE id = ?')
        .get(tabId) as { custom_title: string | null };
      expect(row.custom_title).toBe('Updated');
    });
  });
});
