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
  type ServerTabInfo,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import { createError, createResponse, type MessageRouter } from '../router';
import {
  type Database,
  createTab,
  updateTab,
  deleteTab,
  reorderTabs,
  setActiveTab,
  createPane,
} from '../../db/session';
import { getWorkspace } from '../../db/persistent';
import { validateTabOwnership, safePath } from '../../lib/handler-validation';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface TabDeps {
  sessionDb: Database;
  persistentDb: Database;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerTabHandlers(router: MessageRouter, deps: TabDeps): void {
  const { sessionDb, persistentDb } = deps;

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
    let rows: Record<string, unknown>[];
    if (pane && (pane === 'content' || pane === 'bottom')) {
      const stmt = sessionDb.prepare(
        'SELECT t.*, p.terminal_id FROM tabs t LEFT JOIN panes p ON p.tab_id = t.id WHERE t.session_id = ? AND t.workspace_id = ? AND t.pane = ? ORDER BY t.sort_order ASC',
      );
      rows = stmt.all(conn.sessionId, workspaceId, pane) as Record<string, unknown>[];
    } else {
      const stmt = sessionDb.prepare(
        'SELECT t.*, p.terminal_id FROM tabs t LEFT JOIN panes p ON p.tab_id = t.id WHERE t.session_id = ? AND t.workspace_id = ? ORDER BY t.sort_order ASC',
      );
      rows = stmt.all(conn.sessionId, workspaceId) as Record<string, unknown>[];
    }

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

    const tabs: ServerTabInfo[] = rows.map((row) => {
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
      typeof payload.pane !== 'string' ||
      !['content', 'bottom'].includes(payload.pane)
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

    // Determine next sort order
    const maxOrder = sessionDb
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tabs WHERE session_id = ? AND workspace_id = ? AND pane = ?',
      )
      .get(conn.sessionId, payload.workspaceId, payload.pane) as {
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
      repoPath: payload.diffRepoPath ?? payload.repoPath,
      commitSha: payload.commitSha,
      parentSha: payload.parentSha,
    });

    // Create pane association if terminalId is provided
    if (payload.terminalId) {
      createPane(sessionDb, { tabId, terminalId: payload.terminalId });
    }

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

    const resp: ResponseEnvelope = createResponse(req, null);
    conn.send(resp);
  });
}
