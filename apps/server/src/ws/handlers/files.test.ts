/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { ErrorCodes, type FileTreeResponse, type FileReadResponse } from '@ymir/shared';
import { mockConn, request } from '../../test-helpers/mock-utils';
import { MessageRouter } from '../router';
import { registerFileHandlers } from './files/index';
import type { FileDeps } from './files/index';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerFileHandlers', () => {
  let router: MessageRouter;
  let conn: ReturnType<typeof mockConn>;

  // Mock dependencies
  let scanDirectoryFn: ReturnType<typeof mock>;
  let readFileFn: ReturnType<typeof mock>;
  let writeFileFn: ReturnType<typeof mock>;
  let deleteFileFn: ReturnType<typeof mock>;
  let renameFileFn: ReturnType<typeof mock>;
  let createFileFn: ReturnType<typeof mock>;
  let createDirectoryFn: ReturnType<typeof mock>;
  let getWorkspaceFn: ReturnType<typeof mock>;

  beforeEach(() => {
    router = new MessageRouter();
    conn = mockConn();

    scanDirectoryFn = mock(() => []);
    readFileFn = mock(() => Promise.resolve('file contents'));
    writeFileFn = mock(() => Promise.resolve());
    deleteFileFn = mock(() => Promise.resolve());
    renameFileFn = mock(() => Promise.resolve());
    createFileFn = mock(() => Promise.resolve());
    createDirectoryFn = mock(() => Promise.resolve());
    getWorkspaceFn = mock((_db: unknown, id: string) => {
      if (id === 'ws-1') {
        return { id: 'ws-1', name: 'Test', cwd: '/home/dev/project', color: '#007acc' };
      }
      return null;
    });

    const deps: FileDeps = {
      persistentDb: {} as any,
      scanner: { scanDirectory: scanDirectoryFn },
      operations: {
        readFile: readFileFn,
        writeFile: writeFileFn,
        deleteFile: deleteFileFn,
        renameFile: renameFileFn,
        createFile: createFileFn,
        createDirectory: createDirectoryFn,
      },
      watcher: {},
      _mocks: {
        getWorkspace: getWorkspaceFn,
      },
    };

    registerFileHandlers(router, deps);
  });

  // -----------------------------------------------------------------------
  // 1. Handler registers for expected channels
  // -----------------------------------------------------------------------
  describe('channel registration', () => {
    it('registers file.tree handler', async () => {
      const req = request('file.tree', { workspaceId: 'ws-1' });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });

    it('registers file.read handler', async () => {
      const req = request('file.read', { workspaceId: 'ws-1', path: '/home/dev/project/index.ts' });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });

    it('registers file.write handler', async () => {
      const req = request('file.write', {
        workspaceId: 'ws-1',
        path: '/home/dev/project/foo.ts',
        content: 'hello',
      });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });

    it('registers file.delete handler', async () => {
      const req = request('file.delete', { workspaceId: 'ws-1', path: '/home/dev/project/old.ts' });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });

    it('registers file.rename handler', async () => {
      const req = request('file.rename', {
        workspaceId: 'ws-1',
        oldPath: '/a.ts',
        newPath: '/b.ts',
      });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });

    it('registers file.create handler', async () => {
      const req = request('file.create', {
        workspaceId: 'ws-1',
        path: '/new.ts',
        isDirectory: false,
      });
      const result = await router.route(conn, req);
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 2. file.tree
  // -----------------------------------------------------------------------
  describe('file.tree', () => {
    it('scans directory for workspace cwd and returns FileTreeResponse', async () => {
      const fakeTree = [
        {
          name: 'src',
          path: '/home/dev/project/src',
          isDirectory: true,
          children: [
            { name: 'index.ts', path: '/home/dev/project/src/index.ts', isDirectory: false },
          ],
        },
        { name: 'package.json', path: '/home/dev/project/package.json', isDirectory: false },
      ];
      scanDirectoryFn.mockImplementation(() => fakeTree);

      const req = request('file.tree', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      expect(scanDirectoryFn).toHaveBeenCalledTimes(1);
      expect(scanDirectoryFn.mock.calls[0][0]).toBe('/home/dev/project');

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.id).toBe(req.id);
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as FileTreeResponse;
      expect(payload.tree).toEqual(fakeTree);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('file.tree', { workspaceId: 'nonexistent' });
      await router.route(conn, req);

      expect(scanDirectoryFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });

    it('returns INVALID_MESSAGE when workspaceId is missing', async () => {
      const req = request('file.tree', {});
      await router.route(conn, req);

      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // 3. file.read
  // -----------------------------------------------------------------------
  describe('file.read', () => {
    it('reads file and returns FileReadResponse { content, language }', async () => {
      readFileFn.mockImplementation(() => Promise.resolve('console.log("hello");'));

      const req = request('file.read', { workspaceId: 'ws-1', path: '/home/dev/project/index.ts' });
      await router.route(conn, req);

      expect(readFileFn).toHaveBeenCalledTimes(1);
      expect(readFileFn.mock.calls[0][0]).toBe('/home/dev/project/index.ts');

      expect(conn.sent.length).toBe(1);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();

      const payload = resp.payload as FileReadResponse;
      expect(payload.content).toBe('console.log("hello");');
      expect(payload.language).toBe('typescript');
    });

    it('detects language from various extensions', async () => {
      const cases: Array<[string, string]> = [
        ['foo.js', 'javascript'],
        ['foo.ts', 'typescript'],
        ['foo.tsx', 'typescript'],
        ['foo.jsx', 'javascript'],
        ['foo.py', 'python'],
        ['foo.rs', 'rust'],
        ['foo.go', 'go'],
        ['foo.css', 'css'],
        ['foo.html', 'html'],
        ['foo.json', 'json'],
        ['foo.md', 'markdown'],
        ['foo.yml', 'yaml'],
        ['foo.yaml', 'yaml'],
        ['foo.toml', 'toml'],
        ['foo.sh', 'bash'],
        ['foo.sql', 'sql'],
        ['Makefile', 'makefile'],
      ];

      for (const [filename, expectedLang] of cases) {
        conn.sent.length = 0;
        readFileFn.mockImplementation(() => Promise.resolve('content'));

        const req = request('file.read', {
          workspaceId: 'ws-1',
          path: `/home/dev/project/${filename}`,
        });
        await router.route(conn, req);

        const resp = conn.sent[0] as Record<string, unknown>;
        const payload = resp.payload as FileReadResponse;
        expect(payload.language).toBe(expectedLang);
      }
    });

    it('returns INVALID_MESSAGE when path is missing', async () => {
      const req = request('file.read', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      expect(readFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns WORKSPACE_NOT_FOUND for unknown workspaceId', async () => {
      const req = request('file.read', { workspaceId: 'nonexistent', path: '/a.ts' });
      await router.route(conn, req);

      expect(readFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.WORKSPACE_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // 4. file.write
  // -----------------------------------------------------------------------
  describe('file.write', () => {
    it('writes content to file', async () => {
      const req = request('file.write', {
        workspaceId: 'ws-1',
        path: '/home/dev/project/foo.ts',
        content: 'export const x = 1;',
      });
      await router.route(conn, req);

      expect(writeFileFn).toHaveBeenCalledTimes(1);
      expect(writeFileFn.mock.calls[0][0]).toBe('/home/dev/project/foo.ts');
      expect(writeFileFn.mock.calls[0][1]).toBe('export const x = 1;');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
      expect(resp.payload).toEqual({ success: true });
    });

    it('returns INVALID_MESSAGE when path is missing', async () => {
      const req = request('file.write', { workspaceId: 'ws-1', content: 'hi' });
      await router.route(conn, req);

      expect(writeFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when content is missing', async () => {
      const req = request('file.write', { workspaceId: 'ws-1', path: '/a.ts' });
      await router.route(conn, req);

      expect(writeFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // 5. file.delete
  // -----------------------------------------------------------------------
  describe('file.delete', () => {
    it('deletes file', async () => {
      const req = request('file.delete', {
        workspaceId: 'ws-1',
        path: '/home/dev/project/old.ts',
      });
      await router.route(conn, req);

      expect(deleteFileFn).toHaveBeenCalledTimes(1);
      expect(deleteFileFn.mock.calls[0][0]).toBe('/home/dev/project/old.ts');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
      expect(resp.payload).toEqual({ success: true });
    });

    it('returns INVALID_MESSAGE when path is missing', async () => {
      const req = request('file.delete', { workspaceId: 'ws-1' });
      await router.route(conn, req);

      expect(deleteFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // 6. file.rename
  // -----------------------------------------------------------------------
  describe('file.rename', () => {
    it('renames/moves file', async () => {
      const req = request('file.rename', {
        workspaceId: 'ws-1',
        oldPath: '/home/dev/project/a.ts',
        newPath: '/home/dev/project/b.ts',
      });
      await router.route(conn, req);

      expect(renameFileFn).toHaveBeenCalledTimes(1);
      expect(renameFileFn.mock.calls[0][0]).toBe('/home/dev/project/a.ts');
      expect(renameFileFn.mock.calls[0][1]).toBe('/home/dev/project/b.ts');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
      expect(resp.payload).toEqual({ success: true });
    });

    it('returns INVALID_MESSAGE when oldPath is missing', async () => {
      const req = request('file.rename', { workspaceId: 'ws-1', newPath: '/b.ts' });
      await router.route(conn, req);

      expect(renameFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });

    it('returns INVALID_MESSAGE when newPath is missing', async () => {
      const req = request('file.rename', { workspaceId: 'ws-1', oldPath: '/a.ts' });
      await router.route(conn, req);

      expect(renameFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // 7. file.create
  // -----------------------------------------------------------------------
  describe('file.create', () => {
    it('creates a file when isDirectory is false', async () => {
      const req = request('file.create', {
        workspaceId: 'ws-1',
        path: '/home/dev/project/new-file.ts',
        isDirectory: false,
      });
      await router.route(conn, req);

      expect(createFileFn).toHaveBeenCalledTimes(1);
      expect(createDirectoryFn).toHaveBeenCalledTimes(0);
      expect(createFileFn.mock.calls[0][0]).toBe('/home/dev/project/new-file.ts');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
      expect(resp.payload).toEqual({ success: true });
    });

    it('creates a directory when isDirectory is true', async () => {
      const req = request('file.create', {
        workspaceId: 'ws-1',
        path: '/home/dev/project/new-dir',
        isDirectory: true,
      });
      await router.route(conn, req);

      expect(createDirectoryFn).toHaveBeenCalledTimes(1);
      expect(createFileFn).toHaveBeenCalledTimes(0);
      expect(createDirectoryFn.mock.calls[0][0]).toBe('/home/dev/project/new-dir');

      const resp = conn.sent[0] as Record<string, unknown>;
      expect(resp.type).toBe('response');
      expect(resp.error).toBeUndefined();
      expect(resp.payload).toEqual({ success: true });
    });

    it('returns INVALID_MESSAGE when path is missing', async () => {
      const req = request('file.create', { workspaceId: 'ws-1', isDirectory: false });
      await router.route(conn, req);

      expect(createFileFn).toHaveBeenCalledTimes(0);
      expect(createDirectoryFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.INVALID_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Path traversal protection
  // -----------------------------------------------------------------------
  describe('path traversal protection', () => {
    it('file.read rejects traversal with PERMISSION_DENIED', async () => {
      const req = request('file.read', { workspaceId: 'ws-1', path: '../../../etc/passwd' });
      await router.route(conn, req);

      expect(readFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
    });

    it('file.write rejects traversal with PERMISSION_DENIED', async () => {
      const req = request('file.write', {
        workspaceId: 'ws-1',
        path: '../../etc/malicious',
        content: 'pwned',
      });
      await router.route(conn, req);

      expect(writeFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
    });

    it('file.delete rejects traversal with PERMISSION_DENIED', async () => {
      const req = request('file.delete', { workspaceId: 'ws-1', path: '/etc/passwd' });
      await router.route(conn, req);

      expect(deleteFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
    });

    it('file.rename rejects traversal on oldPath with PERMISSION_DENIED', async () => {
      const req = request('file.rename', {
        workspaceId: 'ws-1',
        oldPath: '../../../etc/passwd',
        newPath: '/home/dev/project/stolen.txt',
      });
      await router.route(conn, req);

      expect(renameFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
    });

    it('file.rename rejects traversal on newPath with PERMISSION_DENIED', async () => {
      const req = request('file.rename', {
        workspaceId: 'ws-1',
        oldPath: '/home/dev/project/a.ts',
        newPath: '../../../tmp/evil',
      });
      await router.route(conn, req);

      expect(renameFileFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
    });

    it('file.create rejects traversal with PERMISSION_DENIED', async () => {
      const req = request('file.create', {
        workspaceId: 'ws-1',
        path: '/tmp/evil',
        isDirectory: false,
      });
      await router.route(conn, req);

      expect(createFileFn).toHaveBeenCalledTimes(0);
      expect(createDirectoryFn).toHaveBeenCalledTimes(0);
      const resp = conn.sent[0] as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).code).toBe(ErrorCodes.PERMISSION_DENIED);
    });
  });
});
