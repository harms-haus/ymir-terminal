import {
  ErrorCodes,
  type GitWorktreeInfo,
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
  type TerminalStateRequest,
  type TerminalStateResponse,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  toBase64,
} from '@ymir/shared';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { PTYManager } from '../../pty/manager';
import type { ClientConnection } from '../connection';
import { createError, createResponse, createEvent, type MessageRouter } from '../router';
import {
  type Database,
  createWorkspaceTerminal,
  updateWorkspaceTerminalSize,
  deleteWorkspaceTerminal,
} from '../../db/session';
import { getWorkspace } from '../../db/persistent';
import { join, resolve } from 'node:path';
import { listWorktrees } from '../../git/worktrees';
import {
  validateWorkspaceTerminalAccess,
  safePath,
  resolveCwdWithWorktreeFallback,
} from '../../lib/handler-validation';
import { startAgentStatusWatcher } from './agent-status.js';

export interface TerminalDeps {
  ptyManager: PTYManager;
  sessionDb: Database;
  persistentDb: Database;
}

/** Cleanup functions for agent status file watchers, keyed by terminalId. */
const agentWatchers = new Map<string, () => void>();

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

/**
 * Register WebSocket handlers for all terminal.* channels.
 */
export function registerTerminalHandlers(router: MessageRouter, deps: TerminalDeps): void {
  const { ptyManager, sessionDb } = deps;

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

    // Resolve workspace CWD
    const workspace =
      workspaceId !== 'default' ? getWorkspace(deps.persistentDb, workspaceId) : null;
    const workspaceCwd = workspace?.cwd ?? process.cwd();

    // Validate cwd — must be within the workspace or a known git worktree
    const rejectInvalidCwd = () => {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'terminal.create' },
          ErrorCodes.PERMISSION_DENIED,
          'Invalid cwd: path is not within the workspace or a known worktree',
        ),
      );
    };

    let cwd: string;
    let terminalWorktreePath: string | undefined;
    if (typeof payload.cwd === 'string' && payload.cwd.length > 0) {
      // Only fetch worktrees when the candidate might need fallback resolution.
      // When safePath succeeds and the resolved path equals the workspace root,
      // no worktree check is needed — this avoids unnecessary git calls.
      let worktrees: GitWorktreeInfo[] | undefined;
      try {
        const resolved = safePath(workspaceCwd, payload.cwd);
        if (resolved !== resolve(workspaceCwd)) {
          worktrees = await listWorktrees(workspaceCwd).catch(() => []);
        }
      } catch {
        worktrees = await listWorktrees(workspaceCwd).catch(() => []);
      }

      const result = resolveCwdWithWorktreeFallback(workspaceCwd, payload.cwd, worktrees ?? []);
      if (!result) {
        return rejectInvalidCwd();
      }
      cwd = result.cwd;
      terminalWorktreePath = result.worktreePath;
    } else {
      cwd = workspaceCwd;
      terminalWorktreePath = undefined;
    }

    // Validate command — only undefined (shell) or 'pi' are accepted
    const command = payload?.command;
    if (command !== undefined && command !== 'pi') {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'terminal.create' },
          ErrorCodes.INVALID_MESSAGE,
          `Unsupported command: ${command}`,
        ),
      );
      return;
    }

    // Generate terminal ID before creating the DB entry
    const terminalId = crypto.randomUUID();

    // Create a DB entry in workspace_terminals for the terminal instance
    createWorkspaceTerminal(sessionDb, {
      id: terminalId,
      workspaceId,
      cwd,
      cols,
      rows,
      worktreePath: terminalWorktreePath,
    });

    // Determine PTY spawn options based on command
    const isAgent = command === 'pi';
    const agentDir = isAgent ? mkdtempSync(join(tmpdir(), 'ymir-agent-')) : undefined;
    const agentStatusPath = agentDir ? join(agentDir, 'status.json') : undefined;
    const commandArray = isAgent ? ['pi', '-e', 'npm:@harms-haus/pi-ymir'] : undefined;
    const extraEnv = isAgent ? { YMIR_AGENT_STATUS_PATH: agentStatusPath! } : undefined;

    // Create the PTY process
    try {
      ptyManager.create(terminalId, {
        cwd,
        cols,
        rows,
        command: commandArray,
        env: extraEnv,
        onData: (b64Data: string) => {
          const evt = createEvent('terminal.output', {
            terminalId,
            data: b64Data,
          } satisfies TerminalOutputEvent);
          conn.send(evt);
        },
        onExit: (exitCode) => {
          const evt = createEvent('terminal.exit', {
            terminalId,
            exitCode: exitCode ?? 0,
          } satisfies TerminalExitEvent);
          conn.send(evt);
          // Clean up agent watcher if present
          const cleanup = agentWatchers.get(terminalId);
          if (cleanup) {
            cleanup();
            agentWatchers.delete(terminalId);
          }
          deleteWorkspaceTerminal(sessionDb, terminalId);
        },
      });
    } catch (err: unknown) {
      // Clean up the DB record if PTY creation fails
      deleteWorkspaceTerminal(sessionDb, terminalId);
      const message = err instanceof Error ? err.message : String(err);
      const errResp: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'terminal.create' },
        ErrorCodes.INTERNAL_ERROR,
        `Failed to create terminal: ${message}`,
      );
      conn.send(errResp);
      return;
    }

    // Start agent status watcher for pi terminals
    if (isAgent) {
      const stopWatcher = startAgentStatusWatcher({
        terminalId,
        statusFilePath: agentStatusPath!,
        onStatus: (event) => {
          conn.send(createEvent('agent.status', event));
        },
      });
      agentWatchers.set(terminalId, stopWatcher);
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

    if (!validateWorkspaceTerminalAccess(sessionDb, terminalId, conn, req)) {
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

    if (!validateWorkspaceTerminalAccess(sessionDb, terminalId, conn, req)) {
      return;
    }

    const cols = req.payload?.cols ?? DEFAULT_COLS;
    const rows = req.payload?.rows ?? DEFAULT_ROWS;

    // Resize PTY
    ptyManager.resize(terminalId, cols, rows);

    // Update DB
    updateWorkspaceTerminalSize(sessionDb, terminalId, cols, rows);

    const resp: ResponseEnvelope = createResponse(req, null);
    conn.send(resp);
  });

  // --- terminal.close -----------------------------------------------------
  router.handle('terminal.close', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalCloseRequest>;

    const terminalId = requireTerminalId(req.payload, conn, req, 'terminal.close');
    if (!terminalId) return;

    if (!validateWorkspaceTerminalAccess(sessionDb, terminalId, conn, req)) {
      return;
    }

    // Kill PTY
    ptyManager.kill(terminalId);

    // Clean up agent watcher if present
    const cleanup = agentWatchers.get(terminalId);
    if (cleanup) {
      cleanup();
      agentWatchers.delete(terminalId);
    }

    // Remove from DB
    deleteWorkspaceTerminal(sessionDb, terminalId);

    const resp: ResponseEnvelope = createResponse(req, null);
    conn.send(resp);
  });

  // --- terminal.state -----------------------------------------------------
  router.handle('terminal.state', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TerminalStateRequest>;

    const terminalId = requireTerminalId(req.payload, conn, req, 'terminal.state');
    if (!terminalId) return;

    const result = validateWorkspaceTerminalAccess(sessionDb, terminalId, conn, req);
    if (!result) return; // error already sent

    const snapshot = ptyManager.getBufferSnapshot(terminalId);
    const dims = ptyManager.getDimensions(terminalId);

    // Re-attach output to this connection
    //
    // Design note: The buffer snapshot is captured BEFORE setOutputTarget. Any output
    // produced between getBufferSnapshot() and setOutputTarget() is still captured in
    // the OutputRingBuffer (the buffer always appends before calling onData). The
    // client-side useTerminal.restoreState() handles potential duplication via event
    // buffering (isRestoringRef/pendingEventsRef): it buffers live events during
    // restoration, replays the state snapshot first, then replays buffered events.
    // Output sent to the old connection between these calls is silently lost (old
    // connection is dead), but the buffer captures it for the next reconnection.
    if (!ptyManager.hasExited(terminalId)) {
      ptyManager.setOutputTarget(
        terminalId,
        (b64Data: string) => {
          conn.send(
            createEvent('terminal.output', {
              terminalId,
              data: b64Data,
            } satisfies TerminalOutputEvent),
          );
        },
        (exitCode: number | null) => {
          conn.send(
            createEvent('terminal.exit', {
              terminalId,
              exitCode: exitCode ?? 0,
            } satisfies TerminalExitEvent),
          );
          deleteWorkspaceTerminal(sessionDb, terminalId);
        },
      );
    }

    const resp: ResponseEnvelope<TerminalStateResponse> = createResponse(req, {
      terminalId,
      data: snapshot ? toBase64(snapshot) : '',
      cols: dims?.cols ?? (result.instance.cols as number) ?? DEFAULT_COLS,
      rows: dims?.rows ?? (result.instance.rows as number) ?? DEFAULT_ROWS,
    } satisfies TerminalStateResponse);

    conn.send(resp);
  });
}
