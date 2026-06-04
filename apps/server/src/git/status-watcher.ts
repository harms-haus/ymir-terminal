import { join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { GitFileChange, GitStatusResponse } from '@ymir/shared';
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

/** Pre-compiled regex for fast directory exclusion checks. */
const EXCLUDED_PATTERN = new RegExp(
  EXCLUDED_DIRS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

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
 * Deep field-by-field comparison for two GitFileChange arrays.
 */
function changesEqual(a: readonly GitFileChange[], b: readonly GitFileChange[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].status !== b[i].status) return false;
  }
  return true;
}

/**
 * Cheap equality check for two GitStatusResponse values.
 * Scalar fields are compared first; arrays are compared field-by-field.
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
  return !changesEqual(a.changes, b.changes) || !changesEqual(a.staged, b.staged);
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
   * Both params are the repo-root path (e.g. `/home/user/project`).
   * The `.git` subdirectory path is derived internally for filesystem watching.
   * The repo-root path is used as the canonical key throughout the watcher,
   * cache, and broadcast system.
   *
   * @param repoRootKey     Repo-root path used as the canonical key.
   * @param repoRootPath    Repo-root path used to derive the `.git` directory
   *                        for filesystem watchers (HEAD, refs).
   */
  watchRepo(repoRootKey: string, repoRootPath: string): void {
    if (this.repos.size >= GitStatusWatcher.MAX_WATCHED_REPOS) {
      console.warn(
        `[GitStatusWatcher] Max watched repos (${GitStatusWatcher.MAX_WATCHED_REPOS}) reached, skipping`,
        repoRootKey,
      );
      return;
    }

    if (this.repos.has(repoRootKey)) return;

    const state: RepoState = {
      watchers: [],
      debounceTimer: null,
      lastStatus: null,
    };

    // Derive the .git directory from the repo-root path for filesystem watching
    const gitDir = join(repoRootPath, '.git');

    // Watch .git/HEAD — fires on branch switches and commits
    const headPath = join(gitDir, 'HEAD');
    const headWatcher = chokidar.watch(headPath).on('change', () => {
      this.scheduleRefresh(repoRootKey);
    });
    state.watchers.push(headWatcher);

    // Watch .git/refs/ — fires on new commits and tag creation
    const refsPath = join(gitDir, 'refs');
    const refsWatcher = chokidar
      .watch(refsPath, { depth: 10, ignoreInitial: true })
      .on('all', () => {
        this.scheduleRefresh(repoRootKey);
      });
    state.watchers.push(refsWatcher);

    // Watch .git/index — fires when git stages/unstages changes
    const indexPath = join(gitDir, 'index');
    const indexWatcher = chokidar.watch(indexPath).on('change', () => {
      this.scheduleRefresh(repoRootKey);
    });
    state.watchers.push(indexWatcher);

    // Watch the working tree for file-level changes
    const rootWatcher = chokidar
      .watch(repoRootPath, { ignored: EXCLUDED_PATTERN, ignoreInitial: true })
      .on('all', (_event, _path) => {
        this.scheduleRefresh(repoRootKey);
      });
    state.watchers.push(rootWatcher);

    this.repos.set(repoRootKey, state);

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
  async unwatchRepo(absoluteGitDir: string): Promise<void> {
    const state = this.repos.get(absoluteGitDir);
    if (!state) return;

    if (state.debounceTimer !== null) {
      clearTimeout(state.debounceTimer);
    }

    await Promise.all(state.watchers.map((w) => w.close()));

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
  async unwatchAll(): Promise<void> {
    for (const [gitDir] of this.repos) {
      await this.unwatchRepo(gitDir);
    }
    this.stopSafetyPoll();
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  /** Guard flag to prevent overlapping safety-poll batches. */
  private safetyPollRunning = false;

  /** Start the safety-poll interval if it isn't already running. */
  private ensureSafetyPoll(): void {
    if (this.disableSafetyPoll) return;
    if (this.safetyPollTimer !== null) return;

    this.safetyPollTimer = setInterval(() => {
      if (this.safetyPollRunning) return;
      this.safetyPollRunning = true;
      void this.runSafetyPollBatch().finally(() => {
        this.safetyPollRunning = false;
      });
    }, this.safetyPollMs);
  }

  /** Process repos in staggered batches to avoid spawning too many git processes at once. */
  private async runSafetyPollBatch(): Promise<void> {
    const dirs = [...this.repos.keys()];
    for (let i = 0; i < dirs.length; i += SAFETY_POLL_BATCH_SIZE) {
      const batch = dirs.slice(i, i + SAFETY_POLL_BATCH_SIZE);
      await Promise.all(
        batch
          .filter((repoKey) => !this.cache.isFresh(repoKey))
          .map((repoKey) => {
            this.cache.invalidate(repoKey);
            return this.refreshStatus(repoKey);
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
