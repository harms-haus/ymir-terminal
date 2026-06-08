import { useReducer, useRef, useEffect, useCallback } from 'react';
import { sendRequest } from '../lib/send-request';
import { wsClient } from '../lib/ws-client';
import type { MessageEnvelope, FileSearchFileResult, FileSearchResponse } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  includePattern?: string;
}

export interface UseFileContentSearchReturn {
  results: FileSearchFileResult[];
  isSearching: boolean;
  isComplete: boolean;
  totalMatches: number;
  fileCount: number;
  truncated: boolean;
  error: string | null;
  search: (query: string, options: SearchOptions) => void;
  clearResults: () => void;
  abort: () => void;
}

// ---------------------------------------------------------------------------
// Reducer — avoids calling setState in effects
// ---------------------------------------------------------------------------

interface SearchState {
  results: FileSearchFileResult[];
  isSearching: boolean;
  isComplete: boolean;
  totalMatches: number;
  fileCount: number;
  truncated: boolean;
  error: string | null;
}

type SearchAction =
  | { type: 'RESET' }
  | { type: 'SEARCH_START' }
  | { type: 'ADD_FILE_RESULT'; fileResult: FileSearchFileResult; totalMatches: number }
  | { type: 'SEARCH_DONE'; totalMatches: number; fileCount: number; truncated: boolean }
  | { type: 'SEARCH_ERROR'; error: string }
  | { type: 'ABORT' };

const initialState: SearchState = {
  results: [],
  isSearching: false,
  isComplete: false,
  totalMatches: 0,
  fileCount: 0,
  truncated: false,
  error: null,
};

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'RESET':
      return initialState;
    case 'SEARCH_START':
      return {
        results: [],
        isSearching: true,
        isComplete: false,
        totalMatches: 0,
        fileCount: 0,
        truncated: false,
        error: null,
      };
    case 'ADD_FILE_RESULT':
      return {
        ...state,
        results: [...state.results, action.fileResult],
        totalMatches: action.totalMatches,
        fileCount: state.fileCount + 1,
      };
    case 'SEARCH_DONE':
      return {
        ...state,
        isSearching: false,
        isComplete: true,
        totalMatches: action.totalMatches,
        fileCount: action.fileCount,
        truncated: state.truncated || action.truncated,
      };
    case 'SEARCH_ERROR':
      return {
        ...state,
        isSearching: false,
        error: action.error,
      };
    case 'ABORT':
      return {
        ...state,
        isSearching: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFileContentSearch(workspaceId: string | null): UseFileContentSearchReturn {
  const [state, dispatch] = useReducer(searchReducer, initialState);

  const abortControllerRef = useRef<AbortController | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const searchEpochRef = useRef(0);

  const clearResults = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    unsubscribeRef.current?.();
    dispatch({ type: 'ABORT' });
  }, []);

  const search = useCallback(
    (query: string, options: SearchOptions) => {
      if (!query) {
        dispatch({ type: 'RESET' });
        return;
      }

      // Abort any previous in-flight search
      abortControllerRef.current?.abort();
      unsubscribeRef.current?.();

      const epoch = ++searchEpochRef.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Reset state
      dispatch({ type: 'SEARCH_START' });

      // Subscribe to streaming progress events
      const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
        if (searchEpochRef.current !== epoch) return;
        if (envelope.channel !== 'file.search.progress') return;
        if ((envelope.payload as { workspaceId?: string })?.workspaceId !== workspaceId) return;

        const payload = envelope.payload as {
          fileResult: FileSearchFileResult;
          done: boolean;
          totalMatches: number;
          truncated: boolean;
        };

        if (payload.fileResult) {
          dispatch({
            type: 'ADD_FILE_RESULT',
            fileResult: payload.fileResult,
            totalMatches: payload.totalMatches,
          });
        }

        if (payload.done) {
          dispatch({
            type: 'SEARCH_DONE',
            totalMatches: payload.totalMatches,
            fileCount: 0, // fileCount is tracked incrementally in the reducer
            truncated: payload.truncated,
          });
        }
      });

      unsubscribeRef.current = unsub;

      sendRequest<FileSearchResponse>(
        'file.search',
        { workspaceId, query, ...options },
        { signal: controller.signal },
      )
        .then((response) => {
          if (searchEpochRef.current !== epoch) return;
          dispatch({
            type: 'SEARCH_DONE',
            totalMatches: response.totalMatches,
            fileCount: response.fileCount,
            truncated: response.truncated,
          });
        })
        .catch((err: Error) => {
          if (searchEpochRef.current !== epoch) return;
          if (controller.signal.aborted) return;
          dispatch({ type: 'SEARCH_ERROR', error: err.message });
        });
    },
    [workspaceId],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      unsubscribeRef.current?.();
    };
  }, []);

  // Clear results when workspace changes
  useEffect(() => {
    abortControllerRef.current?.abort();
    unsubscribeRef.current?.();
    searchEpochRef.current++;
    dispatch({ type: 'RESET' });
  }, [workspaceId]);

  return {
    results: state.results,
    isSearching: state.isSearching,
    isComplete: state.isComplete,
    totalMatches: state.totalMatches,
    fileCount: state.fileCount,
    truncated: state.truncated,
    error: state.error,
    search,
    clearResults,
    abort,
  };
}
