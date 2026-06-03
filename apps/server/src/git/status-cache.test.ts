import { describe, expect, it, beforeEach } from 'bun:test';
import { GitStatusCache, CACHE_TTL_MS } from './status-cache';
import type { GitStatusResponse } from '@ymir/shared';

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

describe('GitStatusCache', () => {
  let cache: GitStatusCache;

  beforeEach(() => {
    cache = new GitStatusCache();
  });

  // ------------------------------------------------------------------
  // Basic get / set / has
  // ------------------------------------------------------------------

  describe('get', () => {
    it('returns undefined for a cache miss', () => {
      expect(cache.get('/repo/a')).toBeUndefined();
    });

    it('returns the stored status for a cache hit', () => {
      const status = makeStatus('feature');
      cache.set('/repo/a', status);
      expect(cache.get('/repo/a')).toBe(status);
    });
  });

  describe('has', () => {
    it('returns false when the entry does not exist', () => {
      expect(cache.has('/repo/a')).toBe(false);
    });

    it('returns true after set', () => {
      cache.set('/repo/a', makeStatus());
      expect(cache.has('/repo/a')).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // getAge
  // ------------------------------------------------------------------

  describe('getAge', () => {
    it('returns undefined for a missing entry', () => {
      expect(cache.getAge('/repo/a')).toBeUndefined();
    });

    it('returns a non-negative number for an existing entry', () => {
      cache.set('/repo/a', makeStatus());
      const age = cache.getAge('/repo/a');
      expect(age).toBeGreaterThanOrEqual(0);
    });
  });

  // ------------------------------------------------------------------
  // invalidate
  // ------------------------------------------------------------------

  describe('invalidate', () => {
    it('removes a single entry', () => {
      cache.set('/repo/a', makeStatus());
      cache.set('/repo/b', makeStatus());

      cache.invalidate('/repo/a');

      expect(cache.has('/repo/a')).toBe(false);
      expect(cache.has('/repo/b')).toBe(true);
    });

    it('is a no-op for a missing entry', () => {
      cache.invalidate('/repo/nonexistent');
      // No error thrown
    });
  });

  describe('invalidateAll', () => {
    it('clears every entry', () => {
      cache.set('/repo/a', makeStatus());
      cache.set('/repo/b', makeStatus());
      cache.set('/repo/c', makeStatus());

      cache.invalidateAll();

      expect(cache.has('/repo/a')).toBe(false);
      expect(cache.has('/repo/b')).toBe(false);
      expect(cache.has('/repo/c')).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Fresh / stale boundary
  // ------------------------------------------------------------------

  describe('isFresh', () => {
    it('returns false for a missing entry', () => {
      expect(cache.isFresh('/repo/a')).toBe(false);
    });

    it('returns true immediately after set', () => {
      cache.set('/repo/a', makeStatus());
      expect(cache.isFresh('/repo/a')).toBe(true);
    });

    it('returns false after the TTL has elapsed', async () => {
      // Use a very short TTL by directly setting the timestamp in the past
      cache.set('/repo/a', makeStatus());

      // Manipulate internal state to simulate an old entry
      // Access the private cache map via type assertion for test purposes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cache as any).cache.get('/repo/a').timestamp = Date.now() - CACHE_TTL_MS - 1;

      expect(cache.isFresh('/repo/a')).toBe(false);
    });

    it('returns true when age is just below TTL', () => {
      cache.set('/repo/a', makeStatus());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cache as any).cache.get('/repo/a').timestamp = Date.now() - CACHE_TTL_MS + 100;

      expect(cache.isFresh('/repo/a')).toBe(true);
    });

    it('returns false when age is exactly at TTL', () => {
      cache.set('/repo/a', makeStatus());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cache as any).cache.get('/repo/a').timestamp = Date.now() - CACHE_TTL_MS;

      expect(cache.isFresh('/repo/a')).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Stale entry (older than TTL)
  // ------------------------------------------------------------------

  describe('stale entry behavior', () => {
    it('still returns the status via get even when stale', () => {
      const status = makeStatus('stale-branch');
      cache.set('/repo/a', status);

      // Force the entry to be stale
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cache as any).cache.get('/repo/a').timestamp = Date.now() - CACHE_TTL_MS - 1000;

      // get() does not check staleness — it returns whatever is stored
      expect(cache.get('/repo/a')).toBe(status);
      expect(cache.isFresh('/repo/a')).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // getOrCreate — coalescing
  // ------------------------------------------------------------------

  describe('getOrCreate', () => {
    it('calls factory and caches the result', async () => {
      const status = makeStatus('coalesced');
      let callCount = 0;
      const factory = async () => {
        callCount++;
        return status;
      };

      const result = await cache.getOrCreate('/repo/a', factory);

      expect(result).toBe(status);
      expect(callCount).toBe(1);
      expect(cache.get('/repo/a')).toBe(status);
    });

    it('coalesces concurrent calls — only one factory invocation', async () => {
      let callCount = 0;

      // Use a promise we can control to simulate in-flight request
      let resolveFactory!: (v: GitStatusResponse) => void;
      const factory = async () => {
        callCount++;
        return new Promise<GitStatusResponse>((resolve) => {
          resolveFactory = resolve;
        });
      };

      // Kick off two concurrent calls
      const p1 = cache.getOrCreate('/repo/a', factory);
      const p2 = cache.getOrCreate('/repo/a', factory);

      // Only one factory should have been called
      expect(callCount).toBe(1);

      // Resolve the factory
      const status = makeStatus('concurrent');
      resolveFactory(status);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(status);
      expect(r2).toBe(status);
      expect(callCount).toBe(1);
    });

    it('coalesces three concurrent calls', async () => {
      let callCount = 0;
      let resolveFactory!: (v: GitStatusResponse) => void;

      const factory = async () => {
        callCount++;
        return new Promise<GitStatusResponse>((resolve) => {
          resolveFactory = resolve;
        });
      };

      const p1 = cache.getOrCreate('/repo/a', factory);
      const p2 = cache.getOrCreate('/repo/a', factory);
      const p3 = cache.getOrCreate('/repo/a', factory);

      expect(callCount).toBe(1);

      const status = makeStatus('triple');
      resolveFactory(status);

      const results = await Promise.all([p1, p2, p3]);
      expect(results.every((r) => r === status)).toBe(true);
      expect(callCount).toBe(1);
    });

    it('returns cached result without calling factory on second call after resolution', async () => {
      const status = makeStatus('cached-later');
      let callCount = 0;
      const factory = async () => {
        callCount++;
        return status;
      };

      await cache.getOrCreate('/repo/a', factory);
      expect(callCount).toBe(1);

      // Second call — factory was already removed from inflight map,
      // so a new factory call is expected
      await cache.getOrCreate('/repo/a', factory);
      expect(callCount).toBe(2);
    });
  });

  // ------------------------------------------------------------------
  // getOrCreate — rejection cleanup
  // ------------------------------------------------------------------

  describe('getOrCreate rejection', () => {
    it('removes inflight entry on rejection and re-throws', async () => {
      let callCount = 0;
      const factory = async () => {
        callCount++;
        throw new Error('factory failed');
      };

      await expect(cache.getOrCreate('/repo/a', factory)).rejects.toThrow('factory failed');

      // Inflight entry should be cleaned up — a subsequent call should invoke factory again
      await expect(cache.getOrCreate('/repo/a', factory)).rejects.toThrow('factory failed');
      expect(callCount).toBe(2);
    });

    it('coalesces concurrent calls and all reject when factory fails', async () => {
      const factory = async (): Promise<GitStatusResponse> => {
        throw new Error('boom');
      };

      const p1 = cache.getOrCreate('/repo/a', factory);
      const p2 = cache.getOrCreate('/repo/a', factory);

      await expect(p1).rejects.toThrow('boom');
      await expect(p2).rejects.toThrow('boom');

      // No cache entry should be stored after rejection
      expect(cache.has('/repo/a')).toBe(false);
    });

    it('subsequent successful call works after a rejection', async () => {
      let shouldFail = true;
      const factory = async () => {
        if (shouldFail) throw new Error('fail');
        return makeStatus('recovered');
      };

      await expect(cache.getOrCreate('/repo/a', factory)).rejects.toThrow('fail');

      shouldFail = false;
      const result = await cache.getOrCreate('/repo/a', factory);
      expect(result.branch).toBe('recovered');
    });
  });

  // ------------------------------------------------------------------
  // getOrCreate — successful inflight cleanup
  // ------------------------------------------------------------------

  describe('getOrCreate inflight cleanup', () => {
    it('removes inflight entry after successful resolution', async () => {
      let resolveFactory!: (v: GitStatusResponse) => void;
      const factory = async () => {
        return new Promise<GitStatusResponse>((resolve) => {
          resolveFactory = resolve;
        });
      };

      const p = cache.getOrCreate('/repo/a', factory);
      resolveFactory(makeStatus('done'));
      await p;

      // Inflight should be cleared; next call should invoke factory again
      let callCount = 0;
      const factory2 = async () => {
        callCount++;
        return makeStatus('second');
      };
      await cache.getOrCreate('/repo/a', factory2);
      expect(callCount).toBe(1);
    });
  });

  // ------------------------------------------------------------------
  // Multiple repos
  // ------------------------------------------------------------------

  describe('multiple repos', () => {
    it('maintains independent entries per repo path', () => {
      const statusA = makeStatus('branch-a');
      const statusB = makeStatus('branch-b');

      cache.set('/repo/a', statusA);
      cache.set('/repo/b', statusB);

      expect(cache.get('/repo/a')).toBe(statusA);
      expect(cache.get('/repo/b')).toBe(statusB);
    });

    it('coalescing is per-repo', async () => {
      let countA = 0;
      let countB = 0;

      const factoryA = async () => {
        countA++;
        return makeStatus('a');
      };
      const factoryB = async () => {
        countB++;
        return makeStatus('b');
      };

      const [rA, rB] = await Promise.all([
        cache.getOrCreate('/repo/a', factoryA),
        cache.getOrCreate('/repo/b', factoryB),
      ]);

      expect(rA.branch).toBe('a');
      expect(rB.branch).toBe('b');
      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });
  });
});
