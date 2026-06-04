import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type TabListRequest,
  type TabListResponse,
  type TabCreateRequest,
  type TabCreateResponse,
  type TabUpdateRequest,
  type TabDeleteRequest,
  type TabReorderRequest,
  type TabRestoreRequest,
  type TabRestoreResponse,
  type TabInfo,
  type PersistedTabInfo,
  DEFAULT_COLS,
  DEFAULT_ROWS,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import { createError, createResponse, createEvent, type MessageRouter } from '../router';
import {
  type Database,
  createTab,
  updateTab,
  deleteTab,
  reorderTabs,
  setActiveTab,
  createPane,
  createTerminalInstance,
  deleteTerminalInstance,
} from '../../db/session';
import {
  getWorkspace,
  savePersistedTab,
  deletePersistedTab,
  updatePersistedTabOrder,
  updatePersistedTabTitle,
  listPersistedTabsByWorkspace,
} from '../../db/persistent';
import { resolve } from 'node:path';
import { validateTabOwnership, safePath } from '../../lib/handler-validation';
import { listWorktrees } from '../../git/worktrees';
import type { PTYManager } from '../../pty/manager';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface TabDeps {
  sessionDb: Database;
  persistentDb: Database;
  ptyManager: PTYManager;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerTabHandlers(router: MessageRouter, deps: TabDeps): void {
  const { sessionDb, persistentDb, ptyManager } = deps;

  // --- tab.list -----------------------------------------------------------
  router.handle('tab.list', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TabListRequest>;
    const payload = req.payload;

    const workspaceId = payload?.workspaceId;
    if (!workspaceId || typeof workspaceId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'tab.list' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid workspaceId',
      );
      conn.send(err);
      return;
    }

    // JOIN with panes to get terminal_id (tabs table doesn't have it)
    const pane = payload?.pane;
    const worktreePath = payload?.worktreePath;

    let query =
      'SELECT t.*, p.terminal_id FROM tabs t LEFT JOIN panes p ON p.tab_id = t.id WHERE t.session_id = ? AND t.workspace_id = ?';
    const queryParams: (string | number)[] = [conn.sessionId, workspaceId];

    if (pane) {
      query += ' AND t.pane = ?';
      queryParams.push(pane);
    }

    if (worktreePath !== undefined && worktreePath !== null) {
      query += ' AND t.worktree_path = ?';
      queryParams.push(worktreePath);
    } else {
      query += ' AND t.worktree_path IS NULL';
    }

    query += ' ORDER BY t.sort_order ASC';
    const rows = sessionDb.prepare(query).all(...queryParams) as Record<string, unknown>[];

    // Batch-check terminal liveness (avoids N+1 per-row queries)
    const terminalIds = rows.map((r) => r.terminal_id as string | null).filter(Boolean) as string[];

    const aliveSet = new Set<string>();
    if (terminalIds.length > 0) {
      const placeholders = terminalIds.map(() => '?').join(',');
      const aliveRows = sessionDb
        .prepare(`SELECT id FROM terminal_instances WHERE id IN (${placeholders})`)
        .all(...terminalIds) as { id: string }[];
      for (const r of aliveRows) aliveSet.add(r.id);
    }

    const tabs: TabInfo[] = rows.map((row) => {
      const terminalId = (row.terminal_id as string | null) ?? null;
      const terminalAlive = terminalId ? aliveSet.has(terminalId) : undefined;

      return {
        id: row.id as string,
        tabType: row.tab_type as 'terminal' | 'editor' | 'diff' | 'git-tree',
        title: (row.title as string | null) ?? null,
        filePath: (row.file_path as string | null) ?? null,
        terminalId,
        active: !!row.active,
        sortOrder: row.sort_order as number,
        ...(terminalAlive !== undefined ? { terminalAlive } : {}),
        worktreePath: (row.worktree_path as string | null) ?? undefined,
        diffRef: (row.diff_ref as 'staged' | 'unstaged' | 'commit' | null) ?? undefined,
        repoPath: (row.repo_path as string | null) ?? undefined,
        commitSha: (row.commit_sha as string | null) ?? undefined,
        parentSha: (row.parent_sha as string | null) ?? undefined,
      };
    });

    const resp: ResponseEnvelope<TabListResponse> = createResponse(req, { tabs });
    conn.send(resp);
  });

  // --- tab.create ---------------------------------------------------------
  router.handle('tab.create', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TabCreateRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.tabType !== 'string' ||
      !['terminal', 'editor', 'diff', 'git-tree'].includes(payload.tabType) ||
      typeof payload.title !== 'string' ||
      typeof payload.pane !== 'string'
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'tab.create' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required fields: workspaceId, tabType, title, pane',
      );
      conn.send(err);
      return;
    }

    // Validate filePath against path traversal if provided
    if (
      payload.filePath != null &&
      typeof payload.filePath === 'string' &&
      (payload.tabType === 'editor' || payload.tabType === 'diff')
    ) {
      const workspace = getWorkspace(persistentDb, payload.workspaceId);
      if (!workspace) {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel: req.channel ?? 'tab.create' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        );
        conn.send(err);
        return;
      }
      try {
        safePath(workspace.cwd, payload.filePath);
      } catch {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel: req.channel ?? 'tab.create' },
          ErrorCodes.INVALID_MESSAGE,
          'Invalid filePath: path traversal detected',
        );
        conn.send(err);
        return;
      }
    }

    // Validate additional path fields against the workspace
    const ws = getWorkspace(persistentDb, payload.workspaceId);
    const workspaceCwd = ws?.cwd ?? process.cwd();

    let validatedWorktreePath: string | undefined = payload.worktreePath ?? undefined;
    if (validatedWorktreePath != null && typeof validatedWorktreePath === 'string') {
      try {
        validatedWorktreePath = safePath(workspaceCwd, validatedWorktreePath);
      } catch {
        validatedWorktreePath = undefined;
      }
    }

    let validatedCwd: string | undefined = payload.cwd ?? undefined;
    if (validatedCwd != null && typeof validatedCwd === 'string') {
      try {
        validatedCwd = safePath(workspaceCwd, validatedCwd);
      } catch {
        validatedCwd = undefined;
      }
    }

    const rawRepoPath: string | undefined = payload.diffRepoPath ?? payload.repoPath ?? undefined;
    let validatedRepoPath = rawRepoPath;
    if (validatedRepoPath != null && typeof validatedRepoPath === 'string') {
      try {
        validatedRepoPath = safePath(workspaceCwd, validatedRepoPath);
      } catch {
        validatedRepoPath = undefined;
      }
    }

    // Determine next sort order
    const maxOrder = sessionDb
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tabs WHERE session_id = ? AND workspace_id = ? AND pane = ? AND worktree_path IS ?',
      )
      .get(conn.sessionId, payload.workspaceId, payload.pane, validatedWorktreePath ?? null) as {
      max_order: number;
    };
    const order = maxOrder.max_order + 1;

    const tabId = createTab(sessionDb, {
      sessionId: conn.sessionId,
      workspaceId: payload.workspaceId,
      tabType: payload.tabType,
      title: payload.title,
      filePath: payload.filePath,
      pane: payload.pane,
      order,
      diffRef: payload.diffRef,
      repoPath: validatedRepoPath,
      commitSha: payload.commitSha,
      parentSha: payload.parentSha,
      worktreePath: validatedWorktreePath,
    });

    // Create pane association if terminalId is provided
    if (payload.terminalId) {
      createPane(sessionDb, { tabId, terminalId: payload.terminalId });
    }

    // Persist to persistent DB for server restart restoration
    savePersistedTab(persistentDb, {
      id: tabId,
      workspaceId: payload.workspaceId,
      tabType: payload.tabType,
      title: payload.title,
      filePath: payload.filePath,
      pane: payload.pane,
      sortOrder: order,
      diffRef: payload.diffRef,
      repoPath: validatedRepoPath,
      commitSha: payload.commitSha,
      parentSha: payload.parentSha,
      cwd: validatedCwd,
      customTitle: payload.customTitle,
      worktreePath: validatedWorktreePath,
    });

    const resp: ResponseEnvelope<TabCreateResponse> = createResponse(req, { tabId });
    conn.send(resp);
  });

  // --- tab.update ---------------------------------------------------------
  router.handle('tab.update', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TabUpdateRequest>;
    const payload = req.payload;

    if (payload == null || typeof payload !== 'object' || typeof payload.tabId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'tab.update' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: tabId',
      );
      conn.send(err);
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
  });

  // --- tab.delete ---------------------------------------------------------
  router.handle('tab.delete', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TabDeleteRequest>;
    const payload = req.payload;

    if (payload == null || typeof payload !== 'object' || typeof payload.tabId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'tab.delete' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: tabId',
      );
      conn.send(err);
      return;
    }

    if (!validateTabOwnership(sessionDb, payload.tabId, conn.sessionId, conn, req)) {
      return;
    }

    deleteTab(sessionDb, payload.tabId);
    deletePersistedTab(persistentDb, payload.tabId);

    const resp: ResponseEnvelope = createResponse(req, null);
    conn.send(resp);
  });

  // --- tab.reorder --------------------------------------------------------
  router.handle('tab.reorder', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TabReorderRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      !Array.isArray(payload.tabIds) ||
      payload.tabIds.length === 0 ||
      !payload.tabIds.every((id: unknown) => typeof id === 'string')
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'tab.reorder' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing or invalid tabIds',
      );
      conn.send(err);
      return;
    }

    // Batch-validate ownership of all tabs in a single query (avoids N+1)
    const tabIds = payload.tabIds as string[];
    const placeholders = tabIds.map(() => '?').join(',');
    const rows = sessionDb
      .prepare(`SELECT id, workspace_id, session_id FROM tabs WHERE id IN (${placeholders})`)
      .all(...tabIds) as { id: string; workspace_id: string; session_id: string }[];

    if (rows.length !== tabIds.length) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'tab.reorder' },
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
          { id: req.id, channel: req.channel ?? 'tab.reorder' },
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
  });

  // --- tab.restore --------------------------------------------------------
  router.handle('tab.restore', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<TabRestoreRequest>;
    const payload = req.payload;

    if (payload == null || typeof payload !== 'object' || typeof payload.workspaceId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'tab.restore' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: workspaceId',
      );
      conn.send(err);
      return;
    }

    const workspaceId = payload.workspaceId;
    const worktreePath = payload?.worktreePath;
    const persistedTabs = listPersistedTabsByWorkspace(persistentDb, workspaceId, worktreePath);

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

      // For terminal tabs, create a new PTY
      if (ptab.tab_type === 'terminal') {
        const workspace = getWorkspace(persistentDb, workspaceId);
        const workspaceCwd = workspace?.cwd ?? process.cwd();
        const candidateCwd = ptab.cwd ?? ptab.worktree_path ?? workspaceCwd;

        let cwd: string;
        try {
          cwd = safePath(workspaceCwd, candidateCwd);
        } catch {
          // Not within workspace — check if it's a known git worktree
          try {
            const resolvedCandidate = resolve(candidateCwd);
            const worktrees = await listWorktrees(workspaceCwd);
            const isKnownWorktree = worktrees.some((w) => resolve(w.path) === resolvedCandidate);
            if (isKnownWorktree) {
              cwd = resolvedCandidate;
            } else {
              cwd = workspaceCwd;
            }
          } catch {
            cwd = workspaceCwd;
          }
        }

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
            onData: (data: string) => {
              const evt = createEvent('terminal.output', {
                terminalId: newTerminalId,
                data,
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
            },
          });
        } catch {
          // If PTY creation fails, clean up the terminal instance but still restore the tab
          deleteTerminalInstance(sessionDb, newTerminalId);
        }

        // Create pane association
        createPane(sessionDb, { tabId, terminalId: newTerminalId });
        terminalId = newTerminalId;
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
  });
}
