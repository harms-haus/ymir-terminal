import { useCallback } from 'react';
import { sendRequest } from '../../lib/send-request';
import type { GitBranch, GitRemoteEntry } from '@ymir/shared';

export interface UseGitBranchesReturn {
  checkout: (repoPath: string, branch: string, createNew?: boolean) => Promise<void>;
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

export function useGitBranches(
  workspaceId: string | null,
  refresh: () => Promise<void>,
): UseGitBranchesReturn {
  const checkout = useCallback(
    async (repoPath: string, branch: string, createNew?: boolean) => {
      if (!workspaceId) return;
      await sendRequest('git.checkout', {
        workspaceId,
        repoPath,
        branch,
        createNew,
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const branchRename = useCallback(
    async (repoPath: string, oldName: string, newName: string) => {
      if (!workspaceId) return;
      await sendRequest('git.branchRename', { workspaceId, repoPath, oldName, newName });
    },
    [workspaceId],
  );

  const branchDelete = useCallback(
    async (repoPath: string, name: string, force?: boolean) => {
      if (!workspaceId) return;
      await sendRequest('git.branchDelete', { workspaceId, repoPath, name, force });
    },
    [workspaceId],
  );

  const branchDeleteRemote = useCallback(
    async (repoPath: string, remote: string, branch: string) => {
      if (!workspaceId) return;
      await sendRequest('git.branchDeleteRemote', { workspaceId, repoPath, remote, branch });
    },
    [workspaceId],
  );

  const branchPublish = useCallback(
    async (repoPath: string, remote?: string) => {
      if (!workspaceId) return;
      await sendRequest(
        'git.branchPublish',
        { workspaceId, repoPath, remote },
        { timeout: 60_000 },
      );
    },
    [workspaceId],
  );

  const listRemoteBranches = useCallback(
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

  const createBranchFrom = useCallback(
    async (repoPath: string, name: string, startPoint: string) => {
      if (!workspaceId) return;
      await sendRequest('git.branchCreateFrom', { workspaceId, repoPath, name, startPoint });
      await refresh();
    },
    [workspaceId, refresh],
  );

  // -----------------------------------------------------------------
  // Remote management
  // -----------------------------------------------------------------

  const remoteList = useCallback(
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

  const remoteAdd = useCallback(
    async (repoPath: string, name: string, url: string) => {
      if (!workspaceId) return;
      await sendRequest('git.remoteAdd', { workspaceId, repoPath, name, url });
    },
    [workspaceId],
  );

  const remoteRemove = useCallback(
    async (repoPath: string, name: string) => {
      if (!workspaceId) return;
      await sendRequest('git.remoteRemove', { workspaceId, repoPath, name });
    },
    [workspaceId],
  );

  return {
    checkout,
    branchRename,
    branchDelete,
    branchDeleteRemote,
    branchPublish,
    listRemoteBranches,
    createBranchFrom,
    // Remote management
    remoteList,
    remoteAdd,
    remoteRemove,
  };
}
