import { useState, useCallback } from 'react';
import { sendRequest } from '../../lib/send-request';

export interface UseGitOperationsReturn {
  push: (repoPath: string, branch: string) => Promise<void>;
  fetch: (repoPath: string) => Promise<void>;
  pushLoading: Map<string, boolean>;
  fetchLoading: Map<string, boolean>;
  // Pull / sync
  pull: (repoPath: string, options?: { rebase?: boolean }) => Promise<void>;
  sync: (repoPath: string) => Promise<void>;
  // Merge / rebase
  merge: (repoPath: string, branch: string) => Promise<string>;
  rebase: (repoPath: string, branch: string) => Promise<string>;
  rebaseAbort: (repoPath: string) => Promise<void>;
  isRebaseInProgress: (repoPath: string) => Promise<boolean>;
  // Enhanced commit
  commitAmend: (
    repoPath: string,
    options?: { message?: string; noEdit?: boolean },
  ) => Promise<string>;
  commitAll: (
    repoPath: string,
    message: string,
    options?: { includeUntracked?: boolean; amend?: boolean },
  ) => Promise<string>;
  resetSoft: (repoPath: string, ref?: string) => Promise<void>;
}

export function useGitOperations(workspaceId: string | null): UseGitOperationsReturn {
  const [pushLoading, setPushLoading] = useState<Map<string, boolean>>(new Map());
  const [fetchLoading, setFetchLoading] = useState<Map<string, boolean>>(new Map());

  const pushFn = useCallback(
    async (repoPath: string, branch: string) => {
      if (!workspaceId) return;
      setPushLoading((prev) => {
        const m = new Map(prev);
        m.set(repoPath, true);
        return m;
      });
      try {
        await sendRequest('git.push', { workspaceId, repoPath, branch });
      } finally {
        setPushLoading((prev) => {
          const m = new Map(prev);
          m.set(repoPath, false);
          return m;
        });
      }
    },
    [workspaceId],
  );

  const fetchFn = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      setFetchLoading((prev) => {
        const m = new Map(prev);
        m.set(repoPath, true);
        return m;
      });
      try {
        await sendRequest('git.fetch', { workspaceId, repoPath });
      } finally {
        setFetchLoading((prev) => {
          const m = new Map(prev);
          m.set(repoPath, false);
          return m;
        });
      }
    },
    [workspaceId],
  );

  // -----------------------------------------------------------------
  // Pull / sync
  // -----------------------------------------------------------------

  const pull = useCallback(
    async (repoPath: string, options?: { rebase?: boolean }) => {
      if (!workspaceId) return;
      await sendRequest('git.pull', { workspaceId, repoPath, ...options }, { timeout: 60_000 });
    },
    [workspaceId],
  );

  const sync = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.sync', { workspaceId, repoPath }, { timeout: 60_000 });
    },
    [workspaceId],
  );

  // -----------------------------------------------------------------
  // Merge / rebase
  // -----------------------------------------------------------------

  const merge = useCallback(
    async (repoPath: string, branch: string): Promise<string> => {
      if (!workspaceId) return '';
      const result = await sendRequest<{ result: string }>(
        'git.merge',
        { workspaceId, repoPath, branch },
        { timeout: 60_000 },
      );
      return result.result;
    },
    [workspaceId],
  );

  const rebase = useCallback(
    async (repoPath: string, branch: string): Promise<string> => {
      if (!workspaceId) return '';
      const result = await sendRequest<{ result: string }>(
        'git.rebase',
        { workspaceId, repoPath, branch },
        { timeout: 60_000 },
      );
      return result.result;
    },
    [workspaceId],
  );

  const rebaseAbort = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.rebaseAbort', { workspaceId, repoPath });
    },
    [workspaceId],
  );

  const isRebaseInProgress = useCallback(
    async (repoPath: string): Promise<boolean> => {
      if (!workspaceId) return false;
      const result = await sendRequest<{ inProgress: boolean }>('git.rebaseStatus', {
        workspaceId,
        repoPath,
      });
      return result.inProgress;
    },
    [workspaceId],
  );

  // -----------------------------------------------------------------
  // Enhanced commit
  // -----------------------------------------------------------------

  const commitAmend = useCallback(
    async (repoPath: string, options?: { message?: string; noEdit?: boolean }): Promise<string> => {
      if (!workspaceId) return '';
      const result = await sendRequest<{ commitHash: string }>('git.commitAmend', {
        workspaceId,
        repoPath,
        ...options,
      });
      return result.commitHash;
    },
    [workspaceId],
  );

  const commitAll = useCallback(
    async (
      repoPath: string,
      message: string,
      options?: { includeUntracked?: boolean; amend?: boolean },
    ): Promise<string> => {
      if (!workspaceId) return '';
      const result = await sendRequest<{ commitHash: string }>('git.commitAll', {
        workspaceId,
        repoPath,
        message,
        ...options,
      });
      return result.commitHash;
    },
    [workspaceId],
  );

  const resetSoft = useCallback(
    async (repoPath: string, ref?: string) => {
      if (!workspaceId) return;
      await sendRequest('git.resetSoft', { workspaceId, repoPath, ref });
    },
    [workspaceId],
  );

  return {
    push: pushFn,
    fetch: fetchFn,
    pushLoading,
    fetchLoading,
    // Pull / sync
    pull,
    sync,
    // Merge / rebase
    merge,
    rebase,
    rebaseAbort,
    isRebaseInProgress,
    // Enhanced commit
    commitAmend,
    commitAll,
    resetSoft,
  };
}
