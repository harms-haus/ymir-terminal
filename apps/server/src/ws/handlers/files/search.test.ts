/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { ErrorCodes } from '@ymir/shared';
import { mockConn, request, makeGetWorkspaceMock } from '../../../test-helpers/mock-utils';
import { MessageRouter } from '../../router';
import { registerSearchHandlers } from './search';
import type { FileDeps } from './shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal FileSearchFileResult for mock callbacks. */
function fileResult(overrides?: {
  path?: string;
  relativePath?: string;
  matches?: Array<{ lineNumber: number; lineText: string; submatches: any[] }>;
  truncated?: boolean;
}) {
  return {
    path: overrides?.path ?? '/home/dev/project/src/index.ts',
    relativePath: overrides?.relativePath ?? 'src/index.ts',
    matches: overrides?.matches ?? [
      {
        lineNumber: 1,
        lineText: 'const foo = 1;',
        submatches: [{ matchText: 'foo', start: 6, end: 9 }],
      },
    ],
    truncated: overrides?.truncated ?? false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerSearchHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let getWorkspaceFn: ReturnType<typeof mock>;
  let streamSearchFn: ReturnType<typeof mock>;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();
    getWorkspaceFn = makeGetWorkspaceMock();
    streamSearchFn = mock(async () => ({
      totalMatches: 0,
      truncated: false,
      fileCount: 0,
    }));
  });

  function buildDeps(overrides?: {
    streamSearch?: typeof streamSearchFn;
    getWorkspace?: typeof getWorkspaceFn;
  }): FileDeps {
    return {
      persistentDb: {} as any,
      scanner: { scanDirectory: mock(() => []) as any },
      operations: {
        readFile: mock(async () => '') as any,
        writeFile: mock(async () => {}) as any,
        deleteFile: mock(async () => {}) as any,
        renameFile: mock(async () => {}) as any,
        createFile: mock(async () => {}) as any,
        createDirectory: mock(async () => {}) as any,
        copyFile: mock(async () => {}) as any,
        copyDirectory: mock(async () => {}) as any,
        findAvailableName: mock((_dir: string, base: string) => base) as any,
      },
      _mocks: {
        getWorkspace: overrides?.getWorkspace ?? getWorkspaceFn,
        streamSearch: overrides?.streamSearch ?? streamSearchFn,
      },
    };
  }

  // -----------------------------------------------------------------------
  // 1. file.search — basic search with results
  // -----------------------------------------------------------------------
  describe('file.search', () => {
    it('sends progress events and final response with correct totals', async () => {
      const fileRes = fileResult();
      const mockStreamSearch = mock(async (_cwd, _root, _opts, callbacks: any) => {
        callbacks.onFileResult(fileRes);
        return { totalMatches: 3, truncated: false, fileCount: 1 };
      });

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', { workspaceId: 'ws-1', query: 'foo' });
      await router.route(conn, req);

      // Expected messages:
      // 1. progress event with done=false (from onFileResult)
      // 2. progress event with done=true (final)
      // 3. success response
      expect(conn.sent.length).toBe(3);

      // Progress event (done=false)
      const progressEvt = conn.sent[0] as Record<string, unknown>;
      expect(progressEvt.type).toBe('event');
      expect(progressEvt.channel).toBe('file.search.progress');
      expect(progressEvt.payload.done).toBe(false);
      expect(progressEvt.payload.totalMatches).toBe(1); // accumulated during callback
      expect(progressEvt.payload.fileResult.path).toBe(fileRes.path);
      expect(progressEvt.payload.fileResult.matches).toHaveLength(1);

      // Final done event
      const doneEvt = conn.sent[1] as Record<string, unknown>;
      expect(doneEvt.type).toBe('event');
      expect(doneEvt.channel).toBe('file.search.progress');
      expect(doneEvt.payload.done).toBe(true);
      expect(doneEvt.payload.totalMatches).toBe(3);
      expect(doneEvt.payload.fileResult.matches).toEqual([]);

      // Success response
      const resp = conn.sent[2] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
      expect(resp.payload.totalMatches).toBe(3);
      expect(resp.payload.fileCount).toBe(1);
      expect(resp.payload.truncated).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Streaming progress events
  // -----------------------------------------------------------------------
  describe('streaming progress events', () => {
    it('sends individual progress events per file result', async () => {
      const res1 = fileResult({
        path: '/home/dev/project/src/a.ts',
        relativePath: 'src/a.ts',
        matches: [
          {
            lineNumber: 1,
            lineText: 'foo bar',
            submatches: [{ matchText: 'foo', start: 0, end: 3 }],
          },
        ],
      });
      const res2 = fileResult({
        path: '/home/dev/project/src/b.ts',
        relativePath: 'src/b.ts',
        matches: [
          {
            lineNumber: 5,
            lineText: 'baz foo',
            submatches: [{ matchText: 'foo', start: 4, end: 7 }],
          },
        ],
      });

      const mockStreamSearch = mock(async (_cwd, _root, _opts, callbacks: any) => {
        callbacks.onFileResult(res1);
        callbacks.onFileResult(res2);
        return { totalMatches: 2, truncated: false, fileCount: 2 };
      });

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', { workspaceId: 'ws-1', query: 'foo' });
      await router.route(conn, req);

      // 2 progress events (done=false) + 1 done event + 1 response = 4
      expect(conn.sent.length).toBe(4);

      // First progress event
      const evt0 = conn.sent[0] as Record<string, unknown>;
      expect(evt0.channel).toBe('file.search.progress');
      expect(evt0.payload.done).toBe(false);
      expect(evt0.payload.fileResult.path).toBe(res1.path);
      expect(evt0.payload.totalMatches).toBe(1);

      // Second progress event
      const evt1 = conn.sent[1] as Record<string, unknown>;
      expect(evt1.channel).toBe('file.search.progress');
      expect(evt1.payload.done).toBe(false);
      expect(evt1.payload.fileResult.path).toBe(res2.path);
      expect(evt1.payload.totalMatches).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Final done event
  // -----------------------------------------------------------------------
  describe('final done event', () => {
    it('sends progress event with done=true after search completes', async () => {
      const mockStreamSearch = mock(async () => ({
        totalMatches: 5,
        truncated: true,
        fileCount: 3,
      }));

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', { workspaceId: 'ws-1', query: 'bar' });
      await router.route(conn, req);

      // done event + response = 2
      expect(conn.sent.length).toBe(2);

      const doneEvt = conn.sent[0] as Record<string, unknown>;
      expect(doneEvt.type).toBe('event');
      expect(doneEvt.channel).toBe('file.search.progress');
      expect(doneEvt.payload.done).toBe(true);
      expect(doneEvt.payload.totalMatches).toBe(5);
      expect(doneEvt.payload.truncated).toBe(true);
      expect(doneEvt.payload.fileResult).toEqual({
        path: '',
        relativePath: '',
        matches: [],
        truncated: false,
      });
    });
  });

  // -----------------------------------------------------------------------
  // 4. Missing query validation
  // -----------------------------------------------------------------------
  describe('missing query validation', () => {
    it('returns INVALID_MESSAGE when query is empty string', async () => {
      registerSearchHandlers(router, buildDeps());

      const req = request('file.search', { workspaceId: 'ws-1', query: '' });
      await router.route(conn, req);

      expect(streamSearchFn).toHaveBeenCalledTimes(0);
      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeDefined();
      expect((resp.error as any).code).toBe(ErrorCodes.INVALID_MESSAGE);
      expect((resp.error as any).message).toContain('Missing required fields');
    });

    it('returns INVALID_MESSAGE when query is missing entirely', async () => {
      registerSearchHandlers(router, buildDeps());

      const req = request('file.search', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      expect(streamSearchFn).toHaveBeenCalledTimes(0);
      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as any).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Missing workspaceId validation
  // -----------------------------------------------------------------------
  describe('missing workspaceId validation', () => {
    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      registerSearchHandlers(router, buildDeps());

      const req = request('file.search', { query: 'foo' });
      await router.route(conn, req);

      expect(streamSearchFn).toHaveBeenCalledTimes(0);
      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as any).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Invalid workspace
  // -----------------------------------------------------------------------
  describe('invalid workspace', () => {
    it('returns WORKSPACE_NOT_FOUND for non-existent workspaceId', async () => {
      registerSearchHandlers(router, buildDeps());

      const req = request('file.search', { workspaceId: 'nonexistent', query: 'foo' });
      await router.route(conn, req);

      expect(streamSearchFn).toHaveBeenCalledTimes(0);
      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect((resp.error as any).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
      expect((resp.error as any).message).toContain('Workspace not found');
    });
  });

  // -----------------------------------------------------------------------
  // 7. Search error handling
  // -----------------------------------------------------------------------
  describe('search error handling', () => {
    it('returns HANDLER_ERROR when streamSearch throws', async () => {
      const mockStreamSearch = mock(async () => {
        throw new Error('ripgrep is not installed');
      });

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', { workspaceId: 'ws-1', query: 'foo' });
      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect((resp.error as any).code).toBe(ErrorCodes.HANDLER_ERROR);
      expect((resp.error as any).message).toContain('ripgrep');
    });

    it('returns HANDLER_ERROR with generic message for non-Error throws', async () => {
      const mockStreamSearch = mock(async () => {
        throw 'unknown error';
      });

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', { workspaceId: 'ws-1', query: 'foo' });
      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as any).code).toBe(ErrorCodes.HANDLER_ERROR);
      expect((resp.error as any).message).toBe('Search failed');
    });
  });

  // -----------------------------------------------------------------------
  // 8. Replace handler validation
  // -----------------------------------------------------------------------
  describe('file.search.replace', () => {
    it('returns INVALID_MESSAGE when query is empty', async () => {
      registerSearchHandlers(router, buildDeps());

      const req = request('file.search.replace', {
        workspaceId: 'ws-1',
        query: '',
        replacement: 'bar',
      });
      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect((resp.error as any).code).toBe(ErrorCodes.INVALID_MESSAGE);
      expect((resp.error as any).message).toContain('Missing required fields');
    });

    it('returns INVALID_MESSAGE when replacement is missing', async () => {
      registerSearchHandlers(router, buildDeps());

      const req = request('file.search.replace', {
        workspaceId: 'ws-1',
        query: 'foo',
      });
      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as any).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      registerSearchHandlers(router, buildDeps());

      const req = request('file.search.replace', {
        query: 'foo',
        replacement: 'bar',
      });
      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as any).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for non-existent workspaceId', async () => {
      registerSearchHandlers(router, buildDeps());

      const req = request('file.search.replace', {
        workspaceId: 'nonexistent',
        query: 'foo',
        replacement: 'bar',
      });
      await router.route(conn, req);

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as any).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Passed options to streamSearch
  // -----------------------------------------------------------------------
  describe('option passing', () => {
    it('passes caseSensitive, wholeWord, useRegex, and includePattern to streamSearch', async () => {
      const mockStreamSearch = mock(async () => ({
        totalMatches: 0,
        truncated: false,
        fileCount: 0,
      }));

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', {
        workspaceId: 'ws-1',
        query: 'test',
        caseSensitive: true,
        wholeWord: true,
        useRegex: true,
        includePattern: '*.ts',
      });
      await router.route(conn, req);

      expect(mockStreamSearch).toHaveBeenCalledTimes(1);
      const opts = mockStreamSearch.mock.calls[0][2];
      expect(opts.query).toBe('test');
      expect(opts.caseSensitive).toBe(true);
      expect(opts.wholeWord).toBe(true);
      expect(opts.useRegex).toBe(true);
      expect(opts.includePattern).toBe('*.ts');
      expect(opts.maxTotal).toBe(1000);
      expect(opts.maxPerFile).toBe(50);
    });

    it('defaults boolean options to false when not provided', async () => {
      const mockStreamSearch = mock(async () => ({
        totalMatches: 0,
        truncated: false,
        fileCount: 0,
      }));

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', { workspaceId: 'ws-1', query: 'test' });
      await router.route(conn, req);

      const opts = mockStreamSearch.mock.calls[0][2];
      expect(opts.caseSensitive).toBe(false);
      expect(opts.wholeWord).toBe(false);
      expect(opts.useRegex).toBe(false);
      expect(opts.includePattern).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 10. Progress events include correct workspaceId and requestId
  // -----------------------------------------------------------------------
  describe('progress event metadata', () => {
    it('includes workspaceId and requestId in progress events', async () => {
      const mockStreamSearch = mock(async (_cwd, _root, _opts, callbacks: any) => {
        callbacks.onFileResult(fileResult());
        return { totalMatches: 1, truncated: false, fileCount: 1 };
      });

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', { workspaceId: 'ws-1', query: 'foo' });
      await router.route(conn, req);

      // Progress event (done=false)
      const progressEvt = conn.sent[0] as Record<string, unknown>;
      expect(progressEvt.payload.workspaceId).toBe('ws-1');
      expect(progressEvt.payload.requestId).toBe(req.id);

      // Done event
      const doneEvt = conn.sent[1] as Record<string, unknown>;
      expect(doneEvt.payload.workspaceId).toBe('ws-1');
      expect(doneEvt.payload.requestId).toBe(req.id);
    });
  });

  // -----------------------------------------------------------------------
  // 11. Truncated flag propagation
  // -----------------------------------------------------------------------
  describe('truncated flag', () => {
    it('sets truncated=true in response when streamSearch reports truncation', async () => {
      const mockStreamSearch = mock(async (_cwd, _root, _opts, callbacks: any) => {
        callbacks.onFileResult(fileResult({ truncated: true }));
        return { totalMatches: 1, truncated: true, fileCount: 1 };
      });

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', { workspaceId: 'ws-1', query: 'foo' });
      await router.route(conn, req);

      // Progress event with truncated=true
      const progressEvt = conn.sent[0] as Record<string, unknown>;
      expect(progressEvt.payload.truncated).toBe(true);

      // Final done event with truncated=true
      const doneEvt = conn.sent[1] as Record<string, unknown>;
      expect(doneEvt.payload.truncated).toBe(true);

      // Response with truncated=true
      const resp = conn.sent[2] as Record<string, unknown>;
      expect(resp.payload.truncated).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 12. Empty results
  // -----------------------------------------------------------------------
  describe('empty results', () => {
    it('sends zero-match response when no files have results', async () => {
      const mockStreamSearch = mock(async () => ({
        totalMatches: 0,
        truncated: false,
        fileCount: 0,
      }));

      registerSearchHandlers(router, buildDeps({ streamSearch: mockStreamSearch }));

      const req = request('file.search', { workspaceId: 'ws-1', query: 'nonexistent' });
      await router.route(conn, req);

      // done event + response = 2
      expect(conn.sent.length).toBe(2);

      const resp = conn.sent[1] as Record<string, unknown>;
      expect(resp.payload.totalMatches).toBe(0);
      expect(resp.payload.fileCount).toBe(0);
      expect(resp.payload.truncated).toBe(false);
    });
  });
});
