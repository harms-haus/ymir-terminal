import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { join } from 'node:path';
import type { GitStatusResponse } from '@ymir/shared';
import type { GitStatusCache } from './status-cache';
import { GitStatusWatcher } from './status-watcher';

// ---------------------------------------------------------------------------
// Mock chokidar — intercept watch before status-watcher is loaded
// ---------------------------------------------------------------------------

export interface MockChokidarWatcher {
  close: ReturnType<typeof mock>;
  on: ReturnType<typeof mock>;
  _callbacks: Record<string, (...args: unknown[]) => void>;
}

export const mockWatchers: MockChokidarWatcher[] = [];

/** Track the (paths, options) arguments each chokidar.watch() was called with. */
export const mockWatchCalls: Array<{ paths: string | string[]; options?: unknown }> = [];

function createMockWatcher(): MockChokidarWatcher {
  const callbacks: Record<string, (...args: unknown[]) => void> = {};
  const w: MockChokidarWatcher = {
    close: mock(() => {}),
    on: mock(function (this: MockChokidarWatcher, event: string, cb: (...args: unknown[]) => void) {
      callbacks[event] = cb;
      return this;
    }),
    _callbacks: callbacks,
  };
  return w;
}

// IMPORTANT: mock.module() is process-scoped in Bun — once called it cannot
// be undone per-test-file.  We accept this trade-off because chokidar is only
// needed by status-watcher and no other test file mocks it.  If contamination
// becomes an issue, migrate to a DI-based approach (inject chokidar via deps).
mock.module('chokidar', () => {
  return {
    default: {
      watch: mock((paths: string | string[], options?: unknown): MockChokidarWatcher => {
        const w = createMockWatcher();
        mockWatchers.push(w);
        mockWatchCalls.push({ paths, options });
        return w;
      }),
      FSWatcher: mock(() => {}),
    },
  };
});

// Ensure any process-scoped mock.module registrations are cleaned up when the
// test suite finishes, preventing leakage into other test files.
afterAll(() => mock.restore());

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
    hasInFlight: mock(() => false),
    getOrCreate: mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
      return factory();
    }),
    ...overrides,
  } as unknown as GitStatusCache;
}

/** A short debounce delay used by tests (avoids relying on the real 500 ms). */
const TEST_DEBOUNCE_MS = 10;

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
    // Use a short debounce and disable safety poll to avoid timing flakes
    watcher = new GitStatusWatcher({
      cache,
      getStatus,
      debounceMs: TEST_DEBOUNCE_MS,
      disableSafetyPoll: true,
    });
  });

  afterEach(async () => {
    await watcher.unwatchAll();
  });

  // -------------------------------------------------------------------
  // watchRepo — watcher setup
  // -------------------------------------------------------------------

  describe('watchRepo', () => {
    it('creates four watchers for a repository', () => {
      watcher.watchRepo('/repo', '/repo');

      // HEAD, refs, index, and working tree root
      expect(mockWatchers.length).toBe(4);
    });

    it('watches .git/HEAD', () => {
      watcher.watchRepo('/repo', '/repo');

      const headCall = mockWatchCalls.find((c) => c.paths === join('/repo/.git', 'HEAD'));
      expect(headCall).toBeDefined();
    });

    it('watches .git/refs with depth and ignoreInitial options', () => {
      watcher.watchRepo('/repo', '/repo');

      const refsCall = mockWatchCalls.find((c) => c.paths === join('/repo/.git', 'refs'));
      expect(refsCall).toBeDefined();
      expect(refsCall!.options).toEqual({ depth: 10, ignoreInitial: true });
    });

    it('watches .git/index', () => {
      watcher.watchRepo('/repo', '/repo');

      const indexCall = mockWatchCalls.find((c) => c.paths === join('/repo/.git', 'index'));
      expect(indexCall).toBeDefined();
    });

    it('watches the repo root with ignored and ignoreInitial options', () => {
      watcher.watchRepo('/repo', '/repo');

      const rootCall = mockWatchCalls.find((c) => c.paths === '/repo');
      expect(rootCall).toBeDefined();
      expect(rootCall!.options).toHaveProperty('ignored');
      expect(rootCall!.options).toHaveProperty('ignoreInitial', true);
    });

    it('index watcher listens on the change event', () => {
      watcher.watchRepo('/repo', '/repo');

      const indexWatcher = mockWatchers[2]; // third watcher = index
      expect(indexWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('root watcher listens on the all event', () => {
      watcher.watchRepo('/repo', '/repo');

      const rootWatcher = mockWatchers[3]; // fourth watcher = root
      expect(rootWatcher.on).toHaveBeenCalledWith('all', expect.any(Function));
    });
  });

  // -------------------------------------------------------------------
  // watchRepo — deduplication
  // -------------------------------------------------------------------

  describe('deduplication', () => {
    it('does not create duplicate watchers when called twice for the same path', () => {
      watcher.watchRepo('/repo', '/repo');
      const countAfterFirst = mockWatchers.length;

      watcher.watchRepo('/repo', '/repo');

      // No additional watchers should have been created
      expect(mockWatchers.length).toBe(countAfterFirst);
    });

    it('creates watchers for different repos independently', () => {
      watcher.watchRepo('/repo-a', '/repo-a');
      watcher.watchRepo('/repo-b', '/repo-b');

      // 4 watchers per repo = 8 total
      expect(mockWatchers.length).toBe(8);
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

      watcher.watchRepo('/repo', '/repo');

      // Fire multiple rapid refreshes
      watcher.scheduleRefresh('/repo');
      watcher.scheduleRefresh('/repo');
      watcher.scheduleRefresh('/repo');

      // Advance past debounce (TEST_DEBOUNCE_MS = 10 ms)
      await Bun.sleep(TEST_DEBOUNCE_MS + 50);

      expect(refreshCount).toBe(1);
    });

    it('triggers refresh after debounce window elapses', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo', '/repo');

      watcher.scheduleRefresh('/repo');

      // Before debounce fires
      await Bun.sleep(TEST_DEBOUNCE_MS / 2);
      expect(refreshCount).toBe(0);

      // After debounce fires
      await Bun.sleep(TEST_DEBOUNCE_MS / 2 + 50);
      expect(refreshCount).toBe(1);
    });

    it('fires a second refresh after the first debounce window closes', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo', '/repo');

      watcher.scheduleRefresh('/repo');
      await Bun.sleep(TEST_DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);

      watcher.scheduleRefresh('/repo');
      await Bun.sleep(TEST_DEBOUNCE_MS + 50);
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

      watcher.watchRepo('/repo', '/repo');

      // Schedule a debounced refresh
      watcher.scheduleRefresh('/repo');

      // Immediately refreshNow — should cancel the timer and refresh
      await watcher.refreshNow('/repo');

      expect(refreshCount).toBe(1);

      // Wait past the original debounce window — no additional refresh
      await Bun.sleep(TEST_DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);
    });

    it('invalidates the cache before refreshing', async () => {
      await watcher.refreshNow('/repo');

      expect(cache.invalidate).toHaveBeenCalledWith('/repo');
    });

    it('still works when no debounce timer is pending', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      await watcher.refreshNow('/repo');
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

      watcher.watchRepo('/repo', '/repo');

      const status1 = makeStatus('main');
      const status2 = makeStatus('feature');

      let callIndex = 0;
      cache.getOrCreate = mock(async (_dir: string, _factory: () => Promise<GitStatusResponse>) => {
        return callIndex++ === 0 ? status1 : status2;
      });

      await watcher.refreshStatus('/repo');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('/repo', status1);

      await watcher.refreshStatus('/repo');
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith('/repo', status2);
    });

    it('is NOT called when status is unchanged (same reference)', async () => {
      const handler = mock(() => {});
      watcher.setStatusChangeHandler(handler);

      watcher.watchRepo('/repo', '/repo');

      const status = makeStatus('main');
      cache.getOrCreate = mock(async () => status);

      await watcher.refreshStatus('/repo');
      expect(handler).toHaveBeenCalledTimes(1);

      await watcher.refreshStatus('/repo');
      // Same status — should NOT fire again
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('is NOT called when status is unchanged (different references, identical fields)', async () => {
      const handler = mock(() => {});
      watcher.setStatusChangeHandler(handler);

      watcher.watchRepo('/repo', '/repo');

      let _callIdx = 0;
      cache.getOrCreate = mock(async (_dir: string, _factory: () => Promise<GitStatusResponse>) => {
        _callIdx++;
        // Return distinct objects with identical field values each time
        return {
          branch: 'main',
          changes: [{ path: 'src/index.ts', status: 'M' as const }],
          staged: [{ path: 'src/lib.ts', status: 'A' as const }],
          hasRemote: true,
          ahead: 1,
          behind: 2,
        };
      });

      await watcher.refreshStatus('/repo');
      expect(handler).toHaveBeenCalledTimes(1);

      await watcher.refreshStatus('/repo');
      // Second call produces a new object with same field values — should NOT fire again
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('is called when status fields differ between objects', async () => {
      const handler = mock(() => {});
      watcher.setStatusChangeHandler(handler);

      watcher.watchRepo('/repo', '/repo');

      let callIndex = 0;
      cache.getOrCreate = mock(async (_dir: string, _factory: () => Promise<GitStatusResponse>) => {
        callIndex++;
        if (callIndex === 1) {
          return {
            branch: 'main',
            changes: [{ path: 'src/index.ts', status: 'M' as const }],
            staged: [],
            hasRemote: false,
            ahead: 0,
            behind: 0,
          };
        }
        // Changes array has a different path
        return {
          branch: 'main',
          changes: [{ path: 'src/other.ts', status: 'M' as const }],
          staged: [],
          hasRemote: false,
          ahead: 0,
          behind: 0,
        };
      });

      await watcher.refreshStatus('/repo');
      expect(handler).toHaveBeenCalledTimes(1);

      await watcher.refreshStatus('/repo');
      // changes[0].path differs — should fire
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('fires on first refresh (no previous status)', async () => {
      const handler = mock(() => {});
      watcher.setStatusChangeHandler(handler);

      cache.getOrCreate = mock(async () => makeStatus('main'));

      await watcher.refreshStatus('/repo');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------
  // unwatchRepo
  // -------------------------------------------------------------------

  describe('unwatchRepo', () => {
    it('closes all watchers for the repo', async () => {
      watcher.watchRepo('/repo', '/repo');
      const watchersBefore = [...mockWatchers];

      await watcher.unwatchRepo('/repo');

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

      watcher.watchRepo('/repo', '/repo');
      watcher.scheduleRefresh('/repo');

      await watcher.unwatchRepo('/repo');

      // Wait past debounce — no refresh should fire
      await Bun.sleep(TEST_DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(0);
    });

    it('is a no-op for a repo that was never watched', async () => {
      await expect(watcher.unwatchRepo('/nonexistent')).resolves.toBeUndefined();
    });

    it('allows re-watching after unwatching', async () => {
      watcher.watchRepo('/repo', '/repo');
      const countAfterFirst = mockWatchers.length;

      await watcher.unwatchRepo('/repo');

      watcher.watchRepo('/repo', '/repo');
      // Should have created new watchers (originals were closed)
      expect(mockWatchers.length).toBe(countAfterFirst + 4);
    });
  });

  // -------------------------------------------------------------------
  // unwatchAll
  // -------------------------------------------------------------------

  describe('unwatchAll', () => {
    it('closes all watchers across all repos', async () => {
      watcher.watchRepo('/repo-a', '/repo-a');
      watcher.watchRepo('/repo-b', '/repo-b');
      const allWatchers = [...mockWatchers];

      await watcher.unwatchAll();

      for (const w of allWatchers) {
        expect(w.close).toHaveBeenCalled();
      }
    });

    it('is safe to call when nothing is watched', async () => {
      await expect(watcher.unwatchAll()).resolves.toBeUndefined();
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

      pollWatcher.watchRepo('/repo', '/repo');

      // Advance past safety poll interval (TEST_POLL_MS = 100ms)
      await Bun.sleep(TEST_POLL_MS + 50);

      expect(refreshCount).toBeGreaterThanOrEqual(1);

      const countBeforeUnwatch = refreshCount;
      await pollWatcher.unwatchAll();

      // Advance again — no more polls
      await Bun.sleep(TEST_POLL_MS + 50);
      expect(refreshCount).toBe(countBeforeUnwatch);
    });

    it('does not overlap safety-poll batches when refresh is slow', async () => {
      // Track how many concurrent refreshes are running
      let concurrentRefreshes = 0;
      let maxConcurrentRefreshes = 0;

      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        concurrentRefreshes++;
        maxConcurrentRefreshes = Math.max(maxConcurrentRefreshes, concurrentRefreshes);
        // Simulate a slow refresh that takes longer than the poll interval
        await Bun.sleep(TEST_POLL_MS * 3);
        const result = factory();
        concurrentRefreshes--;
        return result;
      });

      const pollWatcher = new GitStatusWatcher({
        cache,
        getStatus,
        safetyPollMs: TEST_POLL_MS,
      });

      // Watch multiple repos so the loop in runSafetyPollBatch triggers
      pollWatcher.watchRepo('/repo-1', '/repo-1');
      pollWatcher.watchRepo('/repo-2', '/repo-2');
      pollWatcher.watchRepo('/repo-3', '/repo-3');
      pollWatcher.watchRepo('/repo-4', '/repo-4');

      // Wait long enough for at least two safety-poll intervals
      await Bun.sleep(TEST_POLL_MS * 2.5);

      // The guard flag should ensure no more than SAFETY_POLL_BATCH_SIZE (3)
      // concurrent refreshes happen at once
      expect(maxConcurrentRefreshes).toBeLessThanOrEqual(3);

      await pollWatcher.unwatchAll();
    });
  });

  // -------------------------------------------------------------------
  // Working-tree exclusions (via chokidar's ignored option)
  // -------------------------------------------------------------------

  describe('working-tree exclusions', () => {
    it('passes EXCLUDED_PATTERN as the ignored option to the root watcher', () => {
      watcher.watchRepo('/repo', '/repo');

      const rootCall = mockWatchCalls[3]; // fourth watcher = root
      expect(rootCall).toBeDefined();
      expect(rootCall.options).toHaveProperty('ignored');
      expect(rootCall.options!.ignored).toBeInstanceOf(RegExp);
    });
  });

  // -------------------------------------------------------------------
  // git-internal watchers trigger refresh
  // -------------------------------------------------------------------

  describe('git-internal watchers', () => {
    it('HEAD watcher triggers a refresh', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo', '/repo');

      const headWatcher = mockWatchers[0];
      headWatcher._callbacks['change']();

      await Bun.sleep(TEST_DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);
    });

    it('refs watcher triggers a refresh', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo', '/repo');

      const refsWatcher = mockWatchers[1];
      refsWatcher._callbacks['all']();

      await Bun.sleep(TEST_DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);
    });

    it('index watcher triggers a refresh', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo', '/repo');

      const indexWatcher = mockWatchers[2];
      indexWatcher._callbacks['change']();

      await Bun.sleep(TEST_DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);
    });

    it('root watcher triggers a refresh on all events', async () => {
      let refreshCount = 0;
      cache.getOrCreate = mock(async (_dir: string, factory: () => Promise<GitStatusResponse>) => {
        refreshCount++;
        return factory();
      });

      watcher.watchRepo('/repo', '/repo');

      const rootWatcher = mockWatchers[3];
      rootWatcher._callbacks['all']('change', 'src/index.ts');

      await Bun.sleep(TEST_DEBOUNCE_MS + 50);
      expect(refreshCount).toBe(1);
    });
  });
});
