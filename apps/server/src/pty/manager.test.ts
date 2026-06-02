/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-function-type */
import { describe, expect, it, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { PTYManager } from './manager';
import { toBase64 } from '@ymir/shared';

// We mock the PTYManager module dependency on existsSync by intercepting
// at the module level. To avoid contaminating other test files' node:fs usage,
// we create a dedicated mock module that only affects this file's import.
// NOTE: mock.module is process-scoped in Bun 1.3.14, so this WILL affect
// other files that import from 'node:fs'. We mitigate by restoring in afterAll.
const mockExistsSync = mock((_path: string) => true);

mock.module('node:fs', () => ({
  existsSync: mockExistsSync,
}));

// Cleanup: restore all mocked modules so other test files see the originals.
// This runs after ALL tests in this file complete.
afterAll(() => {
  mock.restore();
});

describe('PTYManager', () => {
  let manager: PTYManager;
  let mockTerminalInstances: any[];
  let mockSpawnedProcesses: any[];
  let originalTerminal: any;
  let originalSpawn: any;

  beforeEach(() => {
    manager = new PTYManager('linux');
    mockTerminalInstances = [];
    mockSpawnedProcesses = [];

    // Store originals
    originalTerminal = (Bun as any).Terminal;
    originalSpawn = (Bun as any).spawn;

    // Mock Bun.Terminal
    (Bun as any).Terminal = class MockTerminal {
      cols: number;
      rows: number;
      dataCallback: Function;
      written: Buffer[] = [];
      resizeOpts: { cols: number; rows: number } | null = null;
      resizeCalls: { cols: number; rows: number }[] = [];
      closed = false;

      constructor(opts: any) {
        this.cols = opts.cols;
        this.rows = opts.rows;
        this.dataCallback = opts.data;
        mockTerminalInstances.push(this);
      }

      write(data: Buffer) {
        this.written.push(data);
      }

      resize(cols: number, rows: number) {
        this.resizeOpts = { cols, rows };
        this.resizeCalls.push({ cols, rows });
        this.cols = cols;
        this.rows = rows;
      }

      close() {
        this.closed = true;
      }
    };

    // Reset existsSync mock to default (all shells exist)
    mockExistsSync.mockImplementation((_path: string) => true);

    // Mock Bun.spawn
    (Bun as any).spawn = mock((_cmd: string[], opts: any) => {
      let _resolve: (code: number) => void;
      const exited = new Promise<number>((resolve) => {
        _resolve = resolve;
      });
      const proc = {
        killed: false,
        exited,
        _resolve: () => _resolve(0),
        kill() {
          this.killed = true;
        },
      };
      mockSpawnedProcesses.push(proc);
      return proc;
    });
  });

  // Restore originals after each test
  // (handled by afterEach below)

  afterEach(() => {
    (Bun as any).Terminal = originalTerminal;
    (Bun as any).spawn = originalSpawn;
  });

  it('create() creates a PTY and returns the id', () => {
    const onData = mock((_data: string) => {});
    const id = manager.create('test-1', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect(id).toBe('test-1');
    expect(mockTerminalInstances).toHaveLength(1);
    expect(mockTerminalInstances[0].cols).toBe(80);
    expect(mockTerminalInstances[0].rows).toBe(24);
    expect(mockSpawnedProcesses).toHaveLength(1);
    expect(manager.has('test-1')).toBe(true);
  });

  it('create() uses shell option when provided', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-shell', {
      shell: '/bin/zsh',
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect((Bun as any).spawn).toHaveBeenCalledWith(
      ['/bin/zsh'],
      expect.objectContaining({ cwd: '/home/user' }),
    );
  });

  it('create() defaults to SHELL env var when no shell option', () => {
    const originalShell = process.env.SHELL;
    process.env.SHELL = '/bin/zsh';
    try {
      const onData = mock((_data: string) => {});
      manager.create('test-default-shell', {
        cwd: '/home/user',
        cols: 80,
        rows: 24,
        onData,
      });

      expect((Bun as any).spawn).toHaveBeenCalledWith(
        ['/bin/zsh'],
        expect.objectContaining({ cwd: '/home/user' }),
      );
    } finally {
      if (originalShell === undefined) {
        delete process.env.SHELL;
      } else {
        process.env.SHELL = originalShell;
      }
    }
  });

  it('create() invokes onData with base64-encoded data from terminal', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-data', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    const terminal = mockTerminalInstances[0];
    const testData = Buffer.from('hello terminal');
    terminal.dataCallback(terminal, testData);

    expect(onData).toHaveBeenCalledTimes(1);
    const encoded = onData.mock.calls[0][0] as string;
    expect(encoded).toBe(toBase64(testData));
  });

  it('write() decodes base64 and writes to terminal', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-write', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    const inputData = 'ls -la\n';
    const encoded = toBase64(inputData);
    manager.write('test-write', encoded);

    const terminal = mockTerminalInstances[0];
    expect(terminal.written).toHaveLength(1);
    const written = terminal.written[0];
    expect(new TextDecoder().decode(written)).toBe(inputData);
  });

  it('write() throws if terminal not found', () => {
    expect(() => manager.write('nonexistent', toBase64('data'))).toThrow(
      'Terminal nonexistent not found',
    );
  });

  it('resize() resizes the terminal', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-resize', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.resize('test-resize', 120, 40);

    const terminal = mockTerminalInstances[0];
    expect(terminal.resizeOpts).toEqual({ cols: 120, rows: 40 });
  });

  it('resize() throws if terminal not found', () => {
    expect(() => manager.resize('nonexistent', 120, 40)).toThrow('Terminal nonexistent not found');
  });

  it('resize() is a no-op when cols and rows match initial dimensions', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-noop-init', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.resize('test-noop-init', 80, 24);

    const terminal = mockTerminalInstances[0];
    expect(terminal.resizeCalls).toHaveLength(0);
    expect(terminal.resizeOpts).toBeNull();
  });

  it('resize() applies when dimensions change', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-resize-change', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.resize('test-resize-change', 120, 40);

    const terminal = mockTerminalInstances[0];
    expect(terminal.resizeCalls).toHaveLength(1);
    expect(terminal.resizeOpts).toEqual({ cols: 120, rows: 40 });
  });

  it('resize() is a no-op when cols and rows match previously resized dimensions', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-noop-duplicate', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.resize('test-noop-duplicate', 120, 40);
    manager.resize('test-noop-duplicate', 120, 40);

    const terminal = mockTerminalInstances[0];
    expect(terminal.resizeCalls).toHaveLength(1);
    expect(terminal.resizeCalls[0]).toEqual({ cols: 120, rows: 40 });
  });

  it('resize() applies when only cols changes', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-resize-cols', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.resize('test-resize-cols', 100, 24);

    const terminal = mockTerminalInstances[0];
    expect(terminal.resizeCalls).toHaveLength(1);
    expect(terminal.resizeOpts).toEqual({ cols: 100, rows: 24 });
  });

  it('resize() applies when only rows changes', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-resize-rows', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.resize('test-resize-rows', 80, 30);

    const terminal = mockTerminalInstances[0];
    expect(terminal.resizeCalls).toHaveLength(1);
    expect(terminal.resizeOpts).toEqual({ cols: 80, rows: 30 });
  });

  it('kill() closes terminal and kills process', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-kill', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect(manager.has('test-kill')).toBe(true);

    manager.kill('test-kill');

    expect(manager.has('test-kill')).toBe(false);
    expect(mockTerminalInstances[0].closed).toBe(true);
    expect(mockSpawnedProcesses[0].killed).toBe(true);
  });

  it('kill() does nothing if terminal not found', () => {
    // Should not throw
    manager.kill('nonexistent');
  });

  it('has() returns false for nonexistent terminal', () => {
    expect(manager.has('nonexistent')).toBe(false);
  });

  it('create() falls back to another shell when resolved shell does not exist', () => {
    mockExistsSync.mockImplementation((path: string) => {
      // /bin/bash (the default) doesn't exist, but /bin/sh does
      if (path === '/bin/sh') return true;
      return false;
    });

    const onData = mock((_data: string) => {});
    manager.create('test-fallback', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect((Bun as any).spawn).toHaveBeenCalledWith(
      ['/bin/sh'],
      expect.objectContaining({ cwd: '/home/user' }),
    );
  });

  it('create() throws when no supported shell exists on the system', () => {
    mockExistsSync.mockReturnValue(false);

    const onData = mock((_data: string) => {});
    expect(() =>
      manager.create('test-no-shell', {
        cwd: '/home/user',
        cols: 80,
        rows: 24,
        onData,
      }),
    ).toThrow('No supported shell found on this system');
  });

  it('create() re-throws with descriptive message when Bun.spawn fails', () => {
    mockExistsSync.mockReturnValue(true);

    const spawnError = new Error('Permission denied');
    (Bun as any).spawn = mock(() => {
      throw spawnError;
    });

    const onData = mock((_data: string) => {});
    let caught: Error | undefined;
    try {
      manager.create('test-spawn-error', {
        shell: '/bin/bash',
        cwd: '/home/user',
        cols: 80,
        rows: 24,
        onData,
      });
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).toBe('Failed to spawn shell: /bin/bash');
    expect(caught!.cause).toBe(spawnError);
  });

  it('create() throws when shell is not in the allowlist', () => {
    mockExistsSync.mockReturnValue(true);

    const onData = mock((_data: string) => {});
    expect(() =>
      manager.create('test-disallowed-shell', {
        shell: '/usr/bin/fish',
        cwd: '/home/user',
        cols: 80,
        rows: 24,
        onData,
      }),
    ).toThrow('Shell not allowed: /usr/bin/fish');
  });

  it('killAll() closes all terminals', () => {
    const onData = mock((_data: string) => {});
    manager.create('term-1', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });
    manager.create('term-2', {
      cwd: '/home/user',
      cols: 100,
      rows: 30,
      onData,
    });

    manager.killAll();

    expect(manager.has('term-1')).toBe(false);
    expect(manager.has('term-2')).toBe(false);
    expect(mockTerminalInstances[0].closed).toBe(true);
    expect(mockTerminalInstances[1].closed).toBe(true);
    expect(mockSpawnedProcesses[0].killed).toBe(true);
    expect(mockSpawnedProcesses[1].killed).toBe(true);
  });
});

describe('PTYManager (win32)', () => {
  let manager: PTYManager;
  let mockTerminalInstances: any[];
  let mockSpawnedProcesses: any[];
  let originalTerminal: any;
  let originalSpawn: any;

  beforeEach(() => {
    manager = new PTYManager('win32');
    mockTerminalInstances = [];
    mockSpawnedProcesses = [];

    // Store originals
    originalTerminal = (Bun as any).Terminal;
    originalSpawn = (Bun as any).spawn;

    // Mock Bun.Terminal
    (Bun as any).Terminal = class MockTerminal {
      cols: number;
      rows: number;
      dataCallback: Function;
      written: Buffer[] = [];
      resizeOpts: { cols: number; rows: number } | null = null;
      resizeCalls: { cols: number; rows: number }[] = [];
      closed = false;

      constructor(opts: any) {
        this.cols = opts.cols;
        this.rows = opts.rows;
        this.dataCallback = opts.data;
        mockTerminalInstances.push(this);
      }

      write(data: Buffer) {
        this.written.push(data);
      }

      resize(cols: number, rows: number) {
        this.resizeOpts = { cols, rows };
        this.resizeCalls.push({ cols, rows });
        this.cols = cols;
        this.rows = rows;
      }

      close() {
        this.closed = true;
      }
    };

    // Reset existsSync mock to default (all shells exist)
    mockExistsSync.mockImplementation((_path: string) => true);

    // Mock Bun.spawn
    (Bun as any).spawn = mock((_cmd: string[], opts: any) => {
      let _resolve: (code: number) => void;
      const exited = new Promise<number>((resolve) => {
        _resolve = resolve;
      });
      const proc = {
        killed: false,
        exited,
        _resolve: () => _resolve(0),
        kill() {
          this.killed = true;
        },
      };
      mockSpawnedProcesses.push(proc);
      return proc;
    });
  });

  afterEach(() => {
    (Bun as any).Terminal = originalTerminal;
    (Bun as any).spawn = originalSpawn;
  });

  it('create() defaults to cmd.exe when no shell and no COMSPEC', () => {
    const originalComspec = process.env.COMSPEC;
    delete process.env.COMSPEC;
    try {
      const onData = mock((_data: string) => {});
      manager.create('win-default', {
        cwd: 'C:\\Users\\user',
        cols: 80,
        rows: 24,
        onData,
      });

      expect((Bun as any).spawn).toHaveBeenCalledWith(
        ['cmd.exe'],
        expect.objectContaining({ cwd: 'C:\\Users\\user' }),
      );
    } finally {
      process.env.COMSPEC = originalComspec;
    }
  });

  it('create() uses COMSPEC env when set', () => {
    const originalComspec = process.env.COMSPEC;
    // Use forward slashes so basename() works correctly on Linux CI
    process.env.COMSPEC = 'C:/Windows/System32/cmd.exe';
    try {
      const onData = mock((_data: string) => {});
      manager.create('win-comspec', {
        cwd: 'C:\\Users\\user',
        cols: 80,
        rows: 24,
        onData,
      });

      // Source applies basename() to COMSPEC, so the shell arg is just the basename
      expect((Bun as any).spawn).toHaveBeenCalledWith(
        ['cmd.exe'],
        expect.objectContaining({ cwd: 'C:\\Users\\user' }),
      );
    } finally {
      process.env.COMSPEC = originalComspec;
    }
  });

  it('create() rejects Unix shells on Windows', () => {
    const onData = mock((_data: string) => {});
    expect(() =>
      manager.create('win-unix-shell', {
        shell: '/bin/bash',
        cwd: 'C:\\Users\\user',
        cols: 80,
        rows: 24,
        onData,
      }),
    ).toThrow('Shell not allowed: /bin/bash');
  });

  it('resize() does not send SIGWINCH on Windows', () => {
    const originalProcessKill = process.kill;
    const mockProcessKill = mock((_pid: number, _signal: string) => {});
    process.kill = mockProcessKill as typeof process.kill;
    try {
      const onData = mock((_data: string) => {});
      manager.create('win-resize', {
        cwd: 'C:\\Users\\user',
        cols: 80,
        rows: 24,
        onData,
      });

      manager.resize('win-resize', 120, 40);

      const terminal = mockTerminalInstances[0];
      expect(terminal.resizeOpts).toEqual({ cols: 120, rows: 40 });
      expect(mockProcessKill).not.toHaveBeenCalled();
    } finally {
      process.kill = originalProcessKill;
    }
  });
});
