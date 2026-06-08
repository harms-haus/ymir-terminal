import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type TabListResponse,
  type TabInfo,
  TabListRequestSchema,
  validatePayload,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import { createError, createResponse, type MessageRouter } from '../router';
import type { Database } from '../../db/session';
import type { PTYManager } from '../../pty/manager';
import { handleTabCreate } from './tab-create';
import { handleTabUpdate, handleTabDelete, handleTabReorder, handleTabRestore } from './tab-crud';

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
  const { sessionDb, ptyManager } = deps;

  // --- tab.list -----------------------------------------------------------
  router.handle('tab.list', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope;
    const channel = req.channel ?? 'tab.list';

    let payload;
    try {
      payload = validatePayload(TabListRequestSchema, req.payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Payload validation failed';
      conn.send(createError({ id: req.id, channel }, ErrorCodes.INVALID_MESSAGE, message));
      return;
    }

    const workspaceId = payload.workspaceId;

    // JOIN with panes to get terminal_id (tabs table doesn't have it)
    const pane = payload.pane;
    const worktreePath = payload.worktreePath;

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

    const tabs: TabInfo[] = rows.map((row) => {
      const terminalId = (row.terminal_id as string | null) ?? null;
      const terminalAlive = terminalId
        ? ptyManager.has(terminalId) && !ptyManager.hasExited(terminalId)
        : undefined;

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
  router.handle('tab.create', (conn, envelope) => handleTabCreate(deps, conn, envelope));

  // --- tab.update ---------------------------------------------------------
  router.handle('tab.update', (conn, envelope) => handleTabUpdate(deps, conn, envelope));

  // --- tab.delete ---------------------------------------------------------
  router.handle('tab.delete', (conn, envelope) => handleTabDelete(deps, conn, envelope));

  // --- tab.reorder --------------------------------------------------------
  router.handle('tab.reorder', (conn, envelope) => handleTabReorder(deps, conn, envelope));

  // --- tab.restore --------------------------------------------------------
  router.handle('tab.restore', (conn, envelope) => handleTabRestore(deps, conn, envelope));
}
