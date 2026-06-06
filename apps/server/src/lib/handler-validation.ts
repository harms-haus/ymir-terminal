/** Path validation utilities for ensuring file/git operations stay within workspace boundaries. */
import { resolve, relative, isAbsolute } from 'node:path';
import { realpathSync } from 'node:fs';
import {
  ErrorCodes,
  type GitWorktreeInfo,
  type RequestEnvelope,
  type ResponseEnvelope,
} from '@ymir/shared';
import type { ClientConnection } from '../ws/connection';
import { createError } from '../ws/router';
import { type Database, getTerminalInstance, getTab, getWorkspaceTerminal } from '../db/session';

// ---------------------------------------------------------------------------
// Terminal ownership validation
// ---------------------------------------------------------------------------

/**
 * Result of a successful {@link validateTerminalOwnership} call.
 */
export interface TerminalOwnershipResult {
  /** The terminal instance DB row. */
  instance: Record<string, unknown>;
}

/**
 * Validate that a terminal exists and belongs to the requesting session.
 *
 * If validation fails the appropriate error is sent on `conn` and `null` is
 * returned so the caller can early-return.
 */
export function validateTerminalOwnership(
  sessionDb: Database,
  terminalId: string,
  sessionId: string,
  conn: ClientConnection,
  req: Pick<RequestEnvelope, 'id' | 'channel'>,
): TerminalOwnershipResult | null {
  const instance = getTerminalInstance(sessionDb, terminalId);
  if (!instance) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.TERMINAL_NOT_FOUND,
      `Terminal not found: ${terminalId}`,
    );
    conn.send(err);
    return null;
  }

  if (instance.session_id !== sessionId) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.PERMISSION_DENIED,
      'Terminal does not belong to this session',
    );
    conn.send(err);
    return null;
  }

  return { instance };
}

// ---------------------------------------------------------------------------
// Tab ownership validation
// ---------------------------------------------------------------------------

/**
 * Validate that a tab exists and belongs to the requesting session.
 *
 * If validation fails the appropriate error is sent on `conn` and `null` is
 * returned so the caller can early-return.
 */
export function validateTabOwnership(
  sessionDb: Database,
  tabId: string,
  sessionId: string,
  conn: ClientConnection,
  req: Pick<RequestEnvelope, 'id' | 'channel'>,
): Record<string, unknown> | null {
  const tab = getTab(sessionDb, tabId);
  if (!tab) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.TAB_NOT_FOUND,
      `Tab not found: ${tabId}`,
    );
    conn.send(err);
    return null;
  }

  if (tab.session_id !== sessionId) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.PERMISSION_DENIED,
      'Tab does not belong to this session',
    );
    conn.send(err);
    return null;
  }

  return tab;
}

// ---------------------------------------------------------------------------
// Workspace terminal access validation
// ---------------------------------------------------------------------------

/**
 * Result of a successful {@link validateWorkspaceTerminalAccess} call.
 */
export interface WorkspaceTerminalAccessResult {
  /** The workspace_terminal DB row. */
  instance: Record<string, unknown>;
}

/**
 * Validate that a workspace terminal exists.
 *
 * Workspace terminals are shared across connections so no session ownership
 * check is performed. If the terminal is not found an error is sent on
 * `conn` and `null` is returned so the caller can early-return.
 */
export function validateWorkspaceTerminalAccess(
  sessionDb: Database,
  terminalId: string,
  conn: ClientConnection,
  req: Pick<RequestEnvelope, 'id' | 'channel'>,
  expectedWorktreePath?: string | null,
): WorkspaceTerminalAccessResult | null {
  const instance = getWorkspaceTerminal(sessionDb, terminalId);
  if (!instance) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.TERMINAL_NOT_FOUND,
      `Terminal not found: ${terminalId}`,
    );
    conn.send(err);
    return null;
  }

  // Verify the session has access to this terminal's workspace+worktree scope.
  // The connection must belong to a session that has at least one tab whose
  // workspace_id and worktree_path match the terminal's.
  const instanceWorkspaceId = instance.workspace_id as string;
  const instanceWorktreePath = instance.worktree_path as string | null;

  const hasAccess = sessionDb
    .prepare(
      `SELECT 1 FROM tabs
       WHERE session_id = ? AND workspace_id = ?
       AND ((worktree_path = ?) OR (worktree_path IS NULL AND ? IS NULL))
       LIMIT 1`,
    )
    .get(conn.sessionId, instanceWorkspaceId, instanceWorktreePath, instanceWorktreePath);

  if (!hasAccess) {
    const err: ResponseEnvelope = createError(
      req,
      ErrorCodes.PERMISSION_DENIED,
      `Terminal not accessible in this session's workspace/worktree scope`,
    );
    conn.send(err);
    return null;
  }

  // When an expected worktree path is provided, enforce worktree scope.
  // Terminals created in a worktree can only be accessed by tabs/contexts
  // scoped to that same worktree (or to the workspace root when null).
  if (expectedWorktreePath !== undefined) {
    const instanceWorktree = (instance.worktree_path as string | null) ?? null;
    const expected = expectedWorktreePath ?? null;
    if (instanceWorktree !== expected) {
      const err: ResponseEnvelope = createError(
        req,
        ErrorCodes.PERMISSION_DENIED,
        `Terminal worktree mismatch: expected ${expected ?? 'null'}, got ${instanceWorktree ?? 'null'}`,
      );
      conn.send(err);
      return null;
    }
  }

  return { instance };
}

// ---------------------------------------------------------------------------
// Safe-path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a user-supplied path relative to `workspaceCwd`, guarding against
 * path-traversal attacks.
 *
 * @throws {Error} When the resolved path escapes the workspace root.
 */
export function safePath(workspaceCwd: string, userInput: string): string {
  const resolved = resolve(workspaceCwd, userInput);
  const normalizedCwd = resolve(workspaceCwd);

  try {
    const realResolved = realpathSync(resolved);
    const realCwd = realpathSync(normalizedCwd);
    const rel = relative(realCwd, realResolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('Path traversal detected');
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'Path traversal detected') throw e;
    const rel = relative(normalizedCwd, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('Path traversal detected');
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Cwd resolution with worktree fallback
// ---------------------------------------------------------------------------

/**
 * Attempt to resolve a candidate cwd within the workspace, falling back to
 * known git worktrees when the path is outside the workspace root.
 *
 * When the candidate resolves inside the workspace via {@link safePath}, this
 * also checks whether the resolved path matches a known worktree so callers
 * can store the correct `worktree_path`.
 *
 * @returns A result with the resolved `cwd` and an optional `worktreePath`
 *   when the cwd matched a known worktree, or `null` when the path is
 *   neither inside the workspace nor a known worktree.
 */
export function resolveCwdWithWorktreeFallback(
  workspaceCwd: string,
  candidateCwd: string,
  worktrees: GitWorktreeInfo[],
): { cwd: string; worktreePath: string | undefined } | null {
  // Try resolving within the workspace first
  try {
    const cwd = safePath(workspaceCwd, candidateCwd);
    // Even when safePath succeeds the cwd might be a known worktree that
    // lives inside the workspace root. Detect that so callers can store the
    // correct worktree_path.
    const normalizedWorkspaceCwd = resolve(workspaceCwd);
    let worktreePath: string | undefined;
    if (cwd !== normalizedWorkspaceCwd) {
      if (worktrees.some((w) => resolve(w.path) === cwd)) {
        worktreePath = cwd;
      }
    }
    return { cwd, worktreePath };
  } catch {
    // Not within the workspace — check if it's a known git worktree
    const resolvedCandidate = resolve(candidateCwd);
    if (worktrees.some((w) => resolve(w.path) === resolvedCandidate)) {
      return { cwd: resolvedCandidate, worktreePath: resolvedCandidate };
    }
    return null;
  }
}
