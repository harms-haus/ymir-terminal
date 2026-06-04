import { useState, useEffect, useCallback, useRef } from 'react';
import { sendRequest } from '../../lib/send-request';
import { wsClient } from '../../lib/ws-client';
import { useGitStatusSubscription } from './useGitStatusSubscription';
import type {
  GitRepoInfo,
  GitStatusResponse,
  GitBranch,
  GitBranchesResponse,
  GitRepoDiscoveryResponse,
  GitRepoDiscoveryProgressEvent,
  MessageEnvelope,
} from '@ymir/shared';

export interface UseGitDiscoveryReturn {
  repos: GitRepoInfo[];
  repoStatuses: Map<string, GitStatusResponse>;
  repoBranches: Map<string, GitBranch[]>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshRepo: (repoPath: string, options?: { statusOnly?: boolean }) => void;
}

export function useGitDiscovery(
  workspaceId: string | null,
  workspaceCwd: string | null,
): UseGitDiscoveryReturn {
  const [repos, setRepos] = useState<GitRepoInfo[]>([]);
  const [repoStatuses, setRepoStatuses] = useState<Map<string, GitStatusResponse>>(new Map());
  const [repoBranches, setRepoBranches] = useState<Map<string, GitBranch[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const discoveredGenerationRef = useRef(0);
  const fetchedRepoPathsRef = useRef<Set<string>>(new Set());
  const reposRef = useRef<GitRepoInfo[]>([]);

  // Subscribe to push-based git status updates
  const handleStatusChange = useCallback((repoPath: string, status: GitStatusResponse) => {
    setRepoStatuses((prev) => {
      const m = new Map(prev);
      m.set(repoPath, status);
      return m;
    });
  }, []);

  useGitStatusSubscription(workspaceId, handleStatusChange);

  // Keep reposRef in sync with repos state (used by progress event handler below).
  useEffect(() => {
    reposRef.current = repos;
  }, [repos]);

  // ---------------------------------------------------------------------------
  // Subscribe to incremental repo-discovery progress events so the UI can render
  // repos as soon as the server finds them, rather than waiting for the full
  // discovery response (which can be slow for large workspaces).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!workspaceId) return;

    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      const payload = envelope.payload as GitRepoDiscoveryProgressEvent | undefined;
      if (
        envelope.type === 'event' &&
        envelope.channel === 'git.repoDiscovery.progress' &&
        payload?.workspaceId === workspaceId
      ) {
        // Capture the generation at event-arrival time — compare below to discard
        // stale events from a previous, superseded discovery cycle.
        const gen = generationRef.current;

        // If there is no active discovery for this generation, ignore.
        if (gen === 0) return;

        // After the final discovery response arrives we record the generation so
        // late-arriving progress events from this cycle are ignored.
        if (discoveredGenerationRef.current === gen) return;

        // Filter to repos we haven't seen yet — both in current state and in the
        // set of repos whose status/branches were already fetched by earlier events.
        const existingPaths = new Set(reposRef.current.map((r) => r.path));
        const newRepos = payload.repos.filter((r) => !existingPaths.has(r.path));
        if (newRepos.length === 0) return;

        // Kick off status/branches requests for each new repo in parallel so
        // the UI can show per-repo details as soon as the data arrives.
        for (const repo of newRepos) {
          const repoPath = repo.path;
          const genForRequest = generationRef.current;
          const signal = abortRef.current?.signal;
          // Mark eagerly at dispatch time so the final discovery response
          // (loadData) won't fire duplicate requests for in-flight repos.
          fetchedRepoPathsRef.current.add(repoPath);
          Promise.all([
            sendRequest<GitStatusResponse>('git.status', { workspaceId, repoPath }, { signal }),
            sendRequest<GitBranchesResponse>(
              'git.branches',
              { workspaceId, repoPath },
              { signal },
            ).catch(() => ({ branches: [] as GitBranch[], current: null })),
          ])
            .then(([statusRes, branchesRes]) => {
              if (genForRequest !== generationRef.current) return;
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
            })
            .catch(() => {
              // Ignore errors for individual repo status fetches.
            });
        }

        // Then update state (only if generation hasn't changed).
        if (gen === generationRef.current) {
          setRepos((prevRepos) => [...prevRepos, ...newRepos]);
        }
      }
    });

    return unsub;
  }, [workspaceId]);

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

    // Mark discovery as in-progress for the new generation.
    discoveredGenerationRef.current = 0;
    fetchedRepoPathsRef.current = new Set();

    setLoading(true);
    setError(null);
    setRepos([]);
    setRepoStatuses(new Map());
    setRepoBranches(new Map());

    try {
      const discovery = await sendRequest<GitRepoDiscoveryResponse>(
        'git.repoDiscovery',
        { workspaceId, ...(workspaceCwd ? { repoPath: workspaceCwd } : {}) },
        { signal: controller.signal },
      );

      if (gen !== generationRef.current) return;

      // Set repos to the complete sorted list (ensures consistency even if
      // progress events were missed or arrived late).
      setRepos(discovery.repos);

      // For repos in the final response that weren't covered by a progress
      // event (e.g. they arrived after the last progress event, or progress
      // events were missed), fetch their status/branches now.
      const reposToFetch = discovery.repos.filter(
        (repo) => !fetchedRepoPathsRef.current.has(repo.path),
      );

      // Fetch status/branches for all remaining repos in parallel.
      await Promise.allSettled(
        reposToFetch.map((repo) => {
          const repoPath = repo.path;
          return Promise.all([
            sendRequest<GitStatusResponse>(
              'git.status',
              { workspaceId, repoPath },
              { signal: controller.signal },
            ),
            sendRequest<GitBranchesResponse>(
              'git.branches',
              { workspaceId, repoPath },
              { signal: controller.signal },
            ).catch(() => ({ branches: [] as GitBranch[], current: null })),
          ])
            .then(([statusRes, branchesRes]) => {
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
            })
            .catch(() => {
              // Ignore errors for individual repo status/branches fetches.
            });
        }),
      );

      // Mark discovery complete for this generation so subsequent progress
      // events are ignored.
      discoveredGenerationRef.current = gen;
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

  return {
    repos,
    repoStatuses,
    repoBranches,
    loading,
    error,
    refresh: loadData,
    refreshRepo,
  };
}
