import { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { sendRequest } from '../lib/send-request';
import type { GitLogItem, GitLogResponse } from '@ymir/shared';

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 50;

// ── State & Reducer ─────────────────────────────────────────────────────────

interface State {
  commits: GitLogItem[];
  skip: number;
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  generation: number;
}

const initialState: State = {
  commits: [],
  skip: 0,
  loading: false,
  hasMore: true,
  error: null,
  generation: 0,
};

type Action =
  | { type: 'RESET' }
  | { type: 'FETCH_START'; generation: number }
  | { type: 'FETCH_SUCCESS'; commits: GitLogItem[]; hasMore: boolean; generation: number }
  | { type: 'FETCH_ERROR'; error: string; generation: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'RESET':
      return { ...initialState, generation: state.generation + 1 };
    case 'FETCH_START':
      return action.generation !== state.generation
        ? state
        : { ...state, loading: true };
    case 'FETCH_SUCCESS': {
      if (action.generation !== state.generation) return state;
      return {
        ...state,
        commits: [...state.commits, ...action.commits],
        skip: state.skip + action.commits.length,
        hasMore: action.hasMore,
        loading: false,
      };
    }
    case 'FETCH_ERROR': {
      if (action.generation !== state.generation) return state;
      return { ...state, loading: false, error: action.error };
    }
    default:
      return state;
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface UsePaginatedGitLogOptions {
  workspaceId: string | null;
  repoPath: string | null;
  limit?: number;
}

export interface UsePaginatedGitLogResult {
  commits: GitLogItem[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  sentinelRef: (node?: Element | null) => void;
  reload: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Encapsulates paginated git-log fetching with infinite-scroll support.
 *
 * - Fetches commits via `git.log` in pages of `limit` (default 50).
 * - Resets automatically when `workspaceId` or `repoPath` changes.
 * - Provides a `sentinelRef` to attach to a bottom sentinel element;
 *   when it scrolls into view the next page is fetched automatically.
 * - Uses a generation counter (inside reducer) to discard stale responses
 *   after a reset.
 * - `reload()` resets all state and fetches from scratch.
 */
export function usePaginatedGitLog({
  workspaceId,
  repoPath,
  limit = DEFAULT_PAGE_SIZE,
}: UsePaginatedGitLogOptions): UsePaginatedGitLogResult {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Reset on workspaceId / repoPath change ─────────────────────────
  // "Adjusting state during render" pattern — React-supported.
  // When deps change we snapshot them and dispatch RESET so the reducer
  // can bump its internal generation counter, discarding in-flight fetches.
  const [prevDeps, setPrevDeps] = useState({ workspaceId, repoPath });
  if (prevDeps.workspaceId !== workspaceId || prevDeps.repoPath !== repoPath) {
    setPrevDeps({ workspaceId, repoPath });
    dispatch({ type: 'RESET' });
  }

  // ── loadCommits ─────────────────────────────────────────────────────

  const loadCommits = useCallback(async () => {
    if (!workspaceId || state.loading || !state.hasMore) return;
    const gen = state.generation;
    dispatch({ type: 'FETCH_START', generation: gen });
    try {
      const res = await sendRequest<GitLogResponse>('git.log', {
        workspaceId,
        repoPath: repoPath || undefined,
        skip: state.skip,
        limit,
      });
      dispatch({
        type: 'FETCH_SUCCESS',
        commits: res.commits,
        hasMore: res.hasMore,
        generation: gen,
      });
    } catch (err) {
      dispatch({
        type: 'FETCH_ERROR',
        error: err instanceof Error ? err.message : 'Failed to load git history',
        generation: gen,
      });
    }
  }, [workspaceId, repoPath, state.skip, state.loading, state.hasMore, state.generation, limit]);

  // Keep a ref so the generation-trigger effect can always call the latest version.
  const loadCommitsRef = useRef(loadCommits);
  useEffect(() => {
    loadCommitsRef.current = loadCommits;
  });

  // ── Initial fetch after reset ──────────────────────────────────────

  const prevGenerationRef = useRef(state.generation);
  useEffect(() => {
    if (state.generation !== prevGenerationRef.current) {
      prevGenerationRef.current = state.generation;
      if (workspaceId) {
        loadCommitsRef.current();
      }
    }
  }, [state.generation, workspaceId]);

  // ── Infinite scroll ────────────────────────────────────────────────

  const { ref: sentinelRef, inView } = useInView({ rootMargin: '200px' });

  useEffect(() => {
    if (inView && state.hasMore && !state.loading) loadCommits();
  }, [inView, state.hasMore, state.loading, loadCommits]);

  // ── Reload (full reset + fetch) ────────────────────────────────────

  const reload = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    commits: state.commits,
    loading: state.loading,
    hasMore: state.hasMore,
    error: state.error,
    sentinelRef,
    reload,
  };
}
