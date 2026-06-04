import { useCallback } from 'react';
import { sendRequest } from '../../lib/send-request';

export interface UseGitStatusReturn {
  stageFiles: (repoPath: string, files: string[]) => Promise<void>;
  unstageFiles: (repoPath: string, files: string[]) => Promise<void>;
  discardChanges: (repoPath: string, files: string[]) => Promise<void>;
  // Bulk changes
  stageAll: (repoPath: string) => Promise<void>;
  unstageAll: (repoPath: string) => Promise<void>;
  discardAll: (repoPath: string) => Promise<void>;
}

export function useGitStatus(workspaceId: string | null): UseGitStatusReturn {
  const stageFiles = useCallback(
    async (repoPath: string, files: string[]) => {
      if (!workspaceId) return;
      await sendRequest('git.stage', { workspaceId, repoPath, files });
    },
    [workspaceId],
  );

  const unstageFiles = useCallback(
    async (repoPath: string, files: string[]) => {
      if (!workspaceId) return;
      await sendRequest('git.unstage', { workspaceId, repoPath, files });
    },
    [workspaceId],
  );

  const discardChanges = useCallback(
    async (repoPath: string, files: string[]) => {
      if (!workspaceId) return;
      await sendRequest('git.discard', { workspaceId, repoPath, files });
    },
    [workspaceId],
  );

  // -----------------------------------------------------------------
  // Bulk changes
  // -----------------------------------------------------------------

  const stageAll = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.stageAll', { workspaceId, repoPath });
    },
    [workspaceId],
  );

  const unstageAll = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.unstageAll', { workspaceId, repoPath });
    },
    [workspaceId],
  );

  const discardAll = useCallback(
    async (repoPath: string) => {
      if (!workspaceId) return;
      await sendRequest('git.discardAll', { workspaceId, repoPath });
    },
    [workspaceId],
  );

  return {
    stageFiles,
    unstageFiles,
    discardChanges,
    // Bulk changes
    stageAll,
    unstageAll,
    discardAll,
  };
}
