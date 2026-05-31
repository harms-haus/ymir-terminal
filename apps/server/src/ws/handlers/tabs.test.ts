import { describe, expect, it, beforeEach } from 'bun:test';
import {
  ErrorCodes,
  type ResponseEnvelope,
  type TabListResponse,
  type TabCreateResponse,
  type TabCreateRequest,
} from '@ymir/shared';
import { mockConn, request } from '../../test-helpers/mock-utils';
import { MessageRouter } from '../router';
import { registerTabHandlers } from './tabs';
import { initSessionDb, createSession, type Database } from '../../db/session';
import { initDatabase as initPersistentDb, getWorkspace } from '../../db/persistent';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerTabHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let sessionDb: Database;
  let persistentDb: Database;
  let sessionId: string;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();
    sessionDb = initSessionDb();
    persistentDb = initPersistentDb(':memory:');
    sessionId = createSession(sessionDb);
    conn.sessionId = sessionId;
  });

  // -------------------------------------------------------------------------
  // Helper: create a tab via the handler and return the tabId
  // -------------------------------------------------------------------------
  async function createTabViaHandler(
    opts: Partial<TabCreateRequest> & { workspaceId: string; tabType: 'terminal' | 'editor'; title: string; pane: 'content' | 'bottom' },
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
  // 1. Handler registration
  // =========================================================================

  describe('handler registration', () => {
    it('registers tab.list handler', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });
      const req = request('tab.list', { workspaceId: 'ws-1' });
      const result = await router.route(conn, req);
      // null means a handler was found (no unmatched-channel error)
      expect(result).toBeNull();
    });

    it('registers tab.create handler', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });
      const req = request('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'T1',
        pane: 'content',
      });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });

    it('registers tab.update handler', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });
      const req = request('tab.update', { tabId: 'some-id', active: true });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });

    it('registers tab.delete handler', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });
      const req = request('tab.delete', { tabId: 'some-id' });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });

    it('registers tab.reorder handler', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });
      const req = request('tab.reorder', { tabIds: ['a', 'b'] });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // 2. tab.create — terminal
  // =========================================================================

  describe('tab.create terminal', () => {
    it('creates a terminal tab and responds with tabId', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request<TabCreateRequest>('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Terminal 1',
        pane: 'content',
      });

      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as ResponseEnvelope<TabCreateResponse>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();
      expect(resp.payload).toBeDefined();
      expect(typeof resp.payload!.tabId).toBe('string');

      // Verify DB row exists
      const row = sessionDb
        .prepare('SELECT * FROM tabs WHERE id = ?')
        .get(resp.payload!.tabId) as Record<string, unknown> | undefined;
      expect(row).toBeDefined();
      expect(row!.tab_type).toBe('terminal');
      expect(row!.title).toBe('Terminal 1');
      expect(row!.workspace_id).toBe('ws-1');
      expect(row!.pane).toBe('content');
    });
  });

  // =========================================================================
  // 3. tab.create with terminalId
  // =========================================================================

  describe('tab.create with terminalId', () => {
    it('creates a pane row linking tab to terminal', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request<TabCreateRequest>('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Terminal 1',
        pane: 'content',
        terminalId: 'term-123',
      });

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabCreateResponse>;
      const tabId = resp.payload!.tabId;

      // Verify pane was created in DB
      const pane = sessionDb
        .prepare('SELECT * FROM panes WHERE tab_id = ?')
        .get(tabId) as Record<string, unknown> | undefined;
      expect(pane).toBeDefined();
      expect(pane!.terminal_id).toBe('term-123');
    });
  });

  // =========================================================================
  // 4. tab.create editor with filePath
  // =========================================================================

  describe('tab.create editor with filePath', () => {
    it('stores file_path in the DB when path is valid', async () => {
      // Seed a workspace in the persistent DB
      const wsCwd = '/tmp/test-workspace';
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', wsCwd, '#007acc');

      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request<TabCreateRequest>('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'index.ts',
        pane: 'content',
        filePath: 'src/index.ts',
      });

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabCreateResponse>;
      const tabId = resp.payload!.tabId;

      const row = sessionDb
        .prepare('SELECT * FROM tabs WHERE id = ?')
        .get(tabId) as Record<string, unknown>;
      expect(row.tab_type).toBe('editor');
      expect(row.file_path).toBe('src/index.ts');
    });

    it('rejects filePath with path traversal', async () => {
      // Seed a workspace in the persistent DB
      const wsCwd = '/tmp/test-workspace';
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', wsCwd, '#007acc');

      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request<TabCreateRequest>('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'malicious',
        pane: 'content',
        filePath: '../../etc/passwd',
      });

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
      expect(resp.error!.message).toContain('path traversal');
    });

    it('rejects filePath when workspace does not exist', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request<TabCreateRequest>('tab.create', {
        workspaceId: 'nonexistent-ws',
        tabType: 'editor',
        title: 'orphan',
        pane: 'content',
        filePath: 'some/file.ts',
      });

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // =========================================================================
  // 5. tab.create missing workspaceId
  // =========================================================================

  describe('tab.create validation', () => {
    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.create', {
        tabType: 'terminal',
        title: 'T1',
        pane: 'content',
      });

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when tabType is invalid', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'invalid',
        title: 'T1',
        pane: 'content',
      });

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when pane is invalid', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'T1',
        pane: 'sidebar',
      });

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when payload is null', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.create', null);

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // =========================================================================
  // 6. tab.list
  // =========================================================================

  describe('tab.list', () => {
    it('returns all tabs for a workspace in sort_order', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      // Create 3 tabs
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Tab A',
        pane: 'content',
      });
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Tab B',
        pane: 'content',
      });
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Tab C',
        pane: 'content',
      });

      conn.sent.length = 0;

      const req = request('tab.list', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(3);
      // Verify sort_order is ascending
      const orders = resp.payload!.tabs.map((t) => t.sortOrder);
      for (let i = 0; i < orders.length - 1; i++) {
        expect(orders[i]).toBeLessThanOrEqual(orders[i + 1]);
      }
    });
  });

  // =========================================================================
  // 7. tab.list filters by workspace
  // =========================================================================

  describe('tab.list filters by workspace', () => {
    it('only returns tabs belonging to the requested workspace', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      // Create tabs for workspace A and B
      await createTabViaHandler({
        workspaceId: 'ws-a',
        tabType: 'terminal',
        title: 'A1',
        pane: 'content',
      });
      await createTabViaHandler({
        workspaceId: 'ws-a',
        tabType: 'terminal',
        title: 'A2',
        pane: 'content',
      });
      await createTabViaHandler({
        workspaceId: 'ws-b',
        tabType: 'editor',
        title: 'B1',
        pane: 'content',
      });

      conn.sent.length = 0;

      // List only ws-a
      const req = request('tab.list', { workspaceId: 'ws-a' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.payload!.tabs).toHaveLength(2);
      expect(resp.payload!.tabs.every((t) => t.title === 'A1' || t.title === 'A2')).toBe(true);
    });
  });

  // =========================================================================
  // 8. tab.list filters by pane
  // =========================================================================

  describe('tab.list filters by pane', () => {
    it('only returns content tabs when pane=content is specified', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      // Create content and bottom tabs
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Content Tab',
        pane: 'content',
      });
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Bottom Tab',
        pane: 'bottom',
      });

      conn.sent.length = 0;

      const req = request('tab.list', { workspaceId: 'ws-1', pane: 'content' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].title).toBe('Content Tab');
    });

    it('only returns bottom tabs when pane=bottom is specified', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Content Tab',
        pane: 'content',
      });
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Bottom Tab',
        pane: 'bottom',
      });

      conn.sent.length = 0;

      const req = request('tab.list', { workspaceId: 'ws-1', pane: 'bottom' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].title).toBe('Bottom Tab');
    });
  });

  // =========================================================================
  // 9. tab.list with terminalAlive
  // =========================================================================

  describe('tab.list with terminalAlive', () => {
    it('returns terminalAlive: true when terminal instance exists', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      // Create a terminal instance in the DB
      const terminalId = crypto.randomUUID();
      sessionDb
        .prepare(
          'INSERT INTO terminal_instances (id, session_id, workspace_id, cols, rows) VALUES (?, ?, ?, 80, 24)',
        )
        .run(terminalId, sessionId, 'ws-1');

      // Create tab linked to that terminal via pane
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'T1',
        pane: 'content',
        terminalId,
      });

      conn.sent.length = 0;

      const req = request('tab.list', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].terminalAlive).toBe(true);
    });

    it('returns terminalAlive: false when terminal instance is deleted', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      // Create a terminal instance
      const terminalId = crypto.randomUUID();
      sessionDb
        .prepare(
          'INSERT INTO terminal_instances (id, session_id, workspace_id, cols, rows) VALUES (?, ?, ?, 80, 24)',
        )
        .run(terminalId, sessionId, 'ws-1');

      // Create tab linked to that terminal
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'T1',
        pane: 'content',
        terminalId,
      });

      // Delete the terminal instance
      sessionDb.prepare('DELETE FROM terminal_instances WHERE id = ?').run(terminalId);

      conn.sent.length = 0;

      const req = request('tab.list', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].terminalAlive).toBe(false);
    });
  });

  // =========================================================================
  // 10. tab.update active
  // =========================================================================

  describe('tab.update', () => {
    it('updates active flag in the DB', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

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
      const row1 = sessionDb
        .prepare('SELECT active FROM tabs WHERE id = ?')
        .get(tabId1) as { active: number };
      const row2 = sessionDb
        .prepare('SELECT active FROM tabs WHERE id = ?')
        .get(tabId2) as { active: number };
      expect(row1.active).toBe(0);
      expect(row2.active).toBe(1);
    });

    it('updates title', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

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

      const row = sessionDb
        .prepare('SELECT title FROM tabs WHERE id = ?')
        .get(tabId) as { title: string };
      expect(row.title).toBe('Renamed');
    });

    it('returns INVALID_MESSAGE when tabId is missing', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.update', { active: true });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns TAB_NOT_FOUND when tab does not exist', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.update', { tabId: 'nonexistent-id', active: true });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.TAB_NOT_FOUND);
    });
  });

  // =========================================================================
  // 11. tab.delete
  // =========================================================================

  describe('tab.delete', () => {
    it('removes the tab from the DB', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const tabId = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'To Delete',
        pane: 'content',
      });

      // Verify it exists
      const before = sessionDb
        .prepare('SELECT id FROM tabs WHERE id = ?')
        .get(tabId);
      expect(before).toBeDefined();

      conn.sent.length = 0;

      const req = request('tab.delete', { tabId });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      // Verify it was removed
      const after = sessionDb
        .prepare('SELECT id FROM tabs WHERE id = ?')
        .get(tabId);
      expect(after).toBeNull();
    });

    it('returns INVALID_MESSAGE when tabId is missing', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.delete', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // =========================================================================
  // 12. tab.delete ownership check
  // =========================================================================

  describe('tab.delete ownership check', () => {
    it('rejects deletion of a tab from a different session', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

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
  // 13. tab.reorder
  // =========================================================================

  describe('tab.reorder', () => {
    it('reorders tabs according to the provided tabIds order', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

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
      const row3 = sessionDb
        .prepare('SELECT sort_order FROM tabs WHERE id = ?')
        .get(tabId3) as { sort_order: number };
      const row2 = sessionDb
        .prepare('SELECT sort_order FROM tabs WHERE id = ?')
        .get(tabId2) as { sort_order: number };
      const row1 = sessionDb
        .prepare('SELECT sort_order FROM tabs WHERE id = ?')
        .get(tabId1) as { sort_order: number };

      expect(row3.sort_order).toBe(0);
      expect(row2.sort_order).toBe(1);
      expect(row1.sort_order).toBe(2);
    });

    it('returns INVALID_MESSAGE when tabIds is empty', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.reorder', { tabIds: [] });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when tabIds contains non-strings', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.reorder', { tabIds: [123, 456] as unknown as string[] });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when tabIds is missing', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const req = request('tab.reorder', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // =========================================================================
  // 14. tab.reorder ownership check
  // =========================================================================

  describe('tab.reorder ownership check', () => {
    it('rejects reorder when one tab belongs to a different session', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

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
  // 15. tab.create auto-increments order
  // =========================================================================

  describe('tab.create auto-increments sort_order', () => {
    it('assigns sort_order 0, 1, 2 for consecutive creates', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const tabId1 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'First',
        pane: 'content',
      });
      const tabId2 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Second',
        pane: 'content',
      });
      const tabId3 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Third',
        pane: 'content',
      });

      const row1 = sessionDb
        .prepare('SELECT sort_order FROM tabs WHERE id = ?')
        .get(tabId1) as { sort_order: number };
      const row2 = sessionDb
        .prepare('SELECT sort_order FROM tabs WHERE id = ?')
        .get(tabId2) as { sort_order: number };
      const row3 = sessionDb
        .prepare('SELECT sort_order FROM tabs WHERE id = ?')
        .get(tabId3) as { sort_order: number };

      expect(row1.sort_order).toBe(0);
      expect(row2.sort_order).toBe(1);
      expect(row3.sort_order).toBe(2);
    });

    it('auto-increments independently per pane', async () => {
      registerTabHandlers(router, { sessionDb, persistentDb });

      const contentTab1 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Content 1',
        pane: 'content',
      });
      const bottomTab1 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Bottom 1',
        pane: 'bottom',
      });
      const contentTab2 = await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Content 2',
        pane: 'content',
      });

      const contentRow1 = sessionDb
        .prepare('SELECT sort_order FROM tabs WHERE id = ?')
        .get(contentTab1) as { sort_order: number };
      const bottomRow1 = sessionDb
        .prepare('SELECT sort_order FROM tabs WHERE id = ?')
        .get(bottomTab1) as { sort_order: number };
      const contentRow2 = sessionDb
        .prepare('SELECT sort_order FROM tabs WHERE id = ?')
        .get(contentTab2) as { sort_order: number };

      expect(contentRow1.sort_order).toBe(0);
      expect(bottomRow1.sort_order).toBe(0);
      expect(contentRow2.sort_order).toBe(1);
    });
  });
});
