import { resolve as pathResolve } from 'node:path';
import { describe, expect, it, beforeEach, mock, type Mock } from 'bun:test';
import {
  ErrorCodes,
  type ResponseEnvelope,
  type TabListResponse,
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

describe('registerTabHandlers — create & list', () => {
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
  // tab.create — terminal
  // =========================================================================

  describe('tab.create terminal', () => {
    it('creates a terminal tab and responds with tabId', async () => {
      registerTabHandlers(router, deps);

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
      const row = sessionDb.prepare('SELECT * FROM tabs WHERE id = ?').get(resp.payload!.tabId) as
        | Record<string, unknown>
        | undefined;
      expect(row).toBeDefined();
      expect(row!.tab_type).toBe('terminal');
      expect(row!.title).toBe('Terminal 1');
      expect(row!.workspace_id).toBe('ws-1');
      expect(row!.pane).toBe('content');
    });
  });

  // =========================================================================
  // tab.create with terminalId
  // =========================================================================

  describe('tab.create with terminalId', () => {
    it('creates a pane row linking tab to terminal', async () => {
      registerTabHandlers(router, deps);

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
      const pane = sessionDb.prepare('SELECT * FROM panes WHERE tab_id = ?').get(tabId) as
        | Record<string, unknown>
        | undefined;
      expect(pane).toBeDefined();
      expect(pane!.terminal_id).toBe('term-123');
    });
  });

  // =========================================================================
  // tab.create editor with filePath
  // =========================================================================

  describe('tab.create editor with filePath', () => {
    it('stores file_path in the DB when path is valid', async () => {
      // Seed a workspace in the persistent DB
      const wsCwd = '/tmp/test-workspace';
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', wsCwd, '#007acc');

      registerTabHandlers(router, deps);

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

      const row = sessionDb.prepare('SELECT * FROM tabs WHERE id = ?').get(tabId) as Record<
        string,
        unknown
      >;
      expect(row.tab_type).toBe('editor');
      expect(row.file_path).toBe('src/index.ts');
    });

    it('rejects filePath with path traversal', async () => {
      // Seed a workspace in the persistent DB
      const wsCwd = '/tmp/test-workspace';
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', wsCwd, '#007acc');

      registerTabHandlers(router, deps);

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
      registerTabHandlers(router, deps);

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
  // tab.create validation
  // =========================================================================

  describe('tab.create validation', () => {
    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      registerTabHandlers(router, deps);

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
      registerTabHandlers(router, deps);

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

    it('accepts arbitrary string pane values', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'T1',
        pane: 'my-custom-pane-42',
      });

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeUndefined();
      expect(resp.payload.tabId).toBeString();
    });

    it('returns INVALID_MESSAGE when payload is null', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.create', null);

      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // =========================================================================
  // tab.list
  // =========================================================================

  describe('tab.list', () => {
    it('returns all tabs for a workspace in sort_order', async () => {
      registerTabHandlers(router, deps);

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
  // tab.list filters by workspace
  // =========================================================================

  describe('tab.list filters by workspace', () => {
    it('only returns tabs belonging to the requested workspace', async () => {
      registerTabHandlers(router, deps);

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
  // tab.list filters by pane
  // =========================================================================

  describe('tab.list filters by pane', () => {
    it('only returns content tabs when pane=content is specified', async () => {
      registerTabHandlers(router, deps);

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
      registerTabHandlers(router, deps);

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
  // tab.list with terminalAlive
  // =========================================================================

  describe('tab.list with terminalAlive', () => {
    it('returns terminalAlive: true when ptyManager reports terminal alive', async () => {
      registerTabHandlers(router, deps);

      // Create a tab with a terminal via pane
      const terminalId = crypto.randomUUID();
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'T1',
        pane: 'content',
        terminalId,
      });

      // Mock ptyManager to report the terminal as alive
      ptyManager.has.mockImplementation((id: string) => id === terminalId);
      ptyManager.hasExited.mockImplementation((id: string) => id !== terminalId);

      conn.sent.length = 0;

      const req = request('tab.list', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].terminalAlive).toBe(true);
    });

    it('returns terminalAlive: false when ptyManager reports terminal dead', async () => {
      registerTabHandlers(router, deps);

      // Create a tab with a terminal via pane
      const terminalId = crypto.randomUUID();
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'T1',
        pane: 'content',
        terminalId,
      });

      // Mock ptyManager to report the terminal as dead (default: has=false)
      ptyManager.has.mockImplementation(() => false);
      ptyManager.hasExited.mockImplementation(() => true);

      conn.sent.length = 0;

      const req = request('tab.list', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].terminalAlive).toBe(false);
    });
  });

  // =========================================================================
  // tab.create auto-increments sort_order
  // =========================================================================

  describe('tab.create auto-increments sort_order', () => {
    it('assigns sort_order 0, 1, 2 for consecutive creates', async () => {
      registerTabHandlers(router, deps);

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

      const row1 = sessionDb.prepare('SELECT sort_order FROM tabs WHERE id = ?').get(tabId1) as {
        sort_order: number;
      };
      const row2 = sessionDb.prepare('SELECT sort_order FROM tabs WHERE id = ?').get(tabId2) as {
        sort_order: number;
      };
      const row3 = sessionDb.prepare('SELECT sort_order FROM tabs WHERE id = ?').get(tabId3) as {
        sort_order: number;
      };

      expect(row1.sort_order).toBe(0);
      expect(row2.sort_order).toBe(1);
      expect(row3.sort_order).toBe(2);
    });

    it('auto-increments independently per pane', async () => {
      registerTabHandlers(router, deps);

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

  // =========================================================================
  // worktree_path support in tab handlers
  // =========================================================================

  describe('worktree_path in tab.create', () => {
    it('creates a tab with worktree_path set in the session DB', async () => {
      // Seed a workspace so path validation can resolve relative paths
      const wsCwd = process.cwd();
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', wsCwd, '#007acc');

      registerTabHandlers(router, deps);

      const req = request('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Worktree Editor',
        pane: 'content',
        worktreePath: 'worktrees/feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabCreateResponse>;
      expect(resp.error).toBeUndefined();
      const tabId = resp.payload!.tabId;

      const row = sessionDb.prepare('SELECT worktree_path FROM tabs WHERE id = ?').get(tabId) as {
        worktree_path: string | null;
      } | null;
      expect(row).not.toBeNull();
      expect(row!.worktree_path).toBe(pathResolve(wsCwd, 'worktrees/feature'));
    });

    it('creates a tab with NULL worktree_path when not provided', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Root Terminal',
        pane: 'content',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabCreateResponse>;
      expect(resp.error).toBeUndefined();
      const tabId = resp.payload!.tabId;

      const row = sessionDb.prepare('SELECT worktree_path FROM tabs WHERE id = ?').get(tabId) as {
        worktree_path: string | null;
      } | null;
      expect(row).not.toBeNull();
      expect(row!.worktree_path).toBeNull();
    });

    it('persists worktree_path to the persistent DB', async () => {
      // Seed a workspace so path validation can resolve relative paths
      const wsCwd = process.cwd();
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', wsCwd, '#007acc');

      registerTabHandlers(router, deps);

      const req = request('tab.create', {
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Worktree Editor',
        pane: 'content',
        worktreePath: 'worktrees/feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabCreateResponse>;
      const tabId = resp.payload!.tabId;

      const row = persistentDb
        .prepare('SELECT worktree_path FROM persisted_tabs WHERE id = ?')
        .get(tabId) as { worktree_path: string | null } | null;
      expect(row).not.toBeNull();
      expect(row!.worktree_path).toBe(pathResolve(wsCwd, 'worktrees/feature'));
    });
  });

  describe('tab.list with worktreePath', () => {
    it('returns only tabs matching the worktreePath filter', async () => {
      registerTabHandlers(router, deps);

      // Create a tab in worktree A
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Feature Terminal',
        pane: 'content',
      });
      // Manually set worktree_path on the tab (simulating the feature that will exist)
      const featureTabId = conn.sent[0] as ResponseEnvelope<TabCreateResponse>;
      sessionDb
        .prepare('UPDATE tabs SET worktree_path = ? WHERE id = ?')
        .run('/repos/repo/worktrees/feature', featureTabId.payload!.tabId);

      // Create a non-worktree tab
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Root Editor',
        pane: 'content',
      });

      conn.sent.length = 0;

      // List with worktreePath filter
      const req = request('tab.list', {
        workspaceId: 'ws-1',
        worktreePath: '/repos/repo/worktrees/feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].title).toBe('Feature Terminal');
    });

    it('returns only non-worktree tabs when worktreePath is omitted', async () => {
      registerTabHandlers(router, deps);

      // Create a tab in a worktree
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Feature Terminal',
        pane: 'content',
      });
      // Manually set worktree_path
      const featureTabId = conn.sent[0] as ResponseEnvelope<TabCreateResponse>;
      sessionDb
        .prepare('UPDATE tabs SET worktree_path = ? WHERE id = ?')
        .run('/repos/repo/worktrees/feature', featureTabId.payload!.tabId);

      // Create a non-worktree tab
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Root Editor',
        pane: 'content',
      });

      conn.sent.length = 0;

      // List without worktreePath — should exclude worktree tabs
      const req = request('tab.list', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].title).toBe('Root Editor');
    });

    it('returns only non-worktree tabs when worktreePath is explicitly null', async () => {
      registerTabHandlers(router, deps);

      // Create a tab in a worktree
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'terminal',
        title: 'Feature Terminal',
        pane: 'content',
      });
      // Manually set worktree_path
      const featureTabId = conn.sent[0] as ResponseEnvelope<TabCreateResponse>;
      sessionDb
        .prepare('UPDATE tabs SET worktree_path = ? WHERE id = ?')
        .run('/repos/repo/worktrees/feature', featureTabId.payload!.tabId);

      // Create a non-worktree tab
      await createTabViaHandler({
        workspaceId: 'ws-1',
        tabType: 'editor',
        title: 'Root Editor',
        pane: 'content',
      });

      conn.sent.length = 0;

      // List with explicit null worktreePath — should exclude worktree tabs
      const req = request('tab.list', {
        workspaceId: 'ws-1',
        worktreePath: null,
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabListResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].title).toBe('Root Editor');
    });
  });
});
