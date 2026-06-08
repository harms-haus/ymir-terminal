import { describe, expect, it, beforeEach, mock, type Mock } from 'bun:test';
import { ErrorCodes, type ResponseEnvelope, type TabRestoreResponse } from '@ymir/shared';
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

describe('registerTabHandlers — restore', () => {
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

  // =========================================================================
  // tab.restore
  // =========================================================================

  describe('tab.restore', () => {
    it('restores persisted editor tabs to session DB', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      registerTabHandlers(router, deps);

      // Seed a persisted editor tab directly
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, file_path, pane, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('ptab-1', 'ws-1', 'editor', 'index.ts', 'src/index.ts', 'content', 0);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].tabType).toBe('editor');
      expect(resp.payload!.tabs[0].filePath).toBe('src/index.ts');
      expect(resp.payload!.tabs[0].terminalId).toBeNull();

      // Verify the tab exists in the session DB
      const sessionRow = sessionDb
        .prepare('SELECT * FROM tabs WHERE id = ?')
        .get(resp.payload!.tabs[0].id) as Record<string, unknown> | null;
      expect(sessionRow).not.toBeNull();
      expect(sessionRow!.tab_type).toBe('editor');
    });

    it('returns empty array when no persisted tabs exist', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(0);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      registerTabHandlers(router, deps);

      const req = request('tab.restore', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('uses custom_title over title when restoring', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      registerTabHandlers(router, deps);

      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, file_path, pane, sort_order, custom_title)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-2',
          'ws-1',
          'editor',
          'original.ts',
          'src/original.ts',
          'content',
          0,
          'Custom Name',
        );

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.payload!.tabs[0].title).toBe('Custom Name');
    });
  });

  // =========================================================================
  // tab.restore with worktreePath
  // =========================================================================

  describe('tab.restore with worktreePath', () => {
    it('restores only persisted tabs matching the worktreePath', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      registerTabHandlers(router, deps);

      // Seed persisted tabs with different worktree_paths
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, file_path, pane, sort_order, worktree_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-wf1',
          'ws-1',
          'editor',
          'feature.ts',
          'src/feature.ts',
          'content',
          0,
          '/repos/repo/worktrees/feature',
        );
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, file_path, pane, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('ptab-root', 'ws-1', 'editor', 'root.ts', 'src/root.ts', 'content', 1);

      const req = request('tab.restore', {
        workspaceId: 'ws-1',
        worktreePath: '/repos/repo/worktrees/feature',
      });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].title).toBe('feature.ts');
    });

    it('restores only non-worktree persisted tabs when worktreePath is omitted', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      registerTabHandlers(router, deps);

      // Seed persisted tabs with different worktree_paths
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, file_path, pane, sort_order, worktree_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-wf2',
          'ws-1',
          'editor',
          'feature.ts',
          'src/feature.ts',
          'content',
          0,
          '/repos/repo/worktrees/feature',
        );
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, file_path, pane, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('ptab-root2', 'ws-1', 'editor', 'root.ts', 'src/root.ts', 'content', 1);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].title).toBe('root.ts');
    });
  });

  // =========================================================================
  // tab.restore terminal reuse
  // =========================================================================

  describe('tab.restore terminal reuse', () => {
    it('reuses live terminal when persisted tab has a live terminalId', async () => {
      // Seed workspace
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      // Seed a persisted terminal tab with a terminal_id
      const liveTerminalId = 'live-term-1';
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, terminal_id, cwd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-term1',
          'ws-1',
          'terminal',
          'Live Term',
          'content',
          0,
          liveTerminalId,
          process.cwd(),
        );

      // Mock ptyManager to report the terminal as alive
      ptyManager.has.mockImplementation((id: string) => id === liveTerminalId);
      ptyManager.hasExited.mockImplementation((id: string) => id !== liveTerminalId);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].terminalId).toBe(liveTerminalId);

      // Verify ptyManager.create was NOT called (terminal was reused)
      expect(ptyManager.create.mock.calls).toHaveLength(0);

      // Verify setOutputTarget was called for the reused terminal
      expect(ptyManager.setOutputTarget.mock.calls).toHaveLength(1);
      expect(ptyManager.setOutputTarget.mock.calls[0][0]).toBe(liveTerminalId);
    });

    it('creates new PTY when persisted tab has a dead terminalId', async () => {
      // Seed workspace
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      // Seed a persisted terminal tab with a terminal_id that is dead
      const deadTerminalId = 'dead-term-1';
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, terminal_id, cwd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-term2',
          'ws-1',
          'terminal',
          'Dead Term',
          'content',
          0,
          deadTerminalId,
          process.cwd(),
        );

      // Mock ptyManager to report the terminal as dead
      ptyManager.has.mockImplementation(() => false);
      ptyManager.hasExited.mockImplementation(() => true);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);

      // Verify ptyManager.create WAS called (new PTY created)
      expect(ptyManager.create.mock.calls).toHaveLength(1);

      // The new terminal ID should come from createTerminalInstance (a UUID)
      const newTerminalId = resp.payload!.tabs[0].terminalId;
      expect(newTerminalId).not.toBe(deadTerminalId);
      expect(typeof newTerminalId).toBe('string');
    });

    it('creates new PTY when persisted tab has no terminalId', async () => {
      // Seed workspace
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      // Seed a persisted terminal tab with no terminal_id
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, cwd)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('ptab-term3', 'ws-1', 'terminal', 'No Term', 'content', 0, process.cwd());

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);

      // Verify ptyManager.create WAS called (new PTY created)
      expect(ptyManager.create.mock.calls).toHaveLength(1);
    });

    it('calls setOutputTarget for reused terminals with correct callbacks', async () => {
      // Seed workspace
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      const liveTerminalId = 'live-term-cb';
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, terminal_id, cwd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('ptab-cb', 'ws-1', 'terminal', 'CB Term', 'content', 0, liveTerminalId, process.cwd());

      ptyManager.has.mockImplementation((id: string) => id === liveTerminalId);
      ptyManager.hasExited.mockImplementation((id: string) => id !== liveTerminalId);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      // Verify setOutputTarget was called
      expect(ptyManager.setOutputTarget.mock.calls).toHaveLength(1);
      const [targetId, onData, onExit] = ptyManager.setOutputTarget.mock.calls[0];
      expect(targetId).toBe(liveTerminalId);
      expect(typeof onData).toBe('function');
      expect(typeof onExit).toBe('function');

      // Test the onData callback sends terminal.output event
      conn.sent.length = 0;
      onData('aGVsbG8='); // base64 for 'hello'
      expect(conn.sent).toHaveLength(1);
      expect((conn.sent[0] as Record<string, unknown>).type).toBe('event');
      expect((conn.sent[0] as Record<string, unknown>).channel).toBe('terminal.output');

      // Test the onExit callback sends terminal.exit event
      conn.sent.length = 0;
      onExit(0);
      expect(conn.sent).toHaveLength(1);
      expect((conn.sent[0] as Record<string, unknown>).type).toBe('event');
      expect((conn.sent[0] as Record<string, unknown>).channel).toBe('terminal.exit');
    });

    it('saves terminalId in persisted tab after restore', async () => {
      // Seed workspace
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      const liveTerminalId = 'live-term-persist';
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, terminal_id, cwd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-persist',
          'ws-1',
          'terminal',
          'Persist Term',
          'content',
          0,
          liveTerminalId,
          process.cwd(),
        );

      ptyManager.has.mockImplementation((id: string) => id === liveTerminalId);
      ptyManager.hasExited.mockImplementation((id: string) => id !== liveTerminalId);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      const newTabId = resp.payload!.tabs[0].id;

      // Check the persisted tab now has the terminalId saved
      const row = persistentDb
        .prepare('SELECT terminal_id FROM persisted_tabs WHERE id = ?')
        .get(newTabId) as { terminal_id: string | null } | null;
      expect(row).not.toBeNull();
      expect(row!.terminal_id).toBe(liveTerminalId);
    });

    it('creates workspace_terminals row when creating new PTY', async () => {
      // Seed workspace
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      // Seed a persisted terminal tab with no terminal_id
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, cwd)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('ptab-ws', 'ws-1', 'terminal', 'WS Term', 'content', 0, process.cwd());

      // All terminals are dead -> new PTY will be created
      ptyManager.has.mockImplementation(() => false);
      ptyManager.hasExited.mockImplementation(() => true);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      const newTerminalId = resp.payload!.tabs[0].terminalId;

      // Verify a workspace_terminals row was created
      const wsTerm = sessionDb
        .prepare('SELECT * FROM workspace_terminals WHERE id = ?')
        .get(newTerminalId) as Record<string, unknown> | null;
      expect(wsTerm).not.toBeNull();
      expect(wsTerm!.workspace_id).toBe('ws-1');
    });
  });

  // =========================================================================
  // tab.restore worktree_path in workspace_terminals
  // =========================================================================

  describe('tab.restore worktree_path in workspace_terminals', () => {
    it('creates workspace_terminal with worktree_path for new PTY', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      // Seed a persisted terminal tab with worktree_path and a dead terminal_id
      const deadTerminalId = 'dead-wt-1';
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, terminal_id, cwd, worktree_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-wt-new',
          'ws-1',
          'terminal',
          'WT New Term',
          'content',
          0,
          deadTerminalId,
          process.cwd(),
          '/feature',
        );

      // Mock ptyManager to report the terminal as dead
      ptyManager.has.mockImplementation(() => false);
      ptyManager.hasExited.mockImplementation(() => true);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1', worktreePath: '/feature' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);

      // The new terminal was created
      const newTerminalId = resp.payload!.tabs[0].terminalId;
      expect(newTerminalId).not.toBeNull();

      // Verify the workspace_terminals row has the worktree_path
      const wsTerm = sessionDb
        .prepare('SELECT * FROM workspace_terminals WHERE id = ?')
        .get(newTerminalId!) as Record<string, unknown> | null;
      expect(wsTerm).not.toBeNull();
      expect(wsTerm!.worktree_path).toBe('/feature');
    });

    it('creates workspace_terminal with NULL worktree_path for workspace-root terminal', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      // Seed a persisted terminal tab with NO worktree_path and a dead terminal_id
      const deadTerminalId = 'dead-wt-root';
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, terminal_id, cwd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-wt-root',
          'ws-1',
          'terminal',
          'Root Term',
          'content',
          0,
          deadTerminalId,
          process.cwd(),
        );

      // Mock ptyManager to report the terminal as dead
      ptyManager.has.mockImplementation(() => false);
      ptyManager.hasExited.mockImplementation(() => true);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);

      const newTerminalId = resp.payload!.tabs[0].terminalId;
      expect(newTerminalId).not.toBeNull();

      // Verify the workspace_terminals row has NULL worktree_path
      const wsTerm = sessionDb
        .prepare('SELECT * FROM workspace_terminals WHERE id = ?')
        .get(newTerminalId!) as Record<string, unknown> | null;
      expect(wsTerm).not.toBeNull();
      expect(wsTerm!.worktree_path).toBeNull();
    });
  });

  describe('tab.restore strict worktree match for live terminal reuse', () => {
    it('reuses live terminal when worktree_path matches', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      const liveTerminalId = 'live-wt-match';
      const worktreePath = '/feature';

      // Seed a persisted terminal tab with worktree_path and a live terminal_id
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, terminal_id, cwd, worktree_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-wt-match',
          'ws-1',
          'terminal',
          'Match Term',
          'content',
          0,
          liveTerminalId,
          process.cwd(),
          worktreePath,
        );

      // Seed a workspace_terminals row with matching worktree_path
      sessionDb
        .prepare(
          'INSERT INTO workspace_terminals (id, workspace_id, cwd, cols, rows, worktree_path) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(liveTerminalId, 'ws-1', process.cwd(), 80, 24, worktreePath);

      // Mock ptyManager to report the terminal as alive
      ptyManager.has.mockImplementation((id: string) => id === liveTerminalId);
      ptyManager.hasExited.mockImplementation((id: string) => id !== liveTerminalId);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1', worktreePath });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].terminalId).toBe(liveTerminalId);

      // Terminal was reused — ptyManager.create should NOT have been called
      expect(ptyManager.create.mock.calls).toHaveLength(0);

      // setOutputTarget should have been called to re-attach callbacks
      expect(ptyManager.setOutputTarget.mock.calls).toHaveLength(1);
      expect(ptyManager.setOutputTarget.mock.calls[0][0]).toBe(liveTerminalId);
    });

    it('creates new PTY when live terminal worktree_path does not match', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      const liveTerminalId = 'live-wt-mismatch';

      // Seed a persisted terminal tab with worktree_path '/feature'
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, terminal_id, cwd, worktree_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-wt-mismatch',
          'ws-1',
          'terminal',
          'Mismatch Term',
          'content',
          0,
          liveTerminalId,
          process.cwd(),
          '/feature',
        );

      // Seed a workspace_terminals row with a DIFFERENT worktree_path
      sessionDb
        .prepare(
          'INSERT INTO workspace_terminals (id, workspace_id, cwd, cols, rows, worktree_path) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(liveTerminalId, 'ws-1', process.cwd(), 80, 24, '/other');

      // Mock ptyManager to report the terminal as alive
      ptyManager.has.mockImplementation((id: string) => id === liveTerminalId);
      ptyManager.hasExited.mockImplementation((id: string) => id !== liveTerminalId);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1', worktreePath: '/feature' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);

      // The live terminal should NOT be reused because worktree_path doesn't match
      const newTerminalId = resp.payload!.tabs[0].terminalId;
      expect(newTerminalId).not.toBe(liveTerminalId);

      // A new PTY should have been created
      expect(ptyManager.create.mock.calls).toHaveLength(1);

      // setOutputTarget should NOT have been called (old terminal was not reused)
      expect(ptyManager.setOutputTarget.mock.calls).toHaveLength(0);
    });

    it('reuses live terminal when both tab and terminal have NULL worktree_path', async () => {
      // Seed workspace so getWorkspace succeeds
      persistentDb
        .prepare('INSERT INTO workspaces (id, name, cwd, color) VALUES (?, ?, ?, ?)')
        .run('ws-1', 'Test', process.cwd(), '#007acc');

      const liveTerminalId = 'live-wt-both-null';

      // Seed a persisted terminal tab with NO worktree_path and a live terminal_id
      persistentDb
        .prepare(
          `INSERT INTO persisted_tabs (id, workspace_id, tab_type, title, pane, sort_order, terminal_id, cwd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'ptab-wt-null',
          'ws-1',
          'terminal',
          'Null WT Term',
          'content',
          0,
          liveTerminalId,
          process.cwd(),
        );

      // Seed a workspace_terminals row with NULL worktree_path
      sessionDb
        .prepare(
          'INSERT INTO workspace_terminals (id, workspace_id, cwd, cols, rows, worktree_path) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(liveTerminalId, 'ws-1', process.cwd(), 80, 24, null);

      // Mock ptyManager to report the terminal as alive
      ptyManager.has.mockImplementation((id: string) => id === liveTerminalId);
      ptyManager.hasExited.mockImplementation((id: string) => id !== liveTerminalId);

      registerTabHandlers(router, deps);

      const req = request('tab.restore', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      const resp = conn.sent[0] as ResponseEnvelope<TabRestoreResponse>;
      expect(resp.error).toBeUndefined();
      expect(resp.payload!.tabs).toHaveLength(1);
      expect(resp.payload!.tabs[0].terminalId).toBe(liveTerminalId);

      // Both NULL → should treat as matching and reuse the terminal
      expect(ptyManager.create.mock.calls).toHaveLength(0);
      expect(ptyManager.setOutputTarget.mock.calls).toHaveLength(1);
      expect(ptyManager.setOutputTarget.mock.calls[0][0]).toBe(liveTerminalId);
    });
  });
});
