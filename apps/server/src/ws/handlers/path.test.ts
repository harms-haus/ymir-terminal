import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { ErrorCodes } from '@ymir/shared';
import { mockConn, request } from '../../test-helpers/mock-utils';
import { MessageRouter } from '../router';
import { registerPathHandlers } from './path';
import type { listDirectories } from '../../files/directory-lister';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerPathHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;
  let mockListDirectories: ReturnType<typeof mock<typeof listDirectories>>;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();
    mockListDirectories = mock(() => Promise.resolve([]));
    registerPathHandlers(router, {
      _mocks: {
        listDirectories: mockListDirectories as unknown as typeof listDirectories,
      },
    });
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — valid path returns directories
  // -----------------------------------------------------------------------
  it('valid path returns directories', async () => {
    mockListDirectories.mockImplementationOnce(() =>
      Promise.resolve([{ name: 'Documents' }, { name: 'projects' }]),
    );

    const req = request('path.autocomplete', { path: '~' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.type).toBe('response');
    expect(resp.error).toBeUndefined();
    const payload = resp.payload as Record<string, unknown>;
    expect(payload.directories).toEqual([{ name: 'Documents' }, { name: 'projects' }]);
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — tilde expansion is applied
  // -----------------------------------------------------------------------
  it('tilde expansion is applied', async () => {
    mockListDirectories.mockImplementationOnce(() => Promise.resolve([]));

    const req = request('path.autocomplete', { path: '~/foo' });
    await router.route(conn, req);

    expect(mockListDirectories).toHaveBeenCalledTimes(1);
    const calledWith = mockListDirectories.mock.calls[0][0];
    // expandTilde('~/foo') produces an absolute path (starts with / on Unix, drive letter on Windows)
    expect(calledWith).toContain('foo');
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — empty string path → INVALID_MESSAGE
  // -----------------------------------------------------------------------
  it('empty string path returns INVALID_MESSAGE', async () => {
    const req = request('path.autocomplete', { path: '' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — missing path field → INVALID_MESSAGE
  // -----------------------------------------------------------------------
  it('missing path field returns INVALID_MESSAGE', async () => {
    const req = request('path.autocomplete', {});
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — non-string path → INVALID_MESSAGE
  // -----------------------------------------------------------------------
  it('non-string path returns INVALID_MESSAGE', async () => {
    const req = request('path.autocomplete', { path: 123 });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — null payload → INVALID_MESSAGE
  // -----------------------------------------------------------------------
  it('null payload returns INVALID_MESSAGE', async () => {
    const req = request('path.autocomplete', null);
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — relative path → error
  // -----------------------------------------------------------------------
  it('relative path returns error', async () => {
    const req = request('path.autocomplete', { path: 'relative/path' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — listDirectories throws → HANDLER_ERROR
  // -----------------------------------------------------------------------
  it('listDirectories throws returns HANDLER_ERROR', async () => {
    mockListDirectories.mockImplementationOnce(() =>
      Promise.reject(new Error('Something went wrong')),
    );

    const req = request('path.autocomplete', { path: '/some/path' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.HANDLER_ERROR);
    expect((resp.error as Record<string, unknown>).message).toBe('Something went wrong');
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — ENOENT error → FILE_NOT_FOUND
  // -----------------------------------------------------------------------
  it('ENOENT error returns FILE_NOT_FOUND', async () => {
    const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    mockListDirectories.mockImplementationOnce(() => Promise.reject(err));

    const req = request('path.autocomplete', { path: '/nonexistent' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.FILE_NOT_FOUND);
    expect((resp.error as Record<string, unknown>).message).toBe('Directory not found');
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — ENOTDIR error → FILE_NOT_FOUND
  // -----------------------------------------------------------------------
  it('ENOTDIR error returns FILE_NOT_FOUND', async () => {
    const err = new Error('ENOTDIR: not a directory') as NodeJS.ErrnoException;
    err.code = 'ENOTDIR';
    mockListDirectories.mockImplementationOnce(() => Promise.reject(err));

    const req = request('path.autocomplete', { path: '/some/file' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.FILE_NOT_FOUND);
    expect((resp.error as Record<string, unknown>).message).toBe('Path is not a directory');
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — EACCES error → PERMISSION_DENIED
  // -----------------------------------------------------------------------
  it('EACCES error returns PERMISSION_DENIED', async () => {
    const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    mockListDirectories.mockImplementationOnce(() => Promise.reject(err));

    const req = request('path.autocomplete', { path: '/restricted' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
    expect((resp.error as Record<string, unknown>).message).toBe('Permission denied');
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — EPERM error → PERMISSION_DENIED
  // -----------------------------------------------------------------------
  it('EPERM error returns PERMISSION_DENIED', async () => {
    const err = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
    err.code = 'EPERM';
    mockListDirectories.mockImplementationOnce(() => Promise.reject(err));

    const req = request('path.autocomplete', { path: '/restricted' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.error).toBeDefined();
    expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
    expect((resp.error as Record<string, unknown>).message).toBe('Permission denied');
  });

  // -----------------------------------------------------------------------
  // path.autocomplete — empty directories list
  // -----------------------------------------------------------------------
  it('empty directories list returns success with empty array', async () => {
    mockListDirectories.mockImplementationOnce(() => Promise.resolve([]));

    const req = request('path.autocomplete', { path: '/empty-dir' });
    await router.route(conn, req);

    expect(conn.sent.length).toBe(1);
    const resp = conn.sent[0] as Record<string, unknown>;
    expect(resp.type).toBe('response');
    expect(resp.error).toBeUndefined();
    const payload = resp.payload as Record<string, unknown>;
    expect(payload.directories).toEqual([]);
  });
});
