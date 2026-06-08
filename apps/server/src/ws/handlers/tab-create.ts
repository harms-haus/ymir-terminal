import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type TabCreateResponse,
  TabCreateRequestSchema,
  validatePayload,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import { createError, createResponse } from '../router';
import { createTab, createPane } from '../../db/session';
import { getWorkspace, savePersistedTab } from '../../db/persistent';
import { safePath } from '../../lib/handler-validation';
import type { TabDeps } from './tabs';

// ---------------------------------------------------------------------------
// tab.create handler
// ---------------------------------------------------------------------------

export async function handleTabCreate(
  deps: TabDeps,
  conn: ClientConnection,
  envelope: MessageEnvelope,
): Promise<void> {
  const { sessionDb, persistentDb } = deps;
  const req = envelope as RequestEnvelope;
  const channel = req.channel ?? 'tab.create';

  let payload;
  try {
    payload = validatePayload(TabCreateRequestSchema, req.payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payload validation failed';
    conn.send(createError({ id: req.id, channel }, ErrorCodes.INVALID_MESSAGE, message));
    return;
  }

  // Validate filePath against path traversal if provided
  if (payload.filePath != null && (payload.tabType === 'editor' || payload.tabType === 'diff')) {
    const workspace = getWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel },
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
        { id: req.id, channel },
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
}
