import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type TerminalCreateRequest,
  type TerminalCreateResponse,
  type TerminalInputRequest,
  type TerminalResizeRequest,
  type TerminalCloseRequest,
  type TerminalOutputEvent,
  type TerminalExitEvent,
  DEFAULT_COLS,
  DEFAULT_ROWS,
} from '@ymir/shared';
import type { PTYManager } from '../../pty/manager';
import type { ClientConnection } from '../connection';
import { createError, createResponse, createEvent, type MessageRouter } from '../router';
import {
  type Database,
  createTerminalInstance,
  getTerminalInstance,
  updateTerminalSize,
  deleteTerminalInstance,
} from '../../db/session';
import { getWorkspace } from '../../db/persistent';

export interface TerminalDeps {
  ptyManager: PTYManager;
  sessionDb: Database;
  persistentDb: Database;
}

/**
 * Register WebSocket handlers for all terminal.* channels.
 */
export function registerTerminalHandlers(router: MessageRouter, deps: TerminalDeps): void {
  const { ptyManager, sessionDb } = deps;

  // --- terminal.create ----------------------------------------------------
  router.handle('terminal.create', async (conn: unknown, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalCreateRequest>;
    const clientConn = conn as ClientConnection;
    const payload = req.payload;

    const workspaceId = payload?.workspaceId;
    if (!workspaceId || typeof workspaceId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.create' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid workspaceId',
      );
      clientConn.send(err);
      return;
    }

    const cols = payload?.cols ?? DEFAULT_COLS;
    const rows = payload?.rows ?? DEFAULT_ROWS;

    // Create a DB entry for the terminal instance
    const terminalId = createTerminalInstance(sessionDb, {
      sessionId: clientConn.sessionId,
      workspaceId,
      cols,
      rows,
    });

    // Resolve workspace CWD
    const workspace =
      workspaceId !== 'default' ? getWorkspace(deps.persistentDb, workspaceId) : null;
    const cwd = workspace?.cwd ?? process.cwd();

    // Create the PTY process
    ptyManager.create(terminalId, {
      cwd,
      cols,
      rows,
      onData: (data: string) => {
        const evt = createEvent('terminal.output', {
          terminalId,
          data,
        } satisfies TerminalOutputEvent);
        clientConn.send(evt);
      },
      onExit: (exitCode) => {
        const evt = createEvent('terminal.exit', {
          terminalId,
          exitCode,
        } satisfies TerminalExitEvent);
        clientConn.send(evt);
        deleteTerminalInstance(sessionDb, terminalId);
      },
    });

    const resp: ResponseEnvelope<TerminalCreateResponse> = createResponse(req, {
      terminalId,
    } satisfies TerminalCreateResponse);

    clientConn.send(resp);
  });

  // --- terminal.input -----------------------------------------------------
  router.handle('terminal.input', async (conn: unknown, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalInputRequest>;
    const clientConn = conn as ClientConnection;
    const payload = req.payload;

    const terminalId = payload?.terminalId;
    if (!terminalId || typeof terminalId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.input' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid terminalId',
      );
      clientConn.send(err);
      return;
    }

    // Verify terminal exists in DB
    const instance = getTerminalInstance(sessionDb, terminalId);
    if (!instance) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.input' },
        ErrorCodes.TERMINAL_NOT_FOUND,
        `Terminal not found: ${terminalId}`,
      );
      clientConn.send(err);
      return;
    }

    // Verify terminal belongs to the requesting session
    if (instance.session_id !== clientConn.sessionId) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.input' },
        ErrorCodes.PERMISSION_DENIED,
        'Terminal does not belong to this session',
      );
      clientConn.send(err);
      return;
    }

    // Write base64-encoded data to the PTY
    ptyManager.write(terminalId, payload.data ?? '');

    const resp: ResponseEnvelope = createResponse(req, null);
    clientConn.send(resp);
  });

  // --- terminal.resize ----------------------------------------------------
  router.handle('terminal.resize', async (conn: unknown, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalResizeRequest>;
    const clientConn = conn as ClientConnection;
    const payload = req.payload;

    const terminalId = payload?.terminalId;
    if (!terminalId || typeof terminalId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.resize' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid terminalId',
      );
      clientConn.send(err);
      return;
    }

    // Verify terminal exists in DB
    const instance = getTerminalInstance(sessionDb, terminalId);
    if (!instance) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.resize' },
        ErrorCodes.TERMINAL_NOT_FOUND,
        `Terminal not found: ${terminalId}`,
      );
      clientConn.send(err);
      return;
    }

    // Verify terminal belongs to the requesting session
    if (instance.session_id !== clientConn.sessionId) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.resize' },
        ErrorCodes.PERMISSION_DENIED,
        'Terminal does not belong to this session',
      );
      clientConn.send(err);
      return;
    }

    const cols = payload?.cols ?? DEFAULT_COLS;
    const rows = payload?.rows ?? DEFAULT_ROWS;

    // Resize PTY
    ptyManager.resize(terminalId, cols, rows);

    // Update DB
    updateTerminalSize(sessionDb, terminalId, cols, rows);

    const resp: ResponseEnvelope = createResponse(req, null);
    clientConn.send(resp);
  });

  // --- terminal.close -----------------------------------------------------
  router.handle('terminal.close', async (conn: unknown, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalCloseRequest>;
    const clientConn = conn as ClientConnection;
    const payload = req.payload;

    const terminalId = payload?.terminalId;
    if (!terminalId || typeof terminalId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.close' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid terminalId',
      );
      clientConn.send(err);
      return;
    }

    // Verify terminal exists in DB
    const instance = getTerminalInstance(sessionDb, terminalId);
    if (!instance) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.close' },
        ErrorCodes.TERMINAL_NOT_FOUND,
        `Terminal not found: ${terminalId}`,
      );
      clientConn.send(err);
      return;
    }

    // Verify terminal belongs to the requesting session
    if (instance.session_id !== clientConn.sessionId) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.close' },
        ErrorCodes.PERMISSION_DENIED,
        'Terminal does not belong to this session',
      );
      clientConn.send(err);
      return;
    }

    // Kill PTY
    ptyManager.kill(terminalId);

    // Remove from DB
    deleteTerminalInstance(sessionDb, terminalId);

    const resp: ResponseEnvelope = createResponse(req, null);
    clientConn.send(resp);
  });
}
