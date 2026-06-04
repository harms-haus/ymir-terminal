import { useCallback } from 'react';
import { sendRequest } from '../../lib/send-request';
import type { GitStashEntry } from '@ymir/shared';

export interface UseGitStashReturn {
  stashPush: (
    repoPath: string,
    options?: { includeUntracked?: boolean; message?: string },
  ) => Promise<void>;
  stashList: (repoPath: string) => Promise<GitStashEntry[]>;
  stashApply: (repoPath: string, stashRef?: string) => Promise<void>;
  stashPop: (repoPath: string, stashRef?: string) => Promise<void>;
  stashDrop: (repoPath: string, stashRef: string) => Promise<void>;
  stashClear: (repoPath: string) => Promise<void>;
}

export function useGitStash(workspaceId: string | null): UseGitStashReturn {
  const stashPush = useCallback(
    async (repoPath: string, options?: { includeUntracked?: boolean; message?: string }) => {
      if (!workspaceId) return;
      await sendRequest('git.stashPush', { workspaceId, repoPath, ...options });
    },
    [workspaceId],
  );

  const stashList = useCallback(
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

  const stashApply = useCallback(
    async (repoPath: string, stashRef?: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stashApply', { workspaceId, repoPath, stashRef });
    },
    [workspaceId],
  );

  const stashPop = useCallback(
    async (repoPath: string, stashRef?: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stashPop', { workspaceId, repoPath, stashRef });
    },
    [workspaceId],
  );

  const stashDrop = useCallback(
    async (repoPath: string, stashRef: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stashDrop', { workspaceId, repoPath, stashRef });
    },
    [workspaceId],
  );

  const stashClear = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stashClear', { workspaceId, repoPath });
    },
    [workspaceId],
  );

  return {
    stashPush,
    stashList,
    stashApply,
    stashPop,
    stashDrop,
    stashClear,
  };
}
