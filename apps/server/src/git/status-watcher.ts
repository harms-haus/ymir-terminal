import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { GitStatusResponse } from '@ymir/shared';
import type { GitStatusCache } from './status-cache';

/** Directories to ignore when watching the working tree. */
const EXCLUDED_DIRS = [
  '.git/',
  'node_modules/',
  '.next/',
  'dist/',
  'target/',
  'build/',
  'coverage/',
  '__pycache__/',
];

/** Debounce delay in milliseconds before triggering a status refresh. */
export const DEBOUNCE_MS = 500;

/** Safety-poll interval in milliseconds. */
export const SAFETY_POLL_MS = 45_000;

/** Concurrency limit for staggered safety-poll refreshes. */
const SAFETY_POLL_BATCH_SIZE = 3;

/** Default safety-poll interval used by the watcher (overridable for tests). */
const DEFAULT_SAFETY_POLL_MS = SAFETY_POLL_MS;

interface RepoState {
  watchers: FSWatcher[];
  debounceTimer: ReturnType<typeof setTimeout> | null;
  lastStatus: GitStatusResponse | null;
}

export interface GitStatusWatcherOptions {
  cache: GitStatusCache;
  getStatus: (dir: string) => Promise<GitStatusResponse>;
  /** Override the safety-poll interval (for testing). */
  safetyPollMs?: number;
  /** Disable the automatic safety poll entirely. */
  disableSafetyPoll?: boolean;
}

/**
 * Cheap equality check for two GitStatusResponse values.
 * Scalar fields are compared first; the arrays are only stringified
 * when their lengths match (fast for small lists, still catches reorderings).
 */
function statusChanged(a: GitStatusResponse | null, b: GitStatusResponse): boolean {
  if (a === null) return true;
  if (
    a.branch !== b.branch ||
    a.ahead !== b.ahead ||
    a.behind !== b.behind ||
    a.hasRemote !== b.hasRemote
  )
    return true;
  if (a.changes.length !== b.changes.length || a.staged.length !== b.staged.length) return true;
  return (
    JSON.stringify(a.changes) !== JSON.stringify(b.changes) ||
    JSON.stringify(a.staged) !== JSON.stringify(b.staged)
  );
}

export class GitStatusWatcher {
  private static readonly MAX_WATCHED_REPOS = 200;

  private cache: GitStatusCache;
  private getStatusFn: (dir: string) => Promise<GitStatusResponse>;
  private repos = new Map<string, RepoState>();
  private statusChangeHandler: ((gitDir: string, status: GitStatusResponse) => void) | null = null;
  private safetyPollTimer: ReturnType<typeof setInterval> | null = null;
  private safetyPollMs: number;
  private disableSafetyPoll: boolean;

  constructor(opts: GitStatusWatcherOptions) {
    this.cache = opts.cache;
    this.getStatusFn = opts.getStatus;
    this.safetyPollMs = opts.safetyPollMs ?? DEFAULT_SAFETY_POLL_MS;
    this.disableSafetyPoll = opts.disableSafetyPoll ?? false;
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /**
   * Start watching a git repository for changes that affect status.
   *
   * @param absoluteGitDir  Absolute path to the `.git` directory.
   * @param repoRoot        Absolute path to the repository working-tree root.
   */
  watchRepo(absoluteGitDir: string, repoRoot: string): void {
    if (this.repos.size >= GitStatusWatcher.MAX_WATCHED_REPOS) {
      console.warn(
        `[GitStatusWatcher] Max watched repos (${GitStatusWatcher.MAX_WATCHED_REPOS}) reached, skipping`,
        absoluteGitDir,
      );
      return;
    }

    if (this.repos.has(absoluteGitDir)) return;

    const state: RepoState = {
      watchers: [],
      debounceTimer: null,
      lastStatus: null,
    };

    // Watch .git/HEAD — fires on branch switches and commits
    const headPath = join(absoluteGitDir, 'HEAD');
    const headWatcher = watch(headPath, () => {
      this.scheduleRefresh(absoluteGitDir);
    });
    state.watchers.push(headWatcher);

    // Watch .git/refs/ — fires on new commits and tag creation
    const refsPath = join(absoluteGitDir, 'refs');
    const refsWatcher = watch(refsPath, { recursive: true }, () => {
      this.scheduleRefresh(absoluteGitDir);
    });
    state.watchers.push(refsWatcher);

    // Watch the working tree for file-level changes
    const rootWatcher = watch(repoRoot, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      if (this.isExcluded(filename)) return;
      this.scheduleRefresh(absoluteGitDir);
    });
    state.watchers.push(rootWatcher);

    this.repos.set(absoluteGitDir, state);

    // Start safety poll on first watched repo
    this.ensureSafetyPoll();
  }

  /**
   * Schedule a debounced status refresh for the given repo.
   * Subsequent calls within the debounce window are coalesced.
   */
  scheduleRefresh(absoluteGitDir: string): void {
    const state = this.repos.get(absoluteGitDir);
    if (!state) return;

    if (state.debounceTimer !== null) {
      clearTimeout(state.debounceTimer);
    }

    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      void this.refreshStatus(absoluteGitDir);
    }, DEBOUNCE_MS);
  }

  /**
   * Immediately fetch the latest status for a repo, bypassing debounce.
   * Invalidates the cache entry first to guarantee a fresh read.
   */
  async refreshNow(absoluteGitDir: string): Promise<void> {
    const state = this.repos.get(absoluteGitDir);
    if (state && state.debounceTimer !== null) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }

    this.cache.invalidate(absoluteGitDir);
    await this.refreshStatus(absoluteGitDir);
  }

  /**
   * Fetch the latest status, compare with the previously stored status,
   * and invoke the change handler if the result differs.
   */
  async refreshStatus(absoluteGitDir: string): Promise<void> {
    const state = this.repos.get(absoluteGitDir);

    const status = await this.cache.getOrCreate(absoluteGitDir, () =>
      this.getStatusFn(absoluteGitDir),
    );

    if (state) {
      const changed = statusChanged(state.lastStatus, status);
      state.lastStatus = status;

      if (changed) {
        this.statusChangeHandler?.(absoluteGitDir, status);
      }
    } else {
      // Not watched (e.g. called externally) — still notify on first call
      this.statusChangeHandler?.(absoluteGitDir, status);
    }
  }

  /**
   * Register a handler that is invoked whenever the status for a repo changes.
   */
  setStatusChangeHandler(handler: (gitDir: string, status: GitStatusResponse) => void): void {
    this.statusChangeHandler = handler;
  }

  /**
   * Stop watching a specific repo: close all watchers and clear timers.
   */
  unwatchRepo(absoluteGitDir: string): void {
    const state = this.repos.get(absoluteGitDir);
    if (!state) return;

    if (state.debounceTimer !== null) {
      clearTimeout(state.debounceTimer);
    }

    for (const w of state.watchers) {
      w.close();
    }

    this.repos.delete(absoluteGitDir);
    this.cache.invalidate(absoluteGitDir);

    // Stop safety poll if no repos remain
    if (this.repos.size === 0) {
      this.stopSafetyPoll();
    }
  }

  /**
   * Stop all watchers, clear all timers, and stop the safety poll.
   */
  unwatchAll(): void {
    for (const [gitDir] of this.repos) {
      this.unwatchRepo(gitDir);
    }
    this.stopSafetyPoll();
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  /**
   * Returns `true` if the given filename should be excluded from
   * working-tree watch events.
   */
  private isExcluded(filename: string): boolean {
    return EXCLUDED_DIRS.some((dir) => filename.includes(dir));
  }

  /** Start the safety-poll interval if it isn't already running. */
  private ensureSafetyPoll(): void {
    if (this.disableSafetyPoll) return;
    if (this.safetyPollTimer !== null) return;

    this.safetyPollTimer = setInterval(() => {
      void this.runSafetyPollBatch();
    }, this.safetyPollMs);
  }

  /** Process repos in staggered batches to avoid spawning too many git processes at once. */
  private async runSafetyPollBatch(): Promise<void> {
    const dirs = [...this.repos.keys()];
    for (let i = 0; i < dirs.length; i += SAFETY_POLL_BATCH_SIZE) {
      const batch = dirs.slice(i, i + SAFETY_POLL_BATCH_SIZE);
      await Promise.all(
        batch.map((gitDir) => {
          this.cache.invalidate(gitDir);
          return this.refreshStatus(gitDir);
        }),
      );
    }
  }

  /** Stop the safety-poll interval. */
  private stopSafetyPoll(): void {
    if (this.safetyPollTimer !== null) {
      clearInterval(this.safetyPollTimer);
      this.safetyPollTimer = null;
    }
  }
}
