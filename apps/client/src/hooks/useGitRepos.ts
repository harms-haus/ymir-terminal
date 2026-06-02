import { useState, useEffect, useCallback, useRef } from 'react';
import { sendRequest } from '../lib/send-request';
import type {
  GitRepoInfo,
  GitStatusResponse,
  GitBranch,
  GitBranchesResponse,
  GitRepoDiscoveryResponse,
  GitStashEntry,
  GitRemoteEntry,
} from '@ymir/shared';

export interface UseGitReposReturn {
  repos: GitRepoInfo[];
  repoStatuses: Map<string, GitStatusResponse>;
  repoBranches: Map<string, GitBranch[]>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  refreshRepo: (repoPath: string, options?: { statusOnly?: boolean }) => void;
  stageFiles: (repoPath: string, files: string[]) => Promise<void>;
  unstageFiles: (repoPath: string, files: string[]) => Promise<void>;
  discardChanges: (repoPath: string, files: string[]) => Promise<void>;
  commit: (repoPath: string, message: string) => Promise<string>;
  checkout: (repoPath: string, branch: string, createNew?: boolean) => Promise<void>;
  push: (repoPath: string, branch: string) => Promise<void>;
  fetch: (repoPath: string) => Promise<void>;
  pushLoading: Map<string, boolean>;
  fetchLoading: Map<string, boolean>;
  // Stash
  stashPush: (
    repoPath: string,
    options?: { includeUntracked?: boolean; message?: string },
  ) => Promise<void>;
  stashList: (repoPath: string) => Promise<GitStashEntry[]>;
  stashApply: (repoPath: string, stashRef?: string) => Promise<void>;
  stashPop: (repoPath: string, stashRef?: string) => Promise<void>;
  stashDrop: (repoPath: string, stashRef: string) => Promise<void>;
  stashClear: (repoPath: string) => Promise<void>;
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
  // Bulk changes
  stageAll: (repoPath: string) => Promise<void>;
  unstageAll: (repoPath: string) => Promise<void>;
  discardAll: (repoPath: string) => Promise<void>;
  // Enhanced branch
  branchRename: (repoPath: string, oldName: string, newName: string) => Promise<void>;
  branchDelete: (repoPath: string, name: string, force?: boolean) => Promise<void>;
  branchDeleteRemote: (repoPath: string, remote: string, branch: string) => Promise<void>;
  branchPublish: (repoPath: string, remote?: string) => Promise<void>;
  listRemoteBranches: (repoPath: string) => Promise<GitBranch[]>;
  createBranchFrom: (repoPath: string, name: string, startPoint: string) => Promise<void>;
  // Remote management
  remoteList: (repoPath: string) => Promise<GitRemoteEntry[]>;
  remoteAdd: (repoPath: string, name: string, url: string) => Promise<void>;
  remoteRemove: (repoPath: string, name: string) => Promise<void>;
}

export function useGitRepos(
  workspaceId: string | null,
  workspaceCwd: string | null,
): UseGitReposReturn {
  const [repos, setRepos] = useState<GitRepoInfo[]>([]);
  const [repoStatuses, setRepoStatuses] = useState<Map<string, GitStatusResponse>>(new Map());
  const [repoBranches, setRepoBranches] = useState<Map<string, GitBranch[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushLoading, setPushLoading] = useState<Map<string, boolean>>(new Map());
  const [fetchLoading, setFetchLoading] = useState<Map<string, boolean>>(new Map());
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (!workspaceId) {
      setRepos([]);
      setRepoStatuses(new Map());
      setRepoBranches(new Map());
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++generationRef.current;

    setLoading(true);
    setError(null);

    try {
      const discovery = await sendRequest<GitRepoDiscoveryResponse>(
        'git.repoDiscovery',
        { workspaceId, ...(workspaceCwd ? { repoPath: workspaceCwd } : {}) },
        { signal: controller.signal },
      );

      if (gen !== generationRef.current) return;

      setRepos(discovery.repos);

      if (discovery.repos.length === 0) {
        setRepoStatuses(new Map());
        setRepoBranches(new Map());
        setLoading(false);
        return;
      }

      const statusPromises = discovery.repos.map(async (repo) => {
        const [statusRes, branchesRes] = await Promise.all([
          sendRequest<GitStatusResponse>(
            'git.status',
            { workspaceId, repoPath: repo.path },
            { signal: controller.signal },
          ),
          sendRequest<GitBranchesResponse>(
            'git.branches',
            { workspaceId, repoPath: repo.path },
            { signal: controller.signal },
          ).catch(() => ({ branches: [] as GitBranch[], current: null })),
        ]);
        return {
          repoPath: repo.path,
          status: statusRes,
          branches: branchesRes.branches,
        };
      });

      const results = await Promise.all(statusPromises);
      if (gen !== generationRef.current) return;

      const newStatuses = new Map<string, GitStatusResponse>();
      const newBranches = new Map<string, GitBranch[]>();
      for (const r of results) {
        newStatuses.set(r.repoPath, r.status);
        newBranches.set(r.repoPath, r.branches);
      }
      setRepoStatuses(newStatuses);
      setRepoBranches(newBranches);
    } catch (err) {
      if (gen !== generationRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (gen === generationRef.current) setLoading(false);
    }
  }, [workspaceId, workspaceCwd]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const refreshRepo = useCallback(
    async (repoPath: string, options?: { statusOnly?: boolean }) => {
      if (!workspaceId) return;
      const gen = generationRef.current;
      try {
        const statusRes = await sendRequest<GitStatusResponse>('git.status', {
          workspaceId,
          repoPath,
        });
        if (gen !== generationRef.current) return;
        if (options?.statusOnly) {
          setRepoStatuses((prev) => {
            const m = new Map(prev);
            m.set(repoPath, statusRes);
            return m;
          });
          return;
        }
        const branchesRes = await sendRequest<GitBranchesResponse>('git.branches', {
          workspaceId,
          repoPath,
        }).catch(() => ({ branches: [] as GitBranch[], current: null }));
        if (gen !== generationRef.current) return;
        setRepoStatuses((prev) => {
          const m = new Map(prev);
          m.set(repoPath, statusRes);
          return m;
        });
        setRepoBranches((prev) => {
          const m = new Map(prev);
          m.set(repoPath, branchesRes.branches);
          return m;
        });
      } catch (err) {
        if (gen !== generationRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [workspaceId],
  );

  const stageFilesFn = useCallback(
    async (repoPath: string, files: string[]) => {
      if (!workspaceId) return;
      await sendRequest('git.stage', { workspaceId, repoPath, files });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  const unstageFilesFn = useCallback(
    async (repoPath: string, files: string[]) => {
      if (!workspaceId) return;
      await sendRequest('git.unstage', { workspaceId, repoPath, files });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  const discardChangesFn = useCallback(
    async (repoPath: string, files: string[]) => {
      if (!workspaceId) return;
      await sendRequest('git.discard', { workspaceId, repoPath, files });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  const commitFn = useCallback(
    async (repoPath: string, message: string): Promise<string> => {
      if (!workspaceId) return '';
      const res = await sendRequest<{ commitHash: string }>('git.commit', {
        workspaceId,
        repoPath,
        message,
      });
      await refreshRepo(repoPath);
      return res.commitHash;
    },
    [workspaceId, refreshRepo],
  );

  const checkoutFn = useCallback(
    async (repoPath: string, branch: string, createNew?: boolean) => {
      if (!workspaceId) return;
      await sendRequest('git.checkout', {
        workspaceId,
        repoPath,
        branch,
        createNew,
      });
      await loadData();
    },
    [workspaceId, loadData],
  );

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
        await refreshRepo(repoPath);
      } finally {
        setPushLoading((prev) => {
          const m = new Map(prev);
          m.set(repoPath, false);
          return m;
        });
      }
    },
    [workspaceId, refreshRepo],
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
        await refreshRepo(repoPath);
      } finally {
        setFetchLoading((prev) => {
          const m = new Map(prev);
          m.set(repoPath, false);
          return m;
        });
      }
    },
    [workspaceId, refreshRepo],
  );

  // -----------------------------------------------------------------
  // Stash
  // -----------------------------------------------------------------

  const stashPushFn = useCallback(
    async (repoPath: string, options?: { includeUntracked?: boolean; message?: string }) => {
      if (!workspaceId) return;
      await sendRequest('git.stashPush', { workspaceId, repoPath, ...options });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  const stashListFn = useCallback(
    async (repoPath: string): Promise<GitStashEntry[]> => {
      if (!workspaceId) return [];
      const result = await sendRequest<{ stashes: GitStashEntry[] }>('git.stashList', {
        workspaceId,
        repoPath,
      });
      return result.stashes;
    },
    [workspaceId],
  );

  const stashApplyFn = useCallback(
    async (repoPath: string, stashRef?: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stashApply', { workspaceId, repoPath, stashRef });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  const stashPopFn = useCallback(
    async (repoPath: string, stashRef?: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stashPop', { workspaceId, repoPath, stashRef });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  const stashDropFn = useCallback(
    async (repoPath: string, stashRef: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stashDrop', { workspaceId, repoPath, stashRef });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  const stashClearFn = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stashClear', { workspaceId, repoPath });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  // -----------------------------------------------------------------
  // Pull / sync
  // -----------------------------------------------------------------

  const pullFn = useCallback(
    async (repoPath: string, options?: { rebase?: boolean }) => {
      if (!workspaceId) return;
      await sendRequest('git.pull', { workspaceId, repoPath, ...options }, { timeout: 60_000 });
      await refreshRepo(repoPath);
    },
    [workspaceId, refreshRepo],
  );

  const syncFn = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.sync', { workspaceId, repoPath }, { timeout: 60_000 });
      await refreshRepo(repoPath);
    },
    [workspaceId, refreshRepo],
  );

  // -----------------------------------------------------------------
  // Merge / rebase
  // -----------------------------------------------------------------

  const mergeFn = useCallback(
    async (repoPath: string, branch: string): Promise<string> => {
      if (!workspaceId) return '';
      const result = await sendRequest<{ result: string }>(
        'git.merge',
        { workspaceId, repoPath, branch },
        { timeout: 60_000 },
      );
      await refreshRepo(repoPath);
      return result.result;
    },
    [workspaceId, refreshRepo],
  );

  const rebaseFn = useCallback(
    async (repoPath: string, branch: string): Promise<string> => {
      if (!workspaceId) return '';
      const result = await sendRequest<{ result: string }>(
        'git.rebase',
        { workspaceId, repoPath, branch },
        { timeout: 60_000 },
      );
      await refreshRepo(repoPath);
      return result.result;
    },
    [workspaceId, refreshRepo],
  );

  const rebaseAbortFn = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.rebaseAbort', { workspaceId, repoPath });
      await refreshRepo(repoPath);
    },
    [workspaceId, refreshRepo],
  );

  const isRebaseInProgressFn = useCallback(
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

  const commitAmendFn = useCallback(
    async (repoPath: string, options?: { message?: string; noEdit?: boolean }): Promise<string> => {
      if (!workspaceId) return '';
      const result = await sendRequest<{ commitHash: string }>('git.commitAmend', {
        workspaceId,
        repoPath,
        ...options,
      });
      await refreshRepo(repoPath);
      return result.commitHash;
    },
    [workspaceId, refreshRepo],
  );

  const commitAllFn = useCallback(
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
      await refreshRepo(repoPath);
      return result.commitHash;
    },
    [workspaceId, refreshRepo],
  );

  const resetSoftFn = useCallback(
    async (repoPath: string, ref?: string) => {
      if (!workspaceId) return;
      await sendRequest('git.resetSoft', { workspaceId, repoPath, ref });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  // -----------------------------------------------------------------
  // Bulk changes
  // -----------------------------------------------------------------

  const stageAllFn = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stageAll', { workspaceId, repoPath });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  const unstageAllFn = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.unstageAll', { workspaceId, repoPath });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  const discardAllFn = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.discardAll', { workspaceId, repoPath });
      await refreshRepo(repoPath, { statusOnly: true });
    },
    [workspaceId, refreshRepo],
  );

  // -----------------------------------------------------------------
  // Enhanced branch
  // -----------------------------------------------------------------

  const branchRenameFn = useCallback(
    async (repoPath: string, oldName: string, newName: string) => {
      if (!workspaceId) return;
      await sendRequest('git.branchRename', { workspaceId, repoPath, oldName, newName });
      await refreshRepo(repoPath);
    },
    [workspaceId, refreshRepo],
  );

  const branchDeleteFn = useCallback(
    async (repoPath: string, name: string, force?: boolean) => {
      if (!workspaceId) return;
      await sendRequest('git.branchDelete', { workspaceId, repoPath, name, force });
      await refreshRepo(repoPath);
    },
    [workspaceId, refreshRepo],
  );

  const branchDeleteRemoteFn = useCallback(
    async (repoPath: string, remote: string, branch: string) => {
      if (!workspaceId) return;
      await sendRequest('git.branchDeleteRemote', { workspaceId, repoPath, remote, branch });
      await refreshRepo(repoPath);
    },
    [workspaceId, refreshRepo],
  );

  const branchPublishFn = useCallback(
    async (repoPath: string, remote?: string) => {
      if (!workspaceId) return;
      await sendRequest(
        'git.branchPublish',
        { workspaceId, repoPath, remote },
        { timeout: 60_000 },
      );
      await refreshRepo(repoPath);
    },
    [workspaceId, refreshRepo],
  );

  const listRemoteBranchesFn = useCallback(
    async (repoPath: string): Promise<GitBranch[]> => {
      if (!workspaceId) return [];
      const result = await sendRequest<{ branches: GitBranch[] }>('git.branchesRemote', {
        workspaceId,
        repoPath,
      });
      return result.branches;
    },
    [workspaceId],
  );

  const createBranchFromFn = useCallback(
    async (repoPath: string, name: string, startPoint: string) => {
      if (!workspaceId) return;
      await sendRequest('git.branchCreateFrom', { workspaceId, repoPath, name, startPoint });
      await loadData();
    },
    [workspaceId, loadData],
  );

  // -----------------------------------------------------------------
  // Remote management
  // -----------------------------------------------------------------

  const remoteListFn = useCallback(
    async (repoPath: string): Promise<GitRemoteEntry[]> => {
      if (!workspaceId) return [];
      const result = await sendRequest<{ remotes: GitRemoteEntry[] }>('git.remoteList', {
        workspaceId,
        repoPath,
      });
      return result.remotes;
    },
    [workspaceId],
  );

  const remoteAddFn = useCallback(
    async (repoPath: string, name: string, url: string) => {
      if (!workspaceId) return;
      await sendRequest('git.remoteAdd', { workspaceId, repoPath, name, url });
      await refreshRepo(repoPath);
    },
    [workspaceId, refreshRepo],
  );

  const remoteRemoveFn = useCallback(
    async (repoPath: string, name: string) => {
      if (!workspaceId) return;
      await sendRequest('git.remoteRemove', { workspaceId, repoPath, name });
      await refreshRepo(repoPath);
    },
    [workspaceId, refreshRepo],
  );

  return {
    repos,
    repoStatuses,
    repoBranches,
    loading,
    error,
    refresh: loadData,
    refreshRepo,
    stageFiles: stageFilesFn,
    unstageFiles: unstageFilesFn,
    discardChanges: discardChangesFn,
    commit: commitFn,
    checkout: checkoutFn,
    push: pushFn,
    fetch: fetchFn,
    pushLoading,
    fetchLoading,
    // Stash
    stashPush: stashPushFn,
    stashList: stashListFn,
    stashApply: stashApplyFn,
    stashPop: stashPopFn,
    stashDrop: stashDropFn,
    stashClear: stashClearFn,
    // Pull / sync
    pull: pullFn,
    sync: syncFn,
    // Merge / rebase
    merge: mergeFn,
    rebase: rebaseFn,
    rebaseAbort: rebaseAbortFn,
    isRebaseInProgress: isRebaseInProgressFn,
    // Enhanced commit
    commitAmend: commitAmendFn,
    commitAll: commitAllFn,
    resetSoft: resetSoftFn,
    // Bulk changes
    stageAll: stageAllFn,
    unstageAll: unstageAllFn,
    discardAll: discardAllFn,
    // Enhanced branch
    branchRename: branchRenameFn,
    branchDelete: branchDeleteFn,
    branchDeleteRemote: branchDeleteRemoteFn,
    branchPublish: branchPublishFn,
    listRemoteBranches: listRemoteBranchesFn,
    createBranchFrom: createBranchFromFn,
    // Remote management
    remoteList: remoteListFn,
    remoteAdd: remoteAddFn,
    remoteRemove: remoteRemoveFn,
  };
}
