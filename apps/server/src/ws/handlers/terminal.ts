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
  type AgentStatusResponse,
  type AgentStatusRequest,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  fromBase64,
  toBase64,
} from '@ymir/shared';
import type { PTYManager } from '../../pty/manager';
import type { ClientConnection } from '../connection';
import { createError, createResponse, createEvent, type MessageRouter } from '../router';
import {
  type Database,
  createTerminalInstance,
  updateTerminalSize,
  deleteTerminalInstance,
} from '../../db/session';
import { resolve } from 'node:path';
import { getWorkspace } from '../../db/persistent';
import { listWorktrees } from '../../git/worktrees';
import { validateTerminalOwnership, safePath } from '../../lib/handler-validation';
import { OSC777ByteStreamParser, hasOSC777Prefix } from '../../agent/osc777-parser';
import type { AgentStatusTracker } from '../../agent/status-tracker';
import type { ProcessMonitor } from '../../agent/process-monitor';

export interface TerminalDeps {
  ptyManager: PTYManager;
  sessionDb: Database;
  persistentDb: Database;
  statusTracker: AgentStatusTracker;
  processMonitor: ProcessMonitor;
}

/**
 * Validate that a payload contains a string `terminalId` field.
 * Sends INVALID_MESSAGE and returns `null` on failure.
 */
function requireTerminalId(
  payload: Record<string, unknown> | undefined | null | { terminalId?: unknown },
  clientConn: ClientConnection,
  req: Pick<RequestEnvelope, 'id' | 'channel'>,
  channel: string,
): string | null {
  const terminalId = payload?.terminalId;
  if (!terminalId || typeof terminalId !== 'string') {
    const err: ResponseEnvelope = createError(
      { id: req.id, channel: req.channel ?? channel },
      ErrorCodes.INVALID_MESSAGE,
      'Missing or invalid terminalId',
    );
    clientConn.send(err);
    return null;
  }
  return terminalId;
}

/** Per-terminal OSC 777 byte stream parsers. */
const oscByteParsers = new Map<string, OSC777ByteStreamParser>();

/**
 * Register WebSocket handlers for all terminal.* channels.
 */
export function registerTerminalHandlers(router: MessageRouter, deps: TerminalDeps): void {
  const { ptyManager, sessionDb, statusTracker, processMonitor } = deps;

  // --- terminal.create ----------------------------------------------------
  router.handle('terminal.create', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalCreateRequest>;
    const payload = req.payload;

    const workspaceId = payload?.workspaceId;
    if (!workspaceId || typeof workspaceId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.create' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid workspaceId',
      );
      conn.send(err);
      return;
    }

    const cols = payload?.cols ?? DEFAULT_COLS;
    const rows = payload?.rows ?? DEFAULT_ROWS;

    // Create a DB entry for the terminal instance
    const terminalId = createTerminalInstance(sessionDb, {
      sessionId: conn.sessionId,
      workspaceId,
      cols,
      rows,
    });

    // Resolve workspace CWD
    const workspace =
      workspaceId !== 'default' ? getWorkspace(deps.persistentDb, workspaceId) : null;
    const workspaceCwd = workspace?.cwd ?? process.cwd();

    // Validate cwd — must be within the workspace or a known git worktree
    let cwd: string;
    if (typeof payload.cwd === 'string' && payload.cwd.length > 0) {
      const resolvedCwd = resolve(payload.cwd);
      try {
        cwd = safePath(workspaceCwd, payload.cwd);
      } catch {
        // Not within workspace — check if it's a known worktree
        try {
          const worktrees = await listWorktrees(workspaceCwd);
          const isKnownWorktree = worktrees.some((w) => resolve(w.path) === resolvedCwd);
          if (!isKnownWorktree) {
            deleteTerminalInstance(sessionDb, terminalId);
            conn.send(
              createError(
                { id: req.id, channel: req.channel ?? 'terminal.create' },
                ErrorCodes.PERMISSION_DENIED,
                'Invalid cwd: path is not within the workspace or a known worktree',
              ),
            );
            return;
          }
          cwd = resolvedCwd;
        } catch {
          deleteTerminalInstance(sessionDb, terminalId);
          conn.send(
            createError(
              { id: req.id, channel: req.channel ?? 'terminal.create' },
              ErrorCodes.PERMISSION_DENIED,
              'Invalid cwd: path is not within the workspace or a known worktree',
            ),
          );
          return;
        }
      }
    } else {
      cwd = workspaceCwd;
    }

    // Create parser for OSC 777 agent notifications
    const parser = new OSC777ByteStreamParser();
    oscByteParsers.set(terminalId, parser);

    // Create the PTY process
    try {
      ptyManager.create(terminalId, {
        cwd,
        cols,
        rows,
        onData: (b64Data: string) => {
          let outputData = b64Data;
          const p = oscByteParsers.get(terminalId);
          if (p && (hasOSC777Prefix(b64Data) || p.hasPartial())) {
            const rawBytes = fromBase64(b64Data);
            const result = p.feed(rawBytes);

            // Process any agent events
            for (const event of result.events) {
              statusTracker.updateFromOSC777(terminalId, event);
              // If status actually changed, the onStatusChange listener in
              // server.ts will broadcast the agent.status event to the client.
              // No need to send it from here.
            }

            // Use the cleaned data (with OSC 777 sequences stripped)
            outputData = toBase64(result.cleanedData);
          }

          const evt = createEvent('terminal.output', {
            terminalId,
            data: outputData,
          } satisfies TerminalOutputEvent);
          conn.send(evt);
        },
        onExit: (exitCode) => {
          const evt = createEvent('terminal.exit', {
            terminalId,
            exitCode: exitCode ?? 0,
          } satisfies TerminalExitEvent);
          conn.send(evt);
          deleteTerminalInstance(sessionDb, terminalId);
          oscByteParsers.delete(terminalId);
          processMonitor.untrackTerminal(terminalId);
          statusTracker.clearTerminal(terminalId);
        },
      });
    } catch (err: unknown) {
      // Clean up the DB record and parser if PTY creation fails
      oscByteParsers.delete(terminalId);
      deleteTerminalInstance(sessionDb, terminalId);
      const message = err instanceof Error ? err.message : String(err);
      const errResp: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.create' },
        ErrorCodes.INTERNAL_ERROR,
        `Failed to create terminal: ${message}`,
      );
      conn.send(errResp);
      return;
    }

    // Track the shell PID for process monitoring
    const pids = ptyManager.getTerminalPids();
    const pid = pids.get(terminalId);
    if (pid !== undefined) {
      processMonitor.trackTerminal(terminalId, pid);
    }

    const resp: ResponseEnvelope<TerminalCreateResponse> = createResponse(req, {
      terminalId,
    } satisfies TerminalCreateResponse);

    conn.send(resp);
  });

  // --- terminal.input -----------------------------------------------------
  router.handle('terminal.input', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalInputRequest>;

    const terminalId = requireTerminalId(req.payload, conn, req, 'terminal.input');
    if (!terminalId) return;

    if (!validateTerminalOwnership(sessionDb, terminalId, conn.sessionId, conn, req)) {
      return;
    }

    // Write base64-encoded data to the PTY
    ptyManager.write(terminalId, req.payload?.data ?? '');

    const resp: ResponseEnvelope = createResponse(req, null);
    conn.send(resp);
  });

  // --- terminal.resize ----------------------------------------------------
  router.handle('terminal.resize', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalResizeRequest>;

    const terminalId = requireTerminalId(req.payload, conn, req, 'terminal.resize');
    if (!terminalId) return;

    if (!validateTerminalOwnership(sessionDb, terminalId, conn.sessionId, conn, req)) {
      return;
    }

    const cols = req.payload?.cols ?? DEFAULT_COLS;
    const rows = req.payload?.rows ?? DEFAULT_ROWS;

    // Resize PTY
    ptyManager.resize(terminalId, cols, rows);

    // Update DB
    updateTerminalSize(sessionDb, terminalId, cols, rows);

    const resp: ResponseEnvelope = createResponse(req, null);
    conn.send(resp);
  });

  // --- terminal.close -----------------------------------------------------
  router.handle('terminal.close', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalCloseRequest>;

    const terminalId = requireTerminalId(req.payload, conn, req, 'terminal.close');
    if (!terminalId) return;

    if (!validateTerminalOwnership(sessionDb, terminalId, conn.sessionId, conn, req)) {
      return;
    }

    // Kill PTY
    ptyManager.kill(terminalId);

    // Remove from DB
    deleteTerminalInstance(sessionDb, terminalId);

    // Clean up agent tracking
    processMonitor.untrackTerminal(terminalId);
    statusTracker.clearTerminal(terminalId);
    oscByteParsers.delete(terminalId);

    const resp: ResponseEnvelope = createResponse(req, null);
    conn.send(resp);
  });

  // --- agent.statusQuery ---------------------------------------------------
  router.handle('agent.statusQuery', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<AgentStatusRequest>;
    const workspaceId = req.payload?.workspaceId;

    if (!workspaceId || typeof workspaceId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'agent.statusQuery' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid workspaceId',
      );
      conn.send(err);
      return;
    }

    // Get all terminals belonging to this session + workspace
    const terminals = sessionDb
      .prepare('SELECT id FROM terminal_instances WHERE session_id = ? AND workspace_id = ?')
      .all(conn.sessionId, workspaceId) as { id: string }[];

    const allStatuses = statusTracker.getAllStatuses();
    const statuses: AgentStatusResponse['statuses'] = [];

    for (const { id } of terminals) {
      const state = allStatuses.get(id);
      if (state) {
        statuses.push({
          terminalId: id,
          status: state.status,
          agent: state.agent,
        });
      } else {
        // Terminal exists but has no agent status yet — default to 'done'
        statuses.push({
          terminalId: id,
          status: 'done',
        });
      }
    }

    const resp: ResponseEnvelope<AgentStatusResponse> = createResponse(req, {
      statuses,
    } satisfies AgentStatusResponse);
    conn.send(resp);
  });
}
