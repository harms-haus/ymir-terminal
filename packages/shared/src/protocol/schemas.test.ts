import { describe, expect, it } from 'bun:test';
import {
  AuthRequestSchema,
  GitStageRequestSchema,
  GitCommitRequestSchema,
  TabCreateRequestSchema,
  FileWriteRequestSchema,
  validatePayload,
} from './schemas';

// ---------------------------------------------------------------------------
// AuthRequestSchema
// ---------------------------------------------------------------------------

describe('AuthRequestSchema', () => {
  it('accepts a valid AuthRequest', () => {
    const result = AuthRequestSchema.parse({ password: 'secret' });
    expect(result).toEqual({ password: 'secret' });
  });

  it('rejects missing password', () => {
    expect(() => AuthRequestSchema.parse({})).toThrow();
  });

  it('rejects non-string password', () => {
    expect(() => AuthRequestSchema.parse({ password: 123 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// GitStageRequestSchema
// ---------------------------------------------------------------------------

describe('GitStageRequestSchema', () => {
  it('accepts a valid GitStageRequest', () => {
    const result = GitStageRequestSchema.parse({
      workspaceId: 'ws-1',
      repoPath: '.',
      files: ['a.ts', 'b.ts'],
    });
    expect(result).toEqual({
      workspaceId: 'ws-1',
      repoPath: '.',
      files: ['a.ts', 'b.ts'],
    });
  });

  it('rejects empty files array', () => {
    expect(() =>
      GitStageRequestSchema.parse({
        workspaceId: 'ws-1',
        repoPath: '.',
        files: [],
      }),
    ).toThrow();
  });

  it('rejects empty string in files', () => {
    expect(() =>
      GitStageRequestSchema.parse({
        workspaceId: 'ws-1',
        repoPath: '.',
        files: [''],
      }),
    ).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => GitStageRequestSchema.parse({ workspaceId: 'ws-1' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// GitCommitRequestSchema
// ---------------------------------------------------------------------------

describe('GitCommitRequestSchema', () => {
  it('accepts a valid GitCommitRequest', () => {
    const result = GitCommitRequestSchema.parse({
      workspaceId: 'ws-1',
      repoPath: '.',
      message: 'fix: correct typo',
    });
    expect(result).toEqual({
      workspaceId: 'ws-1',
      repoPath: '.',
      message: 'fix: correct typo',
    });
  });

  it('trims and rejects whitespace-only message', () => {
    expect(() =>
      GitCommitRequestSchema.parse({
        workspaceId: 'ws-1',
        repoPath: '.',
        message: '   ',
      }),
    ).toThrow();
  });

  it('rejects empty message', () => {
    expect(() =>
      GitCommitRequestSchema.parse({
        workspaceId: 'ws-1',
        repoPath: '.',
        message: '',
      }),
    ).toThrow();
  });

  it('trims valid message', () => {
    const result = GitCommitRequestSchema.parse({
      workspaceId: 'ws-1',
      repoPath: '.',
      message: '  hello  ',
    });
    expect(result.message).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// TabCreateRequestSchema
// ---------------------------------------------------------------------------

describe('TabCreateRequestSchema', () => {
  it('accepts a minimal valid TabCreateRequest', () => {
    const result = TabCreateRequestSchema.parse({
      workspaceId: 'ws-1',
      pane: 'content',
      tabType: 'terminal',
      title: 'My Tab',
    });
    expect(result).toEqual({
      workspaceId: 'ws-1',
      pane: 'content',
      tabType: 'terminal',
      title: 'My Tab',
    });
  });

  it('accepts a full TabCreateRequest with optional fields', () => {
    const result = TabCreateRequestSchema.parse({
      workspaceId: 'ws-1',
      pane: 'sidebar',
      tabType: 'editor',
      title: 'Editor',
      filePath: '/src/index.ts',
      cwd: '/home/user',
      customTitle: 'Custom',
      worktreePath: null,
    });
    expect(result.filePath).toBe('/src/index.ts');
    expect(result.worktreePath).toBeNull();
  });

  it('rejects invalid tabType', () => {
    expect(() =>
      TabCreateRequestSchema.parse({
        workspaceId: 'ws-1',
        pane: 'content',
        tabType: 'invalid',
        title: 'Tab',
      }),
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() =>
      TabCreateRequestSchema.parse({
        workspaceId: 'ws-1',
        pane: 'content',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// FileWriteRequestSchema
// ---------------------------------------------------------------------------

describe('FileWriteRequestSchema', () => {
  it('accepts a valid FileWriteRequest', () => {
    const result = FileWriteRequestSchema.parse({
      workspaceId: 'ws-1',
      path: '/src/index.ts',
      content: 'console.log("hello")',
    });
    expect(result).toEqual({
      workspaceId: 'ws-1',
      path: '/src/index.ts',
      content: 'console.log("hello")',
    });
  });

  it('rejects missing fields', () => {
    expect(() => FileWriteRequestSchema.parse({ workspaceId: 'ws-1', path: '/a' })).toThrow();
  });

  it('rejects non-string content', () => {
    expect(() =>
      FileWriteRequestSchema.parse({
        workspaceId: 'ws-1',
        path: '/a',
        content: 42,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// validatePayload utility
// ---------------------------------------------------------------------------

describe('validatePayload', () => {
  it('returns typed data on success', () => {
    const result = validatePayload(AuthRequestSchema, { password: 'abc' });
    expect(result).toEqual({ password: 'abc' });
  });

  it('throws with formatted error message on failure', () => {
    try {
      validatePayload(GitStageRequestSchema, { workspaceId: 'ws-1', files: [] });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Payload validation failed');
    }
  });

  it('includes field paths in error message', () => {
    try {
      validatePayload(FileWriteRequestSchema, {});
      expect.unreachable('Should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('workspaceId');
      expect(msg).toContain('path');
      expect(msg).toContain('content');
    }
  });
});
