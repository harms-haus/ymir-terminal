import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { ErrorCodes } from '@ymir/shared';
import { mockConn, createMockSessionDb } from '../test-helpers/mock-utils';
import { safePath, validateTerminalOwnership } from './handler-validation';
import { createSession, createTerminalInstance } from '../db/session';

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
