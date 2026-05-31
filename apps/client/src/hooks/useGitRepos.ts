import { useState, useEffect, useCallback, useRef } from 'react';
import { sendRequest } from '../lib/send-request';
import type {
  GitRepoInfo,
  GitStatusResponse,
  GitBranch,
  GitBranchesResponse,
  GitRepoDiscoveryResponse,
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
}

export function useGitRepos(
  workspaceId: string | null,
  _workspaceCwd: string | null,
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
        { workspaceId },
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
  }, [workspaceId]);

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
  };
}
