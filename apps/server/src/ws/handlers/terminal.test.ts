import { describe, expect, it, beforeEach, mock, type Mock } from 'bun:test';
import {
  ErrorCodes,
  type ResponseEnvelope,
  type EventEnvelope,
  type TerminalCreateRequest,
  type TerminalCreateResponse,
  type TerminalInputRequest,
  type TerminalResizeRequest,
  type TerminalCloseRequest,
} from '@ymir/shared';
import { mockConn, request } from '../../test-helpers/mock-utils';
import { MessageRouter } from '../router';
import { registerTerminalHandlers } from './terminal';
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
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake PTY manager with jest-style mocks. */
function mockPtyManager(): MockPty & PTYManager {
  return {
    terminals: new Map<string, { terminal: unknown; process: unknown }>(),
    create: mock((...args: unknown[]) => args[0] as string) as Mock<
      (id: string, options: unknown) => string
    >,
    write: mock(() => {}) as Mock<(id: string, data: string) => void>,
    resize: mock(() => {}) as Mock<(id: string, cols: number, rows: number) => void>,
    kill: mock(() => {}) as Mock<(id: string) => void>,
    has: mock(() => true) as Mock<(id: string) => boolean>,
    killAll: mock(() => {}) as Mock<() => void>,
  } as MockPty & PTYManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerTerminalHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let ptyManager: ReturnType<typeof mockPtyManager>;
  let sessionDb: Database;
  let persistentDb: Database;

  let sessionId: string;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();
    ptyManager = mockPtyManager();
    sessionDb = initSessionDb();
    persistentDb = initPersistentDb(':memory:');
    // Create a client session so foreign keys are satisfied
    sessionId = createSession(sessionDb);
    conn.sessionId = sessionId;
  });

  // -------------------------------------------------------------------------
  // 2. terminal.create
  // -------------------------------------------------------------------------

  describe('terminal.create', () => {
    it('creates a PTY and session DB entry, responds with TerminalCreateResponse', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      const req = request<TerminalCreateRequest>('terminal.create', {
        workspaceId: 'ws-1',
        cols: 120,
        rows: 40,
      });

      await router.route(conn, req);

      // PTY manager create should have been called
      expect(ptyManager.create).toHaveBeenCalledTimes(1);
      const [termId, options] = ptyManager.create.mock.calls[0];
      expect(typeof termId).toBe('string');
      expect(options).toMatchObject({
        cwd: expect.any(String),
        cols: 120,
        rows: 40,
      });

      // Response sent back with terminalId
      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as ResponseEnvelope<TerminalCreateResponse>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();
      expect(resp.payload).toBeDefined();
      expect(typeof (resp.payload as TerminalCreateResponse).terminalId).toBe('string');
    });

    it('uses default cols/rows when not provided', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      const req = request<TerminalCreateRequest>('terminal.create', {
        workspaceId: 'ws-1',
      });

      await router.route(conn, req);

      expect(ptyManager.create).toHaveBeenCalledTimes(1);
      const options = ptyManager.create.mock.calls[0][1] as Record<string, unknown>;
      expect(options.cols).toBe(80);
      expect(options.rows).toBe(24);
    });
  });

  // -------------------------------------------------------------------------
  // 3. terminal.input
  // -------------------------------------------------------------------------

  describe('terminal.input', () => {
    it('decodes base64 data and writes to PTY', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      // First create a terminal so there's something to write to
      const createReq = request<TerminalCreateRequest>('terminal.create', {
        workspaceId: 'ws-1',
      });
      await router.route(conn, createReq);
      const createResp = conn.sent[0] as ResponseEnvelope<TerminalCreateResponse>;
      const terminalId = createResp.payload!.terminalId;

      conn.sent.length = 0; // reset

      const inputData = btoa('ls -la'); // base64 encoded
      const inputReq = request<TerminalInputRequest>('terminal.input', {
        terminalId,
        data: inputData,
      });

      await router.route(conn, inputReq);

      // PTY write should have been called with the terminal ID and base64 data
      expect(ptyManager.write).toHaveBeenCalledTimes(1);
      expect(ptyManager.write.mock.calls[0][0]).toBe(terminalId);
      expect(ptyManager.write.mock.calls[0][1]).toBe(inputData);

      // Response should be success
      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(inputReq.id);
      expect(resp.error).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. terminal.resize
  // -------------------------------------------------------------------------

  describe('terminal.resize', () => {
    it('resizes PTY and updates DB', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      // First create a terminal
      const createReq = request<TerminalCreateRequest>('terminal.create', {
        workspaceId: 'ws-1',
      });
      await router.route(conn, createReq);
      const createResp = conn.sent[0] as ResponseEnvelope<TerminalCreateResponse>;
      const terminalId = createResp.payload!.terminalId;

      conn.sent.length = 0;

      const resizeReq = request<TerminalResizeRequest>('terminal.resize', {
        terminalId,
        cols: 100,
        rows: 50,
      });

      await router.route(conn, resizeReq);

      // PTY resize should have been called
      expect(ptyManager.resize).toHaveBeenCalledTimes(1);
      expect(ptyManager.resize.mock.calls[0]).toEqual([terminalId, 100, 50]);

      // Response should be success
      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(resizeReq.id);
      expect(resp.error).toBeUndefined();

      // Verify DB was updated
      const row = sessionDb
        .prepare('SELECT cols, rows FROM terminal_instances WHERE id = ?')
        .get(terminalId) as { cols: number; rows: number } | undefined;
      expect(row).toBeDefined();
      expect(row!.cols).toBe(100);
      expect(row!.rows).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // 5. terminal.close
  // -------------------------------------------------------------------------

  describe('terminal.close', () => {
    it('kills PTY and removes from DB', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      // First create a terminal
      const createReq = request<TerminalCreateRequest>('terminal.create', {
        workspaceId: 'ws-1',
      });
      await router.route(conn, createReq);
      const createResp = conn.sent[0] as ResponseEnvelope<TerminalCreateResponse>;
      const terminalId = createResp.payload!.terminalId;

      conn.sent.length = 0;

      // Verify it exists in DB
      const beforeRow = sessionDb
        .prepare('SELECT id FROM terminal_instances WHERE id = ?')
        .get(terminalId);
      expect(beforeRow).toBeDefined();

      const closeReq = request<TerminalCloseRequest>('terminal.close', {
        terminalId,
      });

      await router.route(conn, closeReq);

      // PTY kill should have been called
      expect(ptyManager.kill).toHaveBeenCalledTimes(1);
      expect(ptyManager.kill.mock.calls[0][0]).toBe(terminalId);

      // Response should be success
      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(closeReq.id);
      expect(resp.error).toBeUndefined();

      // Verify DB row was removed
      const afterRow = sessionDb
        .prepare('SELECT id FROM terminal_instances WHERE id = ?')
        .get(terminalId);
      expect(afterRow).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Missing terminalId returns TERMINAL_NOT_FOUND
  // -------------------------------------------------------------------------

  describe('missing terminalId error handling', () => {
    it('terminal.input with missing terminalId returns TERMINAL_NOT_FOUND', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      const inputReq = request<TerminalInputRequest>('terminal.input', {
        terminalId: 'nonexistent-id',
        data: btoa('test'),
      });

      await router.route(conn, inputReq);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(inputReq.id);
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(ErrorCodes.TERMINAL_NOT_FOUND);
    });

    it('terminal.resize with missing terminalId returns TERMINAL_NOT_FOUND', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      const resizeReq = request<TerminalResizeRequest>('terminal.resize', {
        terminalId: 'nonexistent-id',
        cols: 100,
        rows: 50,
      });

      await router.route(conn, resizeReq);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.TERMINAL_NOT_FOUND);
    });

    it('terminal.close with missing terminalId returns TERMINAL_NOT_FOUND', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      const closeReq = request<TerminalCloseRequest>('terminal.close', {
        terminalId: 'nonexistent-id',
      });

      await router.route(conn, closeReq);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as ResponseEnvelope;
      expect(resp.error!.code).toBe(ErrorCodes.TERMINAL_NOT_FOUND);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Cross-session access denied
  // -------------------------------------------------------------------------

  describe('cross-session access denied', () => {
    it('terminal.input rejects access from a different session', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      // Create a terminal under the current session
      const createReq = request<TerminalCreateRequest>('terminal.create', {
        workspaceId: 'ws-1',
      });
      await router.route(conn, createReq);
      const createResp = conn.sent[0] as ResponseEnvelope<TerminalCreateResponse>;
      const terminalId = createResp.payload!.terminalId;

      // Use a different session
      const otherConn = mockConn();
      otherConn.sessionId = crypto.randomUUID(); // different session

      const inputReq = request<TerminalInputRequest>('terminal.input', {
        terminalId,
        data: btoa('ls'),
      });

      await router.route(otherConn, inputReq);

      expect(otherConn.sent.length).toBe(1);
      const resp = otherConn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(ErrorCodes.PERMISSION_DENIED);

      // PTY write should NOT have been called
      expect(ptyManager.write).not.toHaveBeenCalled();
    });

    it('terminal.resize rejects access from a different session', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      // Create a terminal under the current session
      const createReq = request<TerminalCreateRequest>('terminal.create', {
        workspaceId: 'ws-1',
      });
      await router.route(conn, createReq);
      const createResp = conn.sent[0] as ResponseEnvelope<TerminalCreateResponse>;
      const terminalId = createResp.payload!.terminalId;

      // Use a different session
      const otherConn = mockConn();
      otherConn.sessionId = crypto.randomUUID();

      const resizeReq = request<TerminalResizeRequest>('terminal.resize', {
        terminalId,
        cols: 100,
        rows: 50,
      });

      await router.route(otherConn, resizeReq);

      expect(otherConn.sent.length).toBe(1);
      const resp = otherConn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(ErrorCodes.PERMISSION_DENIED);

      // PTY resize should NOT have been called
      expect(ptyManager.resize).not.toHaveBeenCalled();
    });

    it('terminal.close rejects access from a different session', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      // Create a terminal under the current session
      const createReq = request<TerminalCreateRequest>('terminal.create', {
        workspaceId: 'ws-1',
      });
      await router.route(conn, createReq);
      const createResp = conn.sent[0] as ResponseEnvelope<TerminalCreateResponse>;
      const terminalId = createResp.payload!.terminalId;

      // Use a different session
      const otherConn = mockConn();
      otherConn.sessionId = crypto.randomUUID();

      const closeReq = request<TerminalCloseRequest>('terminal.close', {
        terminalId,
      });

      await router.route(otherConn, closeReq);

      expect(otherConn.sent.length).toBe(1);
      const resp = otherConn.sent[0] as ResponseEnvelope;
      expect(resp.error).toBeDefined();
      expect(resp.error!.code).toBe(ErrorCodes.PERMISSION_DENIED);

      // PTY kill should NOT have been called
      expect(ptyManager.kill).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 8. PTY output events
  // -------------------------------------------------------------------------

  describe('terminal.output events', () => {
    it('when PTY emits data, sends terminal.output event via connection.send()', async () => {
      registerTerminalHandlers(router, {
        ptyManager,
        sessionDb,
        persistentDb,
      });

      // Capture the onData callback passed to ptyManager.create
      let capturedOnData: ((data: string) => void) | undefined;
      ptyManager.create.mockImplementation((id: string, options: unknown) => {
        capturedOnData = (options as Record<string, unknown>).onData as (data: string) => void;
        return id;
      });

      const createReq = request<TerminalCreateRequest>('terminal.create', {
        workspaceId: 'ws-1',
      });
      await router.route(conn, createReq);

      conn.sent.length = 0; // reset after create response

      // Simulate PTY emitting data
      expect(capturedOnData).toBeDefined();
      const outputB64 = btoa('hello world');
      capturedOnData!(outputB64);

      // Connection should have received a terminal.output event
      expect(conn.sent.length).toBe(1);
      const evt = conn.sent[0] as EventEnvelope;
      expect(evt.type).toBe('event');
      expect(evt.channel).toBe('terminal.output');
      expect(evt.payload).toMatchObject({
        terminalId: expect.any(String),
        data: outputB64,
      });
    });
  });
});
