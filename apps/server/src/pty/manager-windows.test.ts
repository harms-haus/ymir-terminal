/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { PTYManager } from './manager';

describe('PTYManager – Windows behavior', () => {
  let manager: PTYManager;
  let mockTerminalInstances: any[];
  let mockSpawnedProcesses: any[];
  let originalTerminal: any;
  let originalSpawn: any;

  beforeEach(() => {
    // Instantiate with platform='win32' to simulate Windows
    manager = new PTYManager('win32');
    mockTerminalInstances = [];
    mockSpawnedProcesses = [];

    originalTerminal = (Bun as any).Terminal;
    originalSpawn = (Bun as any).spawn;

    // Mock Bun.Terminal
    (Bun as any).Terminal = class MockTerminal {
      cols: number;
      rows: number;
      dataCallback: (term: unknown, data: Buffer) => void;
      written: Buffer[] = [];
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
        this.resizeCalls.push({ cols, rows });
        this.cols = cols;
        this.rows = rows;
      }

      close() {
        this.closed = true;
      }
    };

    // Mock Bun.spawn
    (Bun as any).spawn = mock((_cmd: string[], _opts: any) => {
      let _resolve: (code: number) => void;
      const exited = new Promise<number>((resolve) => {
        _resolve = resolve;
      });
      const proc = {
        killed: false,
        pid: 12345,
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

  it('Windows shells are in allowlist', () => {
    const onData = mock((_data: string) => {});

    // cmd.exe
    expect(() =>
      manager.create('test-cmd', {
        shell: 'cmd.exe',
        cwd: 'C:\\Users\\user',
        cols: 80,
        rows: 24,
        onData,
      }),
    ).not.toThrow();
    expect(mockSpawnedProcesses).toHaveLength(1);

    // powershell.exe
    expect(() =>
      manager.create('test-powershell', {
        shell: 'powershell.exe',
        cwd: 'C:\\Users\\user',
        cols: 80,
        rows: 24,
        onData,
      }),
    ).not.toThrow();
    expect(mockSpawnedProcesses).toHaveLength(2);

    // pwsh.exe
    expect(() =>
      manager.create('test-pwsh', {
        shell: 'pwsh.exe',
        cwd: 'C:\\Users\\user',
        cols: 80,
        rows: 24,
        onData,
      }),
    ).not.toThrow();
    expect(mockSpawnedProcesses).toHaveLength(3);
  });

  it('create() uses COMSPEC on Windows', () => {
    const originalComspec = process.env.COMSPEC;
    // Use forward-slash path so basename() works on the Linux test runner
    // (on real Windows, basename uses '\' as separator)
    process.env.COMSPEC = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';

    const onData = mock((_data: string) => {});
    manager.create('test-comspec', {
      // No shell option provided → should fall back to COMSPEC
      cwd: 'C:\\Users\\user',
      cols: 80,
      rows: 24,
      onData,
    });

    // The manager takes basename(COMSPEC) as the shell name
    expect((Bun as any).spawn).toHaveBeenCalledWith(
      ['powershell.exe'],
      expect.objectContaining({ cwd: 'C:\\Users\\user' }),
    );

    process.env.COMSPEC = originalComspec;
  });

  it('resize() does not send SIGWINCH on Windows', () => {
    const originalKill = process.kill;
    const mockKill = mock((_pid: number, _signal: string) => {});
    process.kill = mockKill as any;

    const onData = mock((_data: string) => {});
    manager.create('test-resize-win', {
      shell: 'cmd.exe',
      cwd: 'C:\\Users\\user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.resize('test-resize-win', 120, 40);

    // Terminal.resize() should be called
    expect(mockTerminalInstances[0].resizeCalls).toHaveLength(1);
    expect(mockTerminalInstances[0].resizeCalls[0]).toEqual({ cols: 120, rows: 40 });

    // But process.kill should NOT have been called with SIGWINCH
    expect(mockKill).not.toHaveBeenCalled();

    process.kill = originalKill;
  });

  it('Windows fallback order is correct', () => {
    // When no shell is specified and COMSPEC is not set, the manager should
    // default to 'cmd.exe' (basename of the COMSPEC fallback 'cmd.exe').
    const originalComspec = process.env.COMSPEC;
    delete process.env.COMSPEC;

    const onData = mock((_data: string) => {});
    manager.create('test-fallback-order', {
      cwd: 'C:\\Users\\user',
      cols: 80,
      rows: 24,
      onData,
    });

    // With COMSPEC unset, basename('cmd.exe') === 'cmd.exe' which is the
    // first entry in WINDOWS_FALLBACK.
    expect((Bun as any).spawn).toHaveBeenCalledWith(
      ['cmd.exe'],
      expect.objectContaining({ cwd: 'C:\\Users\\user' }),
    );

    expect(mockSpawnedProcesses).toHaveLength(1);

    process.env.COMSPEC = originalComspec;
  });
});
