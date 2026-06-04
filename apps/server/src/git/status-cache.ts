import type { GitStatusResponse } from '@ymir/shared';

/** Cache TTL in milliseconds — entries older than this are considered stale. */
export const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  status: GitStatusResponse;
  timestamp: number;
}

export class GitStatusCache {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<GitStatusResponse>>();

  /** Return cached status or `undefined` if absent. */
  get(gitDir: string): GitStatusResponse | undefined {
    return this.cache.get(gitDir)?.status;
  }

  /** Store a status response with the current timestamp. */
  set(gitDir: string, status: GitStatusResponse): void {
    this.cache.set(gitDir, { status, timestamp: Date.now() });
  }

  /** Check whether an entry exists for the given path. */
  has(gitDir: string): boolean {
    return this.cache.has(gitDir);
  }

  /** Return milliseconds since the entry was cached, or `undefined` if absent. */
  getAge(gitDir: string): number | undefined {
    const entry = this.cache.get(gitDir);
    if (!entry) return undefined;
    return Date.now() - entry.timestamp;
  }

  /** Remove the cache entry and any in-flight promise for the given path. */
  invalidate(gitDir: string): void {
    this.cache.delete(gitDir);
    this.inflight.delete(gitDir);
  }

  /** Remove all cache entries. */
  invalidateAll(): void {
    this.cache.clear();
  }

  /** Returns `true` if there is an in-flight promise for the given path. */
  hasInFlight(gitDir: string): boolean {
    return this.inflight.has(gitDir);
  }

  /** Returns `true` if an entry exists and is younger than `CACHE_TTL_MS`. */
  isFresh(gitDir: string): boolean {
    const age = this.getAge(gitDir);
    return age !== undefined && age < CACHE_TTL_MS;
  }

  /**
   * Return an in-flight promise for `gitDir` if one already exists (coalescing).
   * Otherwise invoke `factory()`, store the promise, and return it.
   *
   * On resolution the result is placed in the cache and the in-flight entry
   * is removed. On rejection the in-flight entry is cleaned up and the error
   * is re-thrown.
   */
  getOrCreate(
    gitDir: string,
    factory: () => Promise<GitStatusResponse>,
  ): Promise<GitStatusResponse> {
    const existing = this.inflight.get(gitDir);
    if (existing) return existing;

    const promise = factory()
      .then((status) => {
        this.set(gitDir, status);
        this.inflight.delete(gitDir);
        return status;
      })
      .catch((err) => {
        this.inflight.delete(gitDir);
        throw err;
      });

    this.inflight.set(gitDir, promise);
    return promise;
  }
}
