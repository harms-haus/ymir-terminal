import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { join } from 'node:path';
import type { GitStatusResponse } from '@ymir/shared';
import type { GitStatusCache } from './status-cache';
import { GitStatusWatcher, DEBOUNCE_MS } from './status-watcher';

// ---------------------------------------------------------------------------
// Mock node:fs — intercept watch before status-watcher is loaded
// ---------------------------------------------------------------------------

type WatchCallback = (eventType: string, filename: string | null) => void;

export interface MockWatcher {
  close: ReturnType<typeof mock>;
  _callback: WatchCallback;
}

export const mockWatchers: MockWatcher[] = [];

/** Track the (path, opts) arguments each watch() was called with. */
export const mockWatchCalls: Array<{ path: string; optsOrCb?: unknown }> = [];

mock.module('node:fs', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
  const real = require('node:fs') as typeof import('node:fs');
  return {
    ...real,
    watch: mock((path: string, optsOrCb?: unknown, cb?: unknown): MockWatcher => {
      const callback =
        typeof optsOrCb === 'function' ? (optsOrCb as WatchCallback) : (cb as WatchCallback);
      const w: MockWatcher = {
        close: mock(() => {}),
        _callback: callback,
      };
      mockWatchers.push(w);
      mockWatchCalls.push({ path, optsOrCb });
      return w;
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatus(branch = 'main'): GitStatusResponse {
  return {
    branch,
    changes: [],
    staged: [],
    hasRemote: false,
    ahead: 0,
    behind: 0,
  };
}

/**
 * Minimal mock for GitStatusCache — only the methods the watcher uses.
 */
function makeMockCache(overrides: Partial<GitStatusCache> = {}): GitStatusCache {
  return {
    get: mock(() => undefined),
    set: mock(() => {}),
    has: mock(() => false),
    getAge: mock(() => undefined),
    invalidate: mock(() => {}),
    invalidateAll: mock(() => {}),
    isFresh: mock(() => false),
    getOrCreate: mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
      return factory();
    }),
    ...overrides,
  } as unknown as GitStatusCache;
}

/** A short safety-poll interval for tests that exercise the poll. */
const TEST_POLL_MS = 100;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitStatusWatcher', () => {
  let cache: GitStatusCache;
  let watcher: GitStatusWatcher;
  let getStatus: ReturnType<typeof mock>;

  beforeEach(() => {
    mockWatchers.length = 0;
    mockWatchCalls.length = 0;
    cache = makeMockCache();
    getStatus = mock(async () => makeStatus());
    // Disable safety poll by default to avoid interfering with debounce/event tests
    watcher = new GitStatusWatcher({ cache, getStatus, disableSafetyPoll: true });
  });

  afterEach(() => {
    watcher.unwatchAll();
  });

  // -------------------------------------------------------------------
  // watchRepo — watcher setup
  // -------------------------------------------------------------------

  describe('watchRepo', () => {
    it('creates three watchers for a repository', () => {
      watcher.watchRepo('/repo/.git', '/repo');

      // HEAD, refs, and working tree root
      expect(mockWatchers.length).toBe(3);
    });

    it('watches .git/HEAD', () => {
      watcher.watchRepo('/repo/.git', '/repo');

      const headCall = mockWatchCalls.find((c) => c.path === join('/repo/.git', 'HEAD'));
      expect(headCall).toBeDefined();
    });

    it('watches .git/refs with recursive option', () => {
      watcher.watchRepo('/repo/.git', '/repo');

      const refsCall = mockWatchCalls.find((c) => c.path === join('/repo/.git', 'refs'));
      expect(refsCall).toBeDefined();
      expect(refsCall!.optsOrCb).toEqual({ recursive: true });
    });

    it('watches the repo root with recursive option', () => {
      watcher.watchRepo('/repo/.git', '/repo');

      const rootCall = mockWatchCalls.find((c) => c.path === '/repo');
      expect(rootCall).toBeDefined();
      expect(rootCall!.optsOrCb).toEqual({ recursive: true });
    });
  });

  // -------------------------------------------------------------------
  // watchRepo — deduplication
  // -------------------------------------------------------------------

  describe('deduplication', () => {
    it('does not create duplicate watchers when called twice for the same path', () => {
      watcher.watchRepo('/repo/.git', '/repo');
      const countAfterFirst = mockWatchers.length;

      watcher.watchRepo('/repo/.git', '/repo');

      // No additional watchers should have been created
      expect(mockWatchers.length).toBe(countAfterFirst);
    });

    it('creates watchers for different repos independently', () => {
      watcher.watchRepo('/repo-a/.git', '/repo-a');
      watcher.watchRepo('/repo-b/.git', '/repo-b');

      // 3 watchers per repo = 6 total
      expect(mockWatchers.length).toBe(6);
    });
  });

  // -------------------------------------------------------------------
  // Debounce behavior
  // -------------------------------------------------------------------

  describe('debounce', () => {
    it('coalesces rapid scheduleRefresh calls into a single refresh', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      // Fire multiple rapid refreshes
      watcher.scheduleRefresh('/repo/.git');
      watcher.scheduleRefresh('/repo/.git');
      watcher.scheduleRefresh('/repo/.git');

      // Advance past debounce
      await Bun.sleep(DEBOUNCE_MS + 50);

      expect(refreshCount).toBe(1);
    });

    it('triggers refresh after debounce window elapses', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      watcher.scheduleRefresh('/repo/.git');

      // Before debounce fires
      await Bun.sleep(DEBOUNCE_MS / 2);
      expect(refreshCount).toBe(0);

      // After debounce fires
      await Bun.sleep(DEBOUNCE_MS / 2 + 50);
      expect(refreshCount).toBe(1);
    });

    it('fires a second refresh after the first debounce window closes', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      watcher.scheduleRefresh('/repo/.git');
      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);

      watcher.scheduleRefresh('/repo/.git');
      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------
  // refreshNow
  // -------------------------------------------------------------------

  describe('refreshNow', () => {
    it('cancels any pending debounce timer', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      // Schedule a debounced refresh
      watcher.scheduleRefresh('/repo/.git');

      // Immediately refreshNow — should cancel the timer and refresh
      await watcher.refreshNow('/repo/.git');

      expect(refreshCount).toBe(1);

      // Wait past the original debounce window — no additional refresh
      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);
    });

    it('invalidates the cache before refreshing', async () => {
      await watcher.refreshNow('/repo/.git');

      expect(cache.invalidate).toHaveBeenCalledWith('/repo/.git');
    });

    it('still works when no debounce timer is pending', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      await watcher.refreshNow('/repo/.git');
      expect(refreshCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // setStatusChangeHandler
  // -------------------------------------------------------------------

  describe('setStatusChangeHandler', () => {
    it('is called when status differs from last known status', async () => {
      const handler = mock(() => {});
      watcher.setStatusChangeHandler(handler);

      watcher.watchRepo('/repo/.git', '/repo');

      const status1 = makeStatus('main');
      const status2 = makeStatus('feature');

      let callIndex = 0;
      cache.getOrCreate = mock(async (_dir: string, _factory: () => Promise<GitStatusResponse>) => {
        return callIndex++ === 0 ? status1 : status2;
      });

      await watcher.refreshStatus('/repo/.git');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('/repo/.git', status1);

      await watcher.refreshStatus('/repo/.git');
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith('/repo/.git', status2);
    });

    it('is NOT called when status is unchanged', async () => {
      const handler = mock(() => {});
      watcher.setStatusChangeHandler(handler);

      watcher.watchRepo('/repo/.git', '/repo');

      const status = makeStatus('main');
      cache.getOrCreate = mock(async () => status);

      await watcher.refreshStatus('/repo/.git');
      expect(handler).toHaveBeenCalledTimes(1);

      await watcher.refreshStatus('/repo/.git');
      // Same status — should NOT fire again
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires on first refresh (no previous status)', async () => {
      const handler = mock(() => {});
      watcher.setStatusChangeHandler(handler);

      cache.getOrCreate = mock(async () => makeStatus('main'));

      await watcher.refreshStatus('/repo/.git');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------
  // unwatchRepo
  // -------------------------------------------------------------------

  describe('unwatchRepo', () => {
    it('closes all watchers for the repo', () => {
      watcher.watchRepo('/repo/.git', '/repo');
      const watchersBefore = [...mockWatchers];

      watcher.unwatchRepo('/repo/.git');

      for (const w of watchersBefore) {
        expect(w.close).toHaveBeenCalled();
      }
    });

    it('clears pending debounce timer', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');
      watcher.scheduleRefresh('/repo/.git');

      watcher.unwatchRepo('/repo/.git');

      // Wait past debounce — no refresh should fire
      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(0);
    });

    it('is a no-op for a repo that was never watched', () => {
      expect(() => watcher.unwatchRepo('/nonexistent/.git')).not.toThrow();
    });

    it('allows re-watching after unwatching', () => {
      watcher.watchRepo('/repo/.git', '/repo');
      const countAfterFirst = mockWatchers.length;

      watcher.unwatchRepo('/repo/.git');

      watcher.watchRepo('/repo/.git', '/repo');
      // Should have created new watchers (originals were closed)
      expect(mockWatchers.length).toBe(countAfterFirst + 3);
    });
  });

  // -------------------------------------------------------------------
  // unwatchAll
  // -------------------------------------------------------------------

  describe('unwatchAll', () => {
    it('closes all watchers across all repos', () => {
      watcher.watchRepo('/repo-a/.git', '/repo-a');
      watcher.watchRepo('/repo-b/.git', '/repo-b');
      const allWatchers = [...mockWatchers];

      watcher.unwatchAll();

      for (const w of allWatchers) {
        expect(w.close).toHaveBeenCalled();
      }
    });

    it('is safe to call when nothing is watched', () => {
      expect(() => watcher.unwatchAll()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------
  // Safety poll
  // -------------------------------------------------------------------

  describe('safety poll', () => {
    it('starts safety poll on first watchRepo and stops on unwatchAll', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      // Use a dedicated watcher with a short poll interval
      const pollWatcher = new GitStatusWatcher({
        cache,
        getStatus,
        safetyPollMs: TEST_POLL_MS,
      });

      pollWatcher.watchRepo('/repo/.git', '/repo');

      // Advance past safety poll interval (TEST_POLL_MS = 100ms)
      await Bun.sleep(TEST_POLL_MS + 50);

      expect(refreshCount).toBeGreaterThanOrEqual(1);

      const countBeforeUnwatch = refreshCount;
      pollWatcher.unwatchAll();

      // Advance again — no more polls
      await Bun.sleep(TEST_POLL_MS + 50);
      expect(refreshCount).toBe(countBeforeUnwatch);
    });
  });

  // -------------------------------------------------------------------
  // Working-tree path exclusions
  // -------------------------------------------------------------------

  describe('working-tree exclusions', () => {
    it('ignores events for .git/ paths', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      // Find the root watcher (third watcher registered)
      const rootWatcher = mockWatchers[2];
      // Simulate an event for a .git path
      rootWatcher._callback('change', '.git/HEAD');

      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(0);
    });

    it('ignores events for node_modules/', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      const rootWatcher = mockWatchers[2];
      rootWatcher._callback('change', 'node_modules/pkg/index.js');

      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(0);
    });

    it('processes events for non-excluded paths', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      const rootWatcher = mockWatchers[2];
      rootWatcher._callback('change', 'src/index.ts');

      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);
    });

    it('ignores events with null filename', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      const rootWatcher = mockWatchers[2];
      rootWatcher._callback('change', null);

      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(0);
    });

    it('ignores events for .next/, dist/, target/, build/, coverage/, __pycache__/', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      const rootWatcher = mockWatchers[2];

      const excluded = [
        '.next/server/chunk.js',
        'dist/bundle.js',
        'target/debug/binary',
        'build/output.js',
        'coverage/lcov.info',
        '__pycache__/module.pyc',
      ];

      for (const path of excluded) {
        rootWatcher._callback('change', path);
      }

      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // HEAD and refs watcher callbacks trigger refresh
  // -------------------------------------------------------------------

  describe('git-internal watchers', () => {
    it('HEAD watcher triggers a refresh', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      const headWatcher = mockWatchers[0];
      headWatcher._callback('change', 'HEAD');

      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);
    });

    it('refs watcher triggers a refresh', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo/.git', '/repo');

      const refsWatcher = mockWatchers[1];
      refsWatcher._callback('change', 'refs/heads/main');

      await Bun.sleep(DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);
    });
  });
});
