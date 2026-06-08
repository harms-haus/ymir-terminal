import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type TabRestoreResponse,
  type PersistedTabInfo,
  type GitWorktreeInfo,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  TabUpdateRequestSchema,
  TabDeleteRequestSchema,
  TabReorderRequestSchema,
  TabRestoreRequestSchema,
  validatePayload,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import { createError, createResponse, createEvent } from '../router';
import {
  updateTab,
  deleteTab,
  reorderTabs,
  setActiveTab,
  createTab,
  createPane,
  createTerminalInstance,
  deleteTerminalInstance,
  createWorkspaceTerminal,
  deleteWorkspaceTerminal,
  getWorkspaceTerminal,
} from '../../db/session';
import {
  getWorkspace,
  deletePersistedTab,
  updatePersistedTabOrder,
  updatePersistedTabTitle,
  listPersistedTabsByWorkspace,
  savePersistedTab,
} from '../../db/persistent';
import { validateTabOwnership, resolveCwdWithWorktreeFallback } from '../../lib/handler-validation';
import { listWorktrees } from '../../git/worktrees';
import type { TabDeps } from './tabs';

// ---------------------------------------------------------------------------
// tab.update handler
// ---------------------------------------------------------------------------

export async function handleTabUpdate(
  deps: TabDeps,
  conn: ClientConnection,
  envelope: MessageEnvelope,
): Promise<void> {
  const { sessionDb, persistentDb } = deps;
  const req = envelope as RequestEnvelope;
  const channel = req.channel ?? 'tab.update';

  let payload;
  try {
    payload = validatePayload(TabUpdateRequestSchema, req.payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payload validation failed';
    conn.send(createError({ id: req.id, channel }, ErrorCodes.INVALID_MESSAGE, message));
    return;
  }

  const tab = validateTabOwnership(sessionDb, payload.tabId, conn.sessionId, conn, req);
  if (!tab) return;

  // If setting active, clear other active tabs in the same pane
  if (payload.active) {
    setActiveTab(
      sessionDb,
      conn.sessionId,
      tab.workspace_id as string,
      (tab.pane as string) ?? 'content',
      payload.tabId,
    );
  }

  updateTab(sessionDb, payload.tabId, {
    active: payload.active ? 1 : undefined,
    order: payload.sortOrder,
    title: payload.title,
  });

  // Mirror title update to persistent storage
  if (payload.title !== undefined) {
    updatePersistedTabTitle(persistentDb, payload.tabId, payload.title);
  }

  const resp: ResponseEnvelope = createResponse(req, null);
  conn.send(resp);
}

// ---------------------------------------------------------------------------
// tab.delete handler
// ---------------------------------------------------------------------------

export async function handleTabDelete(
  deps: TabDeps,
  conn: ClientConnection,
  envelope: MessageEnvelope,
): Promise<void> {
  const { sessionDb, persistentDb } = deps;
  const req = envelope as RequestEnvelope;
  const channel = req.channel ?? 'tab.delete';

  let payload;
  try {
    payload = validatePayload(TabDeleteRequestSchema, req.payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payload validation failed';
    conn.send(createError({ id: req.id, channel }, ErrorCodes.INVALID_MESSAGE, message));
    return;
  }

  if (!validateTabOwnership(sessionDb, payload.tabId, conn.sessionId, conn, req)) {
    return;
  }

  deleteTab(sessionDb, payload.tabId);
  deletePersistedTab(persistentDb, payload.tabId);

  const resp: ResponseEnvelope = createResponse(req, null);
  conn.send(resp);
}

// ---------------------------------------------------------------------------
// tab.reorder handler
// ---------------------------------------------------------------------------

export async function handleTabReorder(
  deps: TabDeps,
  conn: ClientConnection,
  envelope: MessageEnvelope,
): Promise<void> {
  const { sessionDb, persistentDb } = deps;
  const req = envelope as RequestEnvelope;
  const channel = req.channel ?? 'tab.reorder';

  let payload;
  try {
    payload = validatePayload(TabReorderRequestSchema, req.payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payload validation failed';
    conn.send(createError({ id: req.id, channel }, ErrorCodes.INVALID_MESSAGE, message));
    return;
  }

  // Batch-validate ownership of all tabs in a single query (avoids N+1)
  const tabIds = payload.tabIds;
  const placeholders = tabIds.map(() => '?').join(',');
  const rows = sessionDb
    .prepare(`SELECT id, workspace_id, session_id FROM tabs WHERE id IN (${placeholders})`)
    .all(...tabIds) as { id: string; workspace_id: string; session_id: string }[];

  if (rows.length !== tabIds.length) {
    const err: ResponseEnvelope = createError(
      { id: req.id, channel },
      ErrorCodes.TAB_NOT_FOUND,
      'One or more tabs not found',
    );
    conn.send(err);
    return;
  }

  // Check that all tabs belong to this session
  for (const row of rows) {
    if (row.session_id !== conn.sessionId) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel },
        ErrorCodes.PERMISSION_DENIED,
        'Tab does not belong to this session',
      );
      conn.send(err);
      return;
    }
  }

  const workspaceId = rows[0].workspace_id;
  reorderTabs(sessionDb, conn.sessionId, workspaceId, tabIds);
  updatePersistedTabOrder(persistentDb, tabIds);

  const resp: ResponseEnvelope = createResponse(req, null);
  conn.send(resp);
}

// ---------------------------------------------------------------------------
// tab.restore handler
// ---------------------------------------------------------------------------

export async function handleTabRestore(
  deps: TabDeps,
  conn: ClientConnection,
  envelope: MessageEnvelope,
): Promise<void> {
  const { sessionDb, persistentDb, ptyManager } = deps;
  const req = envelope as RequestEnvelope;
  const channel = req.channel ?? 'tab.restore';

  let payload;
  try {
    payload = validatePayload(TabRestoreRequestSchema, req.payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payload validation failed';
    conn.send(createError({ id: req.id, channel }, ErrorCodes.INVALID_MESSAGE, message));
    return;
  }

  const workspaceId = payload.workspaceId;
  const worktreePath = payload.worktreePath;
  const persistedTabs = listPersistedTabsByWorkspace(persistentDb, workspaceId, worktreePath);

  // Hoist workspace lookup and worktree listing outside the loop to avoid N+1 calls
  const workspace = getWorkspace(persistentDb, workspaceId);
  if (!workspace) {
    const err: ResponseEnvelope = createError(
      { id: req.id, channel },
      ErrorCodes.WORKSPACE_NOT_FOUND,
      `Workspace not found: ${workspaceId}`,
    );
    conn.send(err);
    return;
  }
  const workspaceCwd = workspace.cwd ?? process.cwd();
  let worktrees: GitWorktreeInfo[] = [];
  try {
    worktrees = await listWorktrees(workspaceCwd);
  } catch {
    // worktree listing is best-effort; fallback to empty array
  }

  const restoredTabs: PersistedTabInfo[] = [];

  for (const ptab of persistedTabs) {
    // Determine next sort order in session DB for this pane
    const maxOrder = sessionDb
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tabs WHERE session_id = ? AND workspace_id = ? AND pane = ? AND worktree_path IS ?',
      )
      .get(conn.sessionId, workspaceId, ptab.pane, ptab.worktree_path ?? null) as {
      max_order: number;
    };
    const order = maxOrder.max_order + 1;

    // Create the tab in the session DB
    const tabId = createTab(sessionDb, {
      sessionId: conn.sessionId,
      workspaceId,
      tabType: ptab.tab_type,
      title: ptab.custom_title ?? ptab.title ?? undefined,
      filePath: ptab.file_path ?? undefined,
      pane: ptab.pane,
      order,
      diffRef: ptab.diff_ref as 'staged' | 'unstaged' | 'commit' | null,
      repoPath: ptab.repo_path ?? undefined,
      commitSha: ptab.commit_sha ?? undefined,
      parentSha: ptab.parent_sha ?? undefined,
      worktreePath: ptab.worktree_path ?? undefined,
    });

    let terminalId: string | null = null;

    // For terminal tabs, check for a reusable live terminal first, then fall
    // back to creating a new PTY. Wrapped in individual try/catch so that a
    // single tab failure does not abort the entire restore loop.
    if (ptab.tab_type === 'terminal') {
      try {
        const candidateCwd = ptab.cwd ?? ptab.worktree_path ?? workspaceCwd;

        const cwdResult = resolveCwdWithWorktreeFallback(workspaceCwd, candidateCwd, worktrees);
        const cwd = cwdResult?.cwd ?? workspaceCwd;

        // Check if the persisted terminal is still alive in ptyManager
        const persistedTerminalId = ptab.terminal_id;
        const isAlive =
          persistedTerminalId &&
          ptyManager.has(persistedTerminalId) &&
          !ptyManager.hasExited(persistedTerminalId);

        let worktreeMatches = true;
        if (isAlive && persistedTerminalId) {
          const wsTerm = getWorkspaceTerminal(sessionDb, persistedTerminalId);
          const termWorktree = (wsTerm?.worktree_path as string | null) ?? null;
          const tabWorktree = ptab.worktree_path ?? null;
          worktreeMatches = termWorktree === tabWorktree;
        }

        if (isAlive && persistedTerminalId && worktreeMatches) {
          // Reuse the existing live terminal — just re-attach callbacks
          createPane(sessionDb, { tabId, terminalId: persistedTerminalId });
          terminalId = persistedTerminalId;

          ptyManager.setOutputTarget(
            persistedTerminalId,
            (b64Data: string) => {
              conn.send(
                createEvent('terminal.output', {
                  terminalId: persistedTerminalId,
                  data: b64Data,
                }),
              );
            },
            (exitCode: number | null) => {
              conn.send(
                createEvent('terminal.exit', {
                  terminalId: persistedTerminalId,
                  exitCode: exitCode ?? 0,
                }),
              );
              deleteWorkspaceTerminal(sessionDb, persistedTerminalId);
            },
          );
        } else {
          // Terminal is dead or never existed — create a new PTY
          const newTerminalId = createTerminalInstance(sessionDb, {
            sessionId: conn.sessionId,
            workspaceId,
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
          });

          try {
            ptyManager.create(newTerminalId, {
              cwd,
              cols: DEFAULT_COLS,
              rows: DEFAULT_ROWS,
              onData: (b64Data: string) => {
                const evt = createEvent('terminal.output', {
                  terminalId: newTerminalId,
                  data: b64Data,
                });
                conn.send(evt);
              },
              onExit: (exitCode) => {
                const evt = createEvent('terminal.exit', {
                  terminalId: newTerminalId,
                  exitCode: exitCode ?? 0,
                });
                conn.send(evt);
                deleteTerminalInstance(sessionDb, newTerminalId);
                deleteWorkspaceTerminal(sessionDb, newTerminalId);
              },
            });

            // Also track as a workspace terminal for liveness checks
            createWorkspaceTerminal(sessionDb, {
              id: newTerminalId,
              workspaceId,
              cwd,
              cols: DEFAULT_COLS,
              rows: DEFAULT_ROWS,
              worktreePath: ptab.worktree_path ?? undefined,
            });
          } catch {
            // If PTY creation fails, clean up the terminal instance but still restore the tab
            deleteTerminalInstance(sessionDb, newTerminalId);
          }

          // Create pane association
          createPane(sessionDb, { tabId, terminalId: newTerminalId });
          terminalId = newTerminalId;
        }
      } catch (tabErr) {
        // Individual tab restore failed — log and continue with remaining tabs
        console.error(`Failed to restore terminal tab ${ptab.id}:`, tabErr);
      }
    }

    // Update the persisted tab with the new ID so future restores use it
    savePersistedTab(persistentDb, {
      id: tabId,
      workspaceId,
      tabType: ptab.tab_type,
      title: ptab.title,
      filePath: ptab.file_path,
      pane: ptab.pane,
      sortOrder: ptab.sort_order,
      diffRef: ptab.diff_ref,
      repoPath: ptab.repo_path,
      commitSha: ptab.commit_sha,
      parentSha: ptab.parent_sha,
      cwd: ptab.cwd,
      customTitle: ptab.custom_title,
      terminalId,
      worktreePath: ptab.worktree_path,
    });

    // Delete old persisted record if ID changed
    if (ptab.id !== tabId) {
      deletePersistedTab(persistentDb, ptab.id);
    }

    restoredTabs.push({
      id: tabId,
      tabType: ptab.tab_type as PersistedTabInfo['tabType'],
      title: ptab.custom_title ?? ptab.title,
      filePath: ptab.file_path,
      pane: ptab.pane,
      sortOrder: ptab.sort_order,
      diffRef: ptab.diff_ref,
      repoPath: ptab.repo_path,
      commitSha: ptab.commit_sha,
      parentSha: ptab.parent_sha,
      cwd: ptab.cwd,
      customTitle: ptab.custom_title,
      terminalId,
      worktreePath: ptab.worktree_path ?? undefined,
    });
  }

  const resp: ResponseEnvelope<TabRestoreResponse> = createResponse(req, { tabs: restoredTabs });
  conn.send(resp);
}
