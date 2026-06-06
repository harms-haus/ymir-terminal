/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type */
import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { PTYManager } from './manager';
import { toBase64 } from '@ymir/shared';

// Mock existsSync is injected via PTYManager's deps parameter to avoid
// process-scoped mock.module('node:fs') contamination across test files.
const mockExistsSync = mock((_path: string) => true);

// ---------------------------------------------------------------------------
// Shared helpers for safe Bun global mocking
// ---------------------------------------------------------------------------

interface MockTerminalInstance {
  cols: number;
  rows: number;
  dataCallback: Function;
  written: Buffer[];
  resizeOpts: { cols: number; rows: number } | null;
  resizeCalls: { cols: number; rows: number }[];
  closed: boolean;
  write(data: Buffer): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

/**
 * Factory that builds a MockTerminal class wired to `instances`.
 * Each new mock terminal pushes itself into `instances` for inspection.
 */
function createMockTerminalClass(
  instances: MockTerminalInstance[],
): new (opts: any) => MockTerminalInstance {
  return class MockTerminal {
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
      instances.push(this as MockTerminalInstance);
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
  } as unknown as new (opts: any) => MockTerminalInstance;
}

/**
 * Safely install mocks for `Bun.Terminal` and `Bun.spawn`, returning a
 * `restore` function that is guaranteed to undo every overwrite even if
 * one of the assignments throws.
 *
 * Pattern:
 * ```ts
 *   const { restore } = safeInstallBunMocks(TerminalCls, spawnFn);
 *   try { /* test body *\/ } finally { restore(); }
 * ```
 */
function safeInstallBunMocks(TerminalImpl: any, SpawnImpl: any): { restore: () => void } {
  const saved = {
    Terminal: (Bun as any).Terminal,
    spawn: (Bun as any).spawn,
  };
  try {
    (Bun as any).Terminal = TerminalImpl;
    (Bun as any).spawn = SpawnImpl;
  } catch (e) {
    // If the second assignment fails, roll back the first.
    (Bun as any).Terminal = saved.Terminal;
    (Bun as any).spawn = saved.spawn;
    throw e;
  }
  return {
    restore() {
      (Bun as any).Terminal = saved.Terminal;
      (Bun as any).spawn = saved.spawn;
    },
  };
}

/**
 * Build the default `Bun.spawn` mock that tracks spawned processes.
 */
function createMockSpawn(spawned: any[]): any {
  return mock((_cmd: string[], _opts: any) => {
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
    spawned.push(proc);
    return proc;
  });
}

describe('PTYManager', () => {
  let manager: PTYManager;
  let mockTerminalInstances: MockTerminalInstance[];
  let mockSpawnedProcesses: any[];
  let restore: () => void;

  beforeEach(() => {
    manager = new PTYManager('linux', { existsSync: mockExistsSync });
    mockTerminalInstances = [];
    mockSpawnedProcesses = [];

    // Reset existsSync mock to default (all shells exist)
    mockExistsSync.mockImplementation((_path: string) => true);

    // Install Bun.Terminal and Bun.spawn mocks safely.
    // safeInstallBunMocks captures originals and rolls back if any
    // assignment fails, preventing cross-test contamination.
    const result = safeInstallBunMocks(
      createMockTerminalClass(mockTerminalInstances),
      createMockSpawn(mockSpawnedProcesses),
    );
    restore = result.restore;
  });

  afterEach(() => {
    restore();
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

  it('resize() throws for invalid dimensions (NaN)', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-invalid-nan', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect(() => manager.resize('test-invalid-nan', NaN, 24)).toThrow(
      'Invalid terminal dimensions: NaNx24',
    );
  });

  it('resize() throws for invalid dimensions (zero)', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-invalid-zero', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect(() => manager.resize('test-invalid-zero', 80, 0)).toThrow(
      'Invalid terminal dimensions: 80x0',
    );
  });

  it('resize() throws for invalid dimensions (negative)', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-invalid-neg', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect(() => manager.resize('test-invalid-neg', -1, 24)).toThrow(
      'Invalid terminal dimensions: -1x24',
    );
  });

  it('resize() throws for invalid dimensions (Infinity)', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-invalid-inf', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect(() => manager.resize('test-invalid-inf', Infinity, 24)).toThrow(
      'Invalid terminal dimensions: Infinityx24',
    );
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

  // -----------------------------------------------------------------------
  // Process exit edge-case tests
  // -----------------------------------------------------------------------

  it('kill() properly cleans up: terminal is removed, closed, and process killed', () => {
    const onData = mock((_data: string) => {});
    manager.create('cleanup-test', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    // Verify terminal exists before kill
    expect(manager.has('cleanup-test')).toBe(true);
    expect(manager.has('cleanup-test')).toBe(true);

    manager.kill('cleanup-test');

    // Terminal should be fully removed from the map
    expect(manager.has('cleanup-test')).toBe(false);

    // Terminal should be closed and process killed
    expect(mockTerminalInstances[0].closed).toBe(true);
    expect(mockSpawnedProcesses[0].killed).toBe(true);
  });

  it('write() after kill() throws terminal not found', () => {
    const onData = mock((_data: string) => {});
    manager.create('write-after-kill', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.kill('write-after-kill');

    expect(() => manager.write('write-after-kill', toBase64('data'))).toThrow(
      'Terminal write-after-kill not found',
    );
  });

  it('resize() after kill() throws terminal not found', () => {
    const onData = mock((_data: string) => {});
    manager.create('resize-after-kill', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.kill('resize-after-kill');

    expect(() => manager.resize('resize-after-kill', 120, 40)).toThrow(
      'Terminal resize-after-kill not found',
    );
  });

  // -----------------------------------------------------------------------
  // Output buffering tests
  // -----------------------------------------------------------------------

  it('create() buffers output when data callback fires', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-buffer', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    const terminal = mockTerminalInstances[0];
    const testData = Buffer.from('hello world');
    terminal.dataCallback(terminal, testData);

    const snapshot = manager.getBufferSnapshot('test-buffer');
    expect(snapshot).not.toBeNull();
    expect(new TextDecoder().decode(snapshot!)).toBe('hello world');
  });

  it('getBufferSnapshot returns accumulated data from multiple data callbacks', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-buffer-multi', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    const terminal = mockTerminalInstances[0];
    terminal.dataCallback(terminal, Buffer.from('hello '));
    terminal.dataCallback(terminal, Buffer.from('world'));
    terminal.dataCallback(terminal, Buffer.from('!'));

    const snapshot = manager.getBufferSnapshot('test-buffer-multi');
    expect(snapshot).not.toBeNull();
    expect(new TextDecoder().decode(snapshot!)).toBe('hello world!');
  });

  it('getBufferSnapshot does not drain the buffer — calling twice returns same data', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-buffer-persist', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    const terminal = mockTerminalInstances[0];
    terminal.dataCallback(terminal, Buffer.from('persistent'));

    const snap1 = manager.getBufferSnapshot('test-buffer-persist');
    const snap2 = manager.getBufferSnapshot('test-buffer-persist');

    expect(snap1).not.toBeNull();
    expect(snap2).not.toBeNull();
    expect(new TextDecoder().decode(snap1!)).toBe('persistent');
    expect(new TextDecoder().decode(snap2!)).toBe('persistent');
  });

  it('getBufferSnapshot returns null for unknown id', () => {
    expect(manager.getBufferSnapshot('nonexistent')).toBeNull();
  });

  it('setOutputTarget replaces onData callback — new callback receives data', async () => {
    const originalOnData = mock((_data: string) => {});
    manager.create('test-switch', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData: originalOnData,
    });

    // Fire data with original callback
    const terminal = mockTerminalInstances[0];
    terminal.dataCallback(terminal, Buffer.from('before'));
    expect(originalOnData).toHaveBeenCalledTimes(1);

    // Switch output target
    const newOnData = mock((_data: string) => {});
    manager.setOutputTarget('test-switch', newOnData);

    // Fire data with new callback
    terminal.dataCallback(terminal, Buffer.from('after'));
    expect(originalOnData).toHaveBeenCalledTimes(1); // not called again
    expect(newOnData).toHaveBeenCalledTimes(1);

    const encoded = newOnData.mock.calls[0][0] as string;
    expect(encoded).toBe(toBase64(Buffer.from('after')));
  });

  it('setOutputTarget also replaces onExit callback', async () => {
    const originalOnExit = mock((_code: number | null) => {});
    const onData = mock((_data: string) => {});
    manager.create('test-switch-exit', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
      onExit: originalOnExit,
    });

    const newOnExit = mock((_code: number | null) => {});
    manager.setOutputTarget('test-switch-exit', onData, newOnExit);

    // Simulate process exit
    mockSpawnedProcesses[0]._resolve();
    // Allow microtask queue to flush
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(originalOnExit).not.toHaveBeenCalled();
    expect(newOnExit).toHaveBeenCalledTimes(1);
    expect(newOnExit.mock.calls[0][0]).toBe(0);
  });

  it('setOutputTarget is a no-op for nonexistent terminal', () => {
    const newOnData = mock((_data: string) => {});
    // Should not throw
    manager.setOutputTarget('nonexistent', newOnData);
    expect(newOnData).not.toHaveBeenCalled();
  });

  it('setOutputTarget preserves ring buffer wrapping — data is still buffered', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-switch-buffer', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    const terminal = mockTerminalInstances[0];
    terminal.dataCallback(terminal, Buffer.from('before-switch'));

    const newOnData = mock((_data: string) => {});
    manager.setOutputTarget('test-switch-buffer', newOnData);

    terminal.dataCallback(terminal, Buffer.from('after-switch'));

    // Both chunks should be in the buffer
    const snapshot = manager.getBufferSnapshot('test-switch-buffer');
    expect(new TextDecoder().decode(snapshot!)).toBe('before-switchafter-switch');
  });

  it('hasExited returns false for live terminal', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-live', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect(manager.hasExited('test-live')).toBe(false);
  });

  it('hasExited returns true for unknown id', () => {
    expect(manager.hasExited('nonexistent')).toBe(true);
  });

  it('hasExited returns true after simulated process exit', async () => {
    const onData = mock((_data: string) => {});
    manager.create('test-exit-state', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    expect(manager.hasExited('test-exit-state')).toBe(false);

    // Simulate process exit
    mockSpawnedProcesses[0]._resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(manager.hasExited('test-exit-state')).toBe(true);
  });

  it('getDimensions returns correct values from lastCols/lastRows', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-dims', {
      cwd: '/home/user',
      cols: 120,
      rows: 40,
      onData,
    });

    expect(manager.getDimensions('test-dims')).toEqual({ cols: 120, rows: 40 });
  });

  it('getDimensions returns updated values after resize', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-dims-resize', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    manager.resize('test-dims-resize', 200, 50);
    expect(manager.getDimensions('test-dims-resize')).toEqual({ cols: 200, rows: 50 });
  });

  it('getDimensions returns null for nonexistent terminal', () => {
    expect(manager.getDimensions('nonexistent')).toBeNull();
  });

  it('kill() removes buffer from active buffers', () => {
    const onData = mock((_data: string) => {});
    manager.create('test-kill-buffer', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    // Write some data to buffer
    const terminal = mockTerminalInstances[0];
    terminal.dataCallback(terminal, Buffer.from('some data'));
    expect(manager.getBufferSnapshot('test-kill-buffer')).not.toBeNull();

    manager.kill('test-kill-buffer');

    // Terminal is removed from the active map
    expect(manager.has('test-kill-buffer')).toBe(false);
    // But buffer data is preserved in exitedBuffers for snapshot access
    const snapshot = manager.getBufferSnapshot('test-kill-buffer');
    expect(snapshot).not.toBeNull();
    expect(new TextDecoder().decode(snapshot!)).toBe('some data');
  });

  it('killAll() removes all buffers from active buffers', () => {
    const onData = mock((_data: string) => {});
    manager.create('killall-buf-1', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });
    manager.create('killall-buf-2', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    // Write data to both
    mockTerminalInstances[0].dataCallback(mockTerminalInstances[0], Buffer.from('data1'));
    mockTerminalInstances[1].dataCallback(mockTerminalInstances[1], Buffer.from('data2'));

    expect(manager.getBufferSnapshot('killall-buf-1')).not.toBeNull();
    expect(manager.getBufferSnapshot('killall-buf-2')).not.toBeNull();

    manager.killAll();

    // Terminals are removed from the active map
    expect(manager.has('killall-buf-1')).toBe(false);
    expect(manager.has('killall-buf-2')).toBe(false);
    // But buffer data is preserved in exitedBuffers for snapshot access
    const snap1 = manager.getBufferSnapshot('killall-buf-1');
    const snap2 = manager.getBufferSnapshot('killall-buf-2');
    expect(snap1).not.toBeNull();
    expect(snap2).not.toBeNull();
    expect(new TextDecoder().decode(snap1!)).toBe('data1');
    expect(new TextDecoder().decode(snap2!)).toBe('data2');
  });

  it('after simulated process exit, buffer is still accessible via getBufferSnapshot', async () => {
    const onData = mock((_data: string) => {});
    manager.create('test-exit-buffer', {
      cwd: '/home/user',
      cols: 80,
      rows: 24,
      onData,
    });

    const terminal = mockTerminalInstances[0];
    terminal.dataCallback(terminal, Buffer.from('before-exit'));

    // Simulate process exit
    mockSpawnedProcesses[0]._resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Buffer should still be accessible (moved to exitedBuffers)
    const snapshot = manager.getBufferSnapshot('test-exit-buffer');
    expect(snapshot).not.toBeNull();
    expect(new TextDecoder().decode(snapshot!)).toBe('before-exit');
  });

  it('after simulated process exit, getDimensions returns last known dimensions', async () => {
    const onData = mock((_data: string) => {});
    manager.create('test-exit-dims', {
      cwd: '/home/user',
      cols: 90,
      rows: 30,
      onData,
    });

    manager.resize('test-exit-dims', 150, 45);

    // Simulate process exit
    mockSpawnedProcesses[0]._resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Dimensions should still be available from exitedBuffers
    expect(manager.getDimensions('test-exit-dims')).toEqual({ cols: 150, rows: 45 });
  });
});

describe('PTYManager (win32)', () => {
  let manager: PTYManager;
  let mockTerminalInstances: MockTerminalInstance[];
  let mockSpawnedProcesses: any[];
  let restore: () => void;

  beforeEach(() => {
    manager = new PTYManager('win32', { existsSync: mockExistsSync });
    mockTerminalInstances = [];
    mockSpawnedProcesses = [];

    // Reset existsSync mock to default (all shells exist)
    mockExistsSync.mockImplementation((_path: string) => true);

    const result = safeInstallBunMocks(
      createMockTerminalClass(mockTerminalInstances),
      createMockSpawn(mockSpawnedProcesses),
    );
    restore = result.restore;
  });

  afterEach(() => {
    restore();
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
    process.kill = mockProcessKill as unknown as typeof process.kill;
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
