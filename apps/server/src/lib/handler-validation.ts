import { resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import { ErrorCodes, type RequestEnvelope, type ResponseEnvelope } from '@ymir/shared';
import type { ClientConnection } from '../ws/connection';
import type { Database } from '../db/session';
import { createError } from '../ws/router';
import { getTerminalInstance, getTab } from '../db/session';

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
 * Result of a successful {@link validateTabOwnership} call.
 */
export interface TabOwnershipResult {
  /** The tab DB row. */
  tab: Record<string, unknown>;
}

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
    if (!realResolved.startsWith(realCwd + sep) && realResolved !== realCwd) {
      throw new Error('Path traversal detected');
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'Path traversal detected') throw e;
    if (!resolved.startsWith(normalizedCwd + sep) && resolved !== normalizedCwd) {
      throw new Error('Path traversal detected');
    }
  }

  return resolved;
}
