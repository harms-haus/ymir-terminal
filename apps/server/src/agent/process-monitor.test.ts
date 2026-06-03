// ---------------------------------------------------------------------------
// ProcessMonitor tests
// ---------------------------------------------------------------------------

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Module-level mocks
//
// mock.module('node:fs/promises') is called at module scope so that the
// mocked readFile is used by process-monitor.ts when it reads
// /proc/[pid]/stat. The mock returns a stat string with zero CPU time by
// default; individual tests can override via mockReadFile.mockImplementation().
// ---------------------------------------------------------------------------

const mockReadFile = mock(async (_path: string): Promise<string> => {
  // Default: utime=0, stime=0 → totalJiffies=0 → idle on first poll
  // Fields: pid comm state ppid ... utime stime ...
  // Index:   0    1    2    3    ...  13    14
  return '0 (agent) S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0';
});
mock.module('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

// ---------------------------------------------------------------------------
// Imports (must come after mock.module per Bun's mock.module semantics)
// ---------------------------------------------------------------------------

import {
  type ProcessEntry,
  getProcessSnapshot,
  getDescendants,
  isAgent,
  ProcessMonitor,
} from './process-monitor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a parent→children index from a process map (same logic as the
 * production code inside poll()).
 */
function buildChildrenOf(map: Map<number, ProcessEntry>): Map<number, ProcessEntry[]> {
  const childrenOf = new Map<number, ProcessEntry[]>();
  for (const entry of map.values()) {
    const siblings = childrenOf.get(entry.ppid);
    if (siblings) siblings.push(entry);
    else childrenOf.set(entry.ppid, [entry]);
  }
  return childrenOf;
}

/**
 * Create a ReadableStream that yields the given text as UTF-8 bytes,
 * simulating what Bun.spawn's stdout pipe produces.
 */
function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

/**
 * Store the original Bun.spawn before any test overrides it.
 * afterEach restores it so mocks never leak between tests.
 */
let originalSpawn: unknown;

beforeEach(() => {
  originalSpawn = (Bun as Record<string, unknown>).spawn;
});

afterEach(() => {
  (Bun as Record<string, unknown>).spawn = originalSpawn;
  mockReadFile.mockClear();
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('getProcessSnapshot', () => {
  test('parses fake ps output correctly', async () => {
    const fakeOutput = [
      '  100     1 bash             /bin/bash',
      '  200   100 node             node /usr/local/bin/claude',
      '  201   100 git              git status',
      '',
    ].join('\n');

    (Bun as Record<string, unknown>).spawn = mock(() => ({
      stdout: streamFromText(fakeOutput),
      exited: Promise.resolve(0),
    }));

    const snapshot = await getProcessSnapshot();

    expect(snapshot.size).toBe(3);
    expect(snapshot.get(100)).toEqual({
      pid: 100,
      ppid: 1,
      comm: 'bash',
      args: '/bin/bash',
    });
    expect(snapshot.get(200)).toEqual({
      pid: 200,
      ppid: 100,
      comm: 'node',
      args: 'node /usr/local/bin/claude',
    });
    expect(snapshot.get(201)).toEqual({
      pid: 201,
      ppid: 100,
      comm: 'git',
      args: 'git status',
    });
  });

  test('returns empty map for empty ps output', async () => {
    (Bun as Record<string, unknown>).spawn = mock(() => ({
      stdout: streamFromText(''),
      exited: Promise.resolve(0),
    }));

    const snapshot = await getProcessSnapshot();
    expect(snapshot.size).toBe(0);
  });
});

describe('getDescendants', () => {
  test('builds correct tree from flat map', () => {
    const map = new Map<number, ProcessEntry>([
      [1, { pid: 1, ppid: 0, comm: 'init', args: '/sbin/init' }],
      [100, { pid: 100, ppid: 1, comm: 'bash', args: '/bin/bash' }],
      [200, { pid: 200, ppid: 100, comm: 'node', args: 'node server.js' }],
      [201, { pid: 201, ppid: 100, comm: 'git', args: 'git status' }],
      [300, { pid: 300, ppid: 200, comm: 'claude', args: 'claude' }],
    ]);

    const childrenOf = buildChildrenOf(map);
    const descendants = getDescendants(100, childrenOf);

    expect(descendants).toHaveLength(3);
    const pids = descendants.map((d) => d.pid).sort();
    expect(pids).toEqual([200, 201, 300]);
  });

  test('returns empty array when root has no children', () => {
    const map = new Map<number, ProcessEntry>([
      [1, { pid: 1, ppid: 0, comm: 'init', args: '/sbin/init' }],
    ]);

    const childrenOf = buildChildrenOf(map);
    const descendants = getDescendants(1, childrenOf);
    expect(descendants).toHaveLength(0);
  });

  test('handles missing root PID gracefully', () => {
    const map = new Map<number, ProcessEntry>([
      [1, { pid: 1, ppid: 0, comm: 'init', args: '/sbin/init' }],
    ]);

    const childrenOf = buildChildrenOf(map);
    const descendants = getDescendants(999, childrenOf);
    expect(descendants).toHaveLength(0);
  });
});

describe('isAgent', () => {
  test('matches known agents by comm name', () => {
    for (const name of ['claude', 'opencode', 'pi', 'aider', 'codex']) {
      const entry: ProcessEntry = { pid: 1, ppid: 0, comm: name, args: name };
      expect(isAgent(entry)).toBe(name);
    }
  });

  test('matches agents by args when comm is node/bun', () => {
    const nodeEntry: ProcessEntry = {
      pid: 1,
      ppid: 0,
      comm: 'node',
      args: 'node /usr/local/bin/claude',
    };
    expect(isAgent(nodeEntry)).toBe('claude');

    const bunEntry: ProcessEntry = {
      pid: 2,
      ppid: 0,
      comm: 'bun',
      args: 'bun run opencode',
    };
    expect(isAgent(bunEntry)).toBe('opencode');

    const piEntry: ProcessEntry = {
      pid: 3,
      ppid: 0,
      comm: 'node',
      args: 'node pi-coding-agent',
    };
    expect(isAgent(piEntry)).toBe('pi-coding-agent');

    const aiderEntry: ProcessEntry = {
      pid: 4,
      ppid: 0,
      comm: 'node',
      args: 'node /usr/local/bin/aider',
    };
    expect(isAgent(aiderEntry)).toBe('aider');

    const codexEntry: ProcessEntry = {
      pid: 5,
      ppid: 0,
      comm: 'bun',
      args: 'bun codex --serve',
    };
    expect(isAgent(codexEntry)).toBe('codex');
  });

  test('returns null for non-agent processes', () => {
    const bash: ProcessEntry = { pid: 1, ppid: 0, comm: 'bash', args: '/bin/bash' };
    expect(isAgent(bash)).toBeNull();

    const git: ProcessEntry = { pid: 2, ppid: 0, comm: 'git', args: 'git status' };
    expect(isAgent(git)).toBeNull();

    const ls: ProcessEntry = { pid: 3, ppid: 0, comm: 'ls', args: 'ls -la' };
    expect(isAgent(ls)).toBeNull();

    // node without agent args
    const node: ProcessEntry = { pid: 4, ppid: 0, comm: 'node', args: 'node server.js' };
    expect(isAgent(node)).toBeNull();

    // bun without agent args
    const bun: ProcessEntry = { pid: 5, ppid: 0, comm: 'bun', args: 'bun run build' };
    expect(isAgent(bun)).toBeNull();
  });

  test('is case-sensitive for comm matching', () => {
    const entry: ProcessEntry = { pid: 1, ppid: 0, comm: 'Claude', args: 'Claude' };
    // 'Claude' does not match /^claude$/
    expect(isAgent(entry)).toBeNull();
  });
});

describe('ProcessMonitor', () => {
  // -----------------------------------------------------------------------
  // Terminal tracking
  // -----------------------------------------------------------------------

  describe('trackTerminal / untrackTerminal', () => {
    test('trackTerminal adds a terminal to the tracked map', () => {
      const callback = mock();
      const monitor = new ProcessMonitor(callback);

      expect(
        (monitor as unknown as { trackedTerminals: Map<string, number> }).trackedTerminals.size,
      ).toBe(0);

      monitor.trackTerminal('term-1', 100);
      expect(
        (monitor as unknown as { trackedTerminals: Map<string, number> }).trackedTerminals.size,
      ).toBe(1);
      expect(
        (monitor as unknown as { trackedTerminals: Map<string, number> }).trackedTerminals.get(
          'term-1',
        ),
      ).toBe(100);
    });

    test('untrackTerminal removes a terminal from the tracked map', () => {
      const callback = mock();
      const monitor = new ProcessMonitor(callback);

      monitor.trackTerminal('term-1', 100);
      monitor.trackTerminal('term-2', 200);
      expect(
        (monitor as unknown as { trackedTerminals: Map<string, number> }).trackedTerminals.size,
      ).toBe(2);

      monitor.untrackTerminal('term-1');
      expect(
        (monitor as unknown as { trackedTerminals: Map<string, number> }).trackedTerminals.size,
      ).toBe(1);
      expect(
        (monitor as unknown as { trackedTerminals: Map<string, number> }).trackedTerminals.has(
          'term-2',
        ),
      ).toBe(true);
    });

    test('untrackTerminal no-ops for unknown terminal', () => {
      const callback = mock();
      const monitor = new ProcessMonitor(callback);

      monitor.trackTerminal('term-1', 100);
      monitor.untrackTerminal('unknown');
      expect(
        (monitor as unknown as { trackedTerminals: Map<string, number> }).trackedTerminals.size,
      ).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Poll cycles
  // -----------------------------------------------------------------------

  describe('poll', () => {
    test('detects agent and calls callback', async () => {
      const fakePsOutput = [
        '  100     1 bash             /bin/bash',
        '  200   100 node             node /usr/local/bin/claude',
      ].join('\n');

      (Bun as Record<string, unknown>).spawn = mock(() => ({
        stdout: streamFromText(fakePsOutput),
        exited: Promise.resolve(0),
      }));

      // Return stat with non-zero CPU time for activity detection
      mockReadFile.mockImplementation(async (_path: string): Promise<string> => {
        // utime=100, stime=50 → totalJiffies=150
        return '0 (agent) S 0 0 0 0 0 0 0 0 0 0 100 50 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0';
      });

      const callback = mock();
      const monitor = new ProcessMonitor(callback);
      monitor.trackTerminal('term-1', 100);
      await monitor.poll();

      expect(callback).toHaveBeenCalledTimes(1);
      const [terminalId, agentPresent, , agentName] = callback.mock.calls[0];
      expect(terminalId).toBe('term-1');
      expect(agentPresent).toBe(true);
      expect(agentName).toBe('claude');
    });

    test('detects no agent and calls callback with false', async () => {
      const fakePsOutput = [
        '  100     1 bash             /bin/bash',
        '  101   100 git              git status',
      ].join('\n');

      (Bun as Record<string, unknown>).spawn = mock(() => ({
        stdout: streamFromText(fakePsOutput),
        exited: Promise.resolve(0),
      }));

      const callback = mock();
      const monitor = new ProcessMonitor(callback);
      monitor.trackTerminal('term-1', 100);
      await monitor.poll();

      expect(callback).toHaveBeenCalledTimes(1);
      const [terminalId, agentPresent, agentActive, agentName] = callback.mock.calls[0];
      expect(terminalId).toBe('term-1');
      expect(agentPresent).toBe(false);
      expect(agentActive).toBe(false);
      expect(agentName).toBeUndefined();
    });

    test('reports agent as active when CPU time increases between polls', async () => {
      const fakePsOutput = [
        '  100     1 bash             /bin/bash',
        '  200   100 node             node /usr/local/bin/claude',
      ].join('\n');

      (Bun as Record<string, unknown>).spawn = mock(() => ({
        stdout: streamFromText(fakePsOutput),
        exited: Promise.resolve(0),
      }));

      // Track calls to readFile so we can return different values
      let callCount = 0;
      mockReadFile.mockImplementation(async (_path: string): Promise<string> => {
        callCount++;
        if (callCount === 1) {
          // First poll: utime=100, stime=50 → totalJiffies=150 (baseline)
          return '0 (agent) S 0 0 0 0 0 0 0 0 0 0 100 50 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0';
        }
        // Second poll: utime=200, stime=75 → totalJiffies=275 (increased → active)
        return '0 (agent) S 0 0 0 0 0 0 0 0 0 0 200 75 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0';
      });

      const callback = mock();
      const monitor = new ProcessMonitor(callback);
      monitor.trackTerminal('term-1', 100);

      // First poll – establishes baseline (agent idle)
      await monitor.poll();
      // Second poll – CPU increased → agent active
      await monitor.poll();

      expect(callback).toHaveBeenCalledTimes(2);

      // First call: baseline, agent present but idle
      expect(callback.mock.calls[0][0]).toBe('term-1');
      expect(callback.mock.calls[0][1]).toBe(true);
      expect(callback.mock.calls[0][3]).toBe('claude');

      // Second call: agent present and active
      expect(callback.mock.calls[1][0]).toBe('term-1');
      expect(callback.mock.calls[1][1]).toBe(true);
      expect(callback.mock.calls[1][2]).toBe(true);
      expect(callback.mock.calls[1][3]).toBe('claude');
    });

    test('falls back to active when /proc is unavailable', async () => {
      const fakePsOutput = [
        '  100     1 bash             /bin/bash',
        '  200   100 node             node /usr/local/bin/claude',
      ].join('\n');

      (Bun as Record<string, unknown>).spawn = mock(() => ({
        stdout: streamFromText(fakePsOutput),
        exited: Promise.resolve(0),
      }));

      // Simulate /proc not available (rejected promise)
      mockReadFile.mockImplementation(async (_path: string): Promise<string> => {
        throw new Error('ENOENT: no such file');
      });

      const callback = mock();
      const monitor = new ProcessMonitor(callback);
      monitor.trackTerminal('term-1', 100);
      await monitor.poll();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toBe('term-1');
      expect(callback.mock.calls[0][1]).toBe(true);
      // Falls back to active = true
      expect(callback.mock.calls[0][2]).toBe(true);
      expect(callback.mock.calls[0][3]).toBe('claude');
    });

    test('handles multiple tracked terminals independently', async () => {
      const fakePsOutput = [
        '  100     1 bash             /bin/bash',
        '  200   100 node             node /usr/local/bin/claude',
        '  300     1 zsh              /usr/bin/zsh',
        '  301   300 git              git log',
      ].join('\n');

      (Bun as Record<string, unknown>).spawn = mock(() => ({
        stdout: streamFromText(fakePsOutput),
        exited: Promise.resolve(0),
      }));

      const callback = mock();
      const monitor = new ProcessMonitor(callback);
      monitor.trackTerminal('term-1', 100); // has agent descendant
      monitor.trackTerminal('term-2', 300); // no agent descendant
      await monitor.poll();

      // term-1: agent present
      // term-2: no agent
      expect(callback).toHaveBeenCalledTimes(2);

      const call1 = callback.mock.calls.find((c: unknown[]) => c[0] === 'term-1');
      const call2 = callback.mock.calls.find((c: unknown[]) => c[0] === 'term-2');

      expect(call1).toBeDefined();
      expect(call1![1]).toBe(true);

      expect(call2).toBeDefined();
      expect(call2![1]).toBe(false);
      expect(call2![2]).toBe(false);
      expect(call2![3]).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('start / stop', () => {
    test('start and stop manage the interval and state', () => {
      const callback = mock();
      const monitor = new ProcessMonitor(callback);

      // Track a terminal and set some prevCpuTimes state
      monitor.trackTerminal('term-1', 100);
      (monitor as unknown as { prevCpuTimes: Map<number, number> }).prevCpuTimes.set(200, 150);

      // Mock the globals
      const origSetTimeout = globalThis.setTimeout;
      const origClearTimeout = globalThis.clearTimeout;
      const fakeTimerId = 123 as unknown as ReturnType<typeof setTimeout>;
      const mockSetTimeout = mock((_fn: (...args: unknown[]) => void, _ms: number) => fakeTimerId);
      const mockClearTimeout = mock((_id: unknown) => {});
      globalThis.setTimeout = mockSetTimeout as unknown as typeof globalThis.setTimeout;
      globalThis.clearTimeout = mockClearTimeout as unknown as typeof globalThis.clearTimeout;

      try {
        // Initially no timeout
        expect(
          (monitor as unknown as { intervalId: ReturnType<typeof setTimeout> | null }).intervalId,
        ).toBeNull();

        monitor.start();
        expect(mockSetTimeout).toHaveBeenCalledTimes(1);
        expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
        expect(
          (monitor as unknown as { intervalId: ReturnType<typeof setTimeout> | null }).intervalId,
        ).toBe(fakeTimerId);

        // Second start should be a no-op
        monitor.start();
        expect(mockSetTimeout).toHaveBeenCalledTimes(1);

        monitor.stop();
        expect(mockClearTimeout).toHaveBeenCalledWith(fakeTimerId);
        expect(
          (monitor as unknown as { intervalId: ReturnType<typeof setTimeout> | null }).intervalId,
        ).toBeNull();
        expect(
          (monitor as unknown as { trackedTerminals: Map<string, number> }).trackedTerminals.size,
        ).toBe(0);
        expect(
          (monitor as unknown as { prevCpuTimes: Map<number, number> }).prevCpuTimes.size,
        ).toBe(0);
      } finally {
        globalThis.setTimeout = origSetTimeout;
        globalThis.clearTimeout = origClearTimeout;
      }
    });

    test('stop is a no-op when not started', () => {
      const callback = mock();
      const monitor = new ProcessMonitor(callback);

      // Should not throw
      monitor.stop();
    });

    test('poll with no tracked terminals does not call callback', async () => {
      (Bun as Record<string, unknown>).spawn = mock(() => ({
        stdout: streamFromText(''),
        exited: Promise.resolve(0),
      }));

      const callback = mock();
      const monitor = new ProcessMonitor(callback);
      await monitor.poll();
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
