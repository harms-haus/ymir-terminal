import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { ErrorCodes } from '@ymir/shared';
import { mockConn, createMockSessionDb } from '../test-helpers/mock-utils';
import {
  safePath,
  validateTerminalOwnership,
  validateWorkspaceTerminalAccess,
} from './handler-validation';
import {
  createSession,
  createTerminalInstance,
  createWorkspaceTerminal,
  createTab,
} from '../db/session';

// ---------------------------------------------------------------------------
// safePath
// ---------------------------------------------------------------------------

describe('safePath', () => {
  it('resolves a normal relative path', () => {
    const result = safePath('/workspace', 'src/file.ts');
    expect(result).toBe(resolve('/workspace/src/file.ts'));
  });

  it('throws on path traversal', () => {
    expect(() => safePath('/workspace', '../../etc/passwd')).toThrow('Path traversal detected');
  });

  it('throws on absolute path outside workspace', () => {
    expect(() => safePath('/workspace', '/etc/passwd')).toThrow('Path traversal detected');
  });

  it('resolves workspace root (".") correctly', () => {
    const result = safePath('/workspace', '.');
    expect(result).toBe(resolve('/workspace'));
  });

  it('resolves a deeply nested valid path', () => {
    const result = safePath('/workspace', 'a/b/c/d/e.ts');
    expect(result).toBe(resolve('/workspace/a/b/c/d/e.ts'));
  });
});

// ---------------------------------------------------------------------------
// safePath edge cases
// ---------------------------------------------------------------------------

describe('safePath edge cases', () => {
  it('resolves a deeper normal relative path', () => {
    const result = safePath('/workspace', 'src/deep/file.ts');
    expect(result).toBe(resolve('/workspace/src/deep/file.ts'));
  });

  it('resolves nested traversal that normalizes back inside workspace', () => {
    // resolve('/workspace', 'a/../b') → '/workspace/b' which is still inside
    const result = safePath('/workspace', 'a/../b');
    expect(result).toBe(resolve('/workspace/b'));
  });

  it('throws when traversal overshoots (a/../../b escapes to /b)', () => {
    expect(() => safePath('/workspace', 'a/../../b')).toThrow('Path traversal detected');
  });

  it('resolves explicit relative prefix ("./file")', () => {
    const result = safePath('/workspace', './file');
    expect(result).toBe(resolve('/workspace/file'));
  });

  it('resolves explicit relative prefix with deeper nesting', () => {
    const result = safePath('/workspace', './src/utils/helpers.ts');
    expect(result).toBe(resolve('/workspace/src/utils/helpers.ts'));
  });

  it('throws on single parent traversal ("..")', () => {
    expect(() => safePath('/workspace', '..')).toThrow('Path traversal detected');
  });

  it('throws on triple parent traversal', () => {
    expect(() => safePath('/workspace', '../../../etc/passwd')).toThrow('Path traversal detected');
  });

  it('throws when traversal is embedded mid-path', () => {
    expect(() => safePath('/workspace', 'src/../../../etc/passwd')).toThrow(
      'Path traversal detected',
    );
  });
});

// ---------------------------------------------------------------------------
// validateTerminalOwnership
// ---------------------------------------------------------------------------

describe('validateTerminalOwnership', () => {
  const req = { id: 'req-1', channel: 'terminal.test' } as const;

  it('returns instance for a valid terminal owned by the session', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    const terminalId = createTerminalInstance(db, {
      sessionId,
      workspaceId: 'ws-1',
      cols: 80,
      rows: 24,
    });
    const conn = mockConn({ sessionId });

    const result = validateTerminalOwnership(db, terminalId, sessionId, conn, req);

    expect(result).not.toBeNull();
    expect(result!.instance).toBeDefined();
    expect((result!.instance as Record<string, unknown>).id).toBe(terminalId);
  });

  it('returns null and sends error for a non-existent terminal', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    const conn = mockConn({ sessionId });

    const result = validateTerminalOwnership(db, crypto.randomUUID(), sessionId, conn, req);

    expect(result).toBeNull();
    expect(conn.sent).toHaveLength(1);
    const err = conn.sent[0] as { error?: { code?: string } };
    expect(err.error?.code).toBe(ErrorCodes.TERMINAL_NOT_FOUND);
  });

  it('returns null and sends error when terminal belongs to a different session', () => {
    const db = createMockSessionDb();
    const sessionA = createSession(db);
    const sessionB = createSession(db);

    const terminalId = createTerminalInstance(db, {
      sessionId: sessionA,
      workspaceId: 'ws-1',
      cols: 80,
      rows: 24,
    });

    const conn = mockConn({ sessionId: sessionB });

    const result = validateTerminalOwnership(db, terminalId, sessionB, conn, req);

    expect(result).toBeNull();
    expect(conn.sent).toHaveLength(1);
    const err = conn.sent[0] as { error?: { code?: string } };
    expect(err.error?.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });
});

// ---------------------------------------------------------------------------
// validateWorkspaceTerminalAccess
// ---------------------------------------------------------------------------

describe('validateWorkspaceTerminalAccess', () => {
  const req = { id: 'req-1', channel: 'terminal.test' } as const;

  it('returns instance for an existing workspace terminal', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project',
      cols: 120,
      rows: 40,
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req);

    expect(result).not.toBeNull();
    expect(result!.instance).toBeDefined();
    expect((result!.instance as Record<string, unknown>).id).toBe(terminalId);
    expect(conn.sent).toHaveLength(0);
  });

  it('returns null and sends TERMINAL_NOT_FOUND for a non-existent terminal', () => {
    const db = createMockSessionDb();
    const conn = mockConn();

    const result = validateWorkspaceTerminalAccess(db, crypto.randomUUID(), conn, req);

    expect(result).toBeNull();
    expect(conn.sent).toHaveLength(1);
    const err = conn.sent[0] as { error?: { code?: string } };
    expect(err.error?.code).toBe(ErrorCodes.TERMINAL_NOT_FOUND);
  });

  it('allows access from connections whose sessions have a matching tab', () => {
    const db = createMockSessionDb();
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project',
      cols: 80,
      rows: 24,
    });

    // Two different sessions, each with a tab in the same workspace
    const sessionA = createSession(db);
    const sessionB = createSession(db);
    createTab(db, {
      sessionId: sessionA,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
    });
    createTab(db, {
      sessionId: sessionB,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
    });

    const connA = mockConn({ sessionId: sessionA });
    const connB = mockConn({ sessionId: sessionB });

    const resultA = validateWorkspaceTerminalAccess(db, terminalId, connA, req);
    const resultB = validateWorkspaceTerminalAccess(db, terminalId, connB, req);

    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();
    expect(connA.sent).toHaveLength(0);
    expect(connB.sent).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Worktree scope validation
  // -------------------------------------------------------------------------

  it('returns instance when worktree_path matches expectedWorktreePath', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
      worktreePath: '/feature',
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project/worktrees/feature',
      cols: 80,
      rows: 24,
      worktreePath: '/feature',
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req, '/feature');

    expect(result).not.toBeNull();
    expect(result!.instance).toBeDefined();
    expect((result!.instance as Record<string, unknown>).id).toBe(terminalId);
    expect(conn.sent).toHaveLength(0);
  });

  it('sends PERMISSION_DENIED when worktree_path does not match expectedWorktreePath', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    // Create a tab matching the terminal's actual worktree so the session scope
    // check passes; the denial should come from expectedWorktreePath mismatch.
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
      worktreePath: '/feature',
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project/worktrees/feature',
      cols: 80,
      rows: 24,
      worktreePath: '/feature',
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req, '/other');

    expect(result).toBeNull();
    expect(conn.sent).toHaveLength(1);
    const err = conn.sent[0] as { error?: { code?: string } };
    expect(err.error?.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  it('returns instance when expectedWorktreePath is null and terminal has NULL worktree_path', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
    });
    const terminalId = crypto.randomUUID();
    // Create without worktreePath — worktree_path column defaults to NULL
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project',
      cols: 80,
      rows: 24,
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req, null);

    expect(result).not.toBeNull();
    expect(result!.instance).toBeDefined();
    expect((result!.instance as Record<string, unknown>).id).toBe(terminalId);
    expect(conn.sent).toHaveLength(0);
  });

  it('sends PERMISSION_DENIED when expectedWorktreePath is null but terminal has a worktree_path', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    // Tab in the terminal's actual worktree so session scope check passes;
    // denial should come from expectedWorktreePath=null mismatch.
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
      worktreePath: '/feature',
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project/worktrees/feature',
      cols: 80,
      rows: 24,
      worktreePath: '/feature',
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req, null);

    expect(result).toBeNull();
    expect(conn.sent).toHaveLength(1);
    const err = conn.sent[0] as { error?: { code?: string } };
    expect(err.error?.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  it('skips expectedWorktreePath check when not provided (backward compatible)', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
      worktreePath: '/feature',
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project/worktrees/feature',
      cols: 80,
      rows: 24,
      worktreePath: '/feature',
    });
    const conn = mockConn({ sessionId });

    // Call without the expectedWorktreePath parameter (existing 4-param signature)
    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req);

    expect(result).not.toBeNull();
    expect(result!.instance).toBeDefined();
    expect((result!.instance as Record<string, unknown>).id).toBe(terminalId);
    expect(conn.sent).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Session scope validation (workspace+worktree access via tabs)
  // -----------------------------------------------------------------------

  it("sends PERMISSION_DENIED when session has no tabs in terminal's workspace", () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    // Session has NO tabs at all
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project',
      cols: 80,
      rows: 24,
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req);

    expect(result).toBeNull();
    expect(conn.sent).toHaveLength(1);
    const err = conn.sent[0] as { error?: { code?: string } };
    expect(err.error?.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  it('sends PERMISSION_DENIED when session has tabs only in a different workspace', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    createTab(db, {
      sessionId,
      workspaceId: 'ws-other',
      tabType: 'terminal',
      order: 0,
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project',
      cols: 80,
      rows: 24,
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req);

    expect(result).toBeNull();
    expect(conn.sent).toHaveLength(1);
    const err = conn.sent[0] as { error?: { code?: string } };
    expect(err.error?.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  it('returns instance when session has tab in same workspace and worktree', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
      worktreePath: '/feature',
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project/worktrees/feature',
      cols: 80,
      rows: 24,
      worktreePath: '/feature',
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req);

    expect(result).not.toBeNull();
    expect(result!.instance).toBeDefined();
    expect((result!.instance as Record<string, unknown>).id).toBe(terminalId);
    expect(conn.sent).toHaveLength(0);
  });

  it('sends PERMISSION_DENIED when session has tab in same workspace but different worktree', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
      worktreePath: '/other',
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project/worktrees/feature',
      cols: 80,
      rows: 24,
      worktreePath: '/feature',
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req);

    expect(result).toBeNull();
    expect(conn.sent).toHaveLength(1);
    const err = conn.sent[0] as { error?: { code?: string } };
    expect(err.error?.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  it('returns instance when session has tab in same workspace with null worktree and terminal has null worktree', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
      // No worktreePath → NULL
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project',
      cols: 80,
      rows: 24,
      // No worktreePath → NULL
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req);

    expect(result).not.toBeNull();
    expect(result!.instance).toBeDefined();
    expect((result!.instance as Record<string, unknown>).id).toBe(terminalId);
    expect(conn.sent).toHaveLength(0);
  });

  it('sends PERMISSION_DENIED when session tab has null worktree but terminal has a worktree', () => {
    const db = createMockSessionDb();
    const sessionId = createSession(db);
    createTab(db, {
      sessionId,
      workspaceId: 'ws-1',
      tabType: 'terminal',
      order: 0,
      // No worktreePath → NULL
    });
    const terminalId = crypto.randomUUID();
    createWorkspaceTerminal(db, {
      id: terminalId,
      workspaceId: 'ws-1',
      cwd: '/home/dev/project/worktrees/feature',
      cols: 80,
      rows: 24,
      worktreePath: '/feature',
    });
    const conn = mockConn({ sessionId });

    const result = validateWorkspaceTerminalAccess(db, terminalId, conn, req);

    expect(result).toBeNull();
    expect(conn.sent).toHaveLength(1);
    const err = conn.sent[0] as { error?: { code?: string } };
    expect(err.error?.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });
});
