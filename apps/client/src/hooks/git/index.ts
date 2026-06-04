import { useGitDiscovery } from './useGitDiscovery';
import { useGitStatus } from './useGitStatus';
import { useGitOperations } from './useGitOperations';
import { useGitBranches } from './useGitBranches';
import { useGitStash } from './useGitStash';
import type { UseGitReposReturn } from './types';

export { useGitStatusSubscription } from './useGitStatusSubscription';

export type { UseGitReposReturn } from './types';

export function useGitRepos(
  workspaceId: string | null,
  workspaceCwd: string | null,
): UseGitReposReturn {
  const discovery = useGitDiscovery(workspaceId, workspaceCwd);
  const status = useGitStatus(workspaceId);
  const operations = useGitOperations(workspaceId);
  const branches = useGitBranches(workspaceId, discovery.refresh);
  const stash = useGitStash(workspaceId);

  return {
    // Discovery
    repos: discovery.repos,
    repoStatuses: discovery.repoStatuses,
    repoBranches: discovery.repoBranches,
    loading: discovery.loading,
    error: discovery.error,
    refresh: discovery.refresh,
    refreshRepo: discovery.refreshRepo,
    // Status
    stageFiles: status.stageFiles,
    unstageFiles: status.unstageFiles,
    discardChanges: status.discardChanges,
    stageAll: status.stageAll,
    unstageAll: status.unstageAll,
    discardAll: status.discardAll,
    // Operations
    push: operations.push,
    fetch: operations.fetch,
    pushLoading: operations.pushLoading,
    fetchLoading: operations.fetchLoading,
    pull: operations.pull,
    sync: operations.sync,
    merge: operations.merge,
    rebase: operations.rebase,
    rebaseAbort: operations.rebaseAbort,
    isRebaseInProgress: operations.isRebaseInProgress,
    commitAmend: operations.commitAmend,
    commitAll: operations.commitAll,
    resetSoft: operations.resetSoft,
    // Branches / remotes
    checkout: branches.checkout,
    branchRename: branches.branchRename,
    branchDelete: branches.branchDelete,
    branchDeleteRemote: branches.branchDeleteRemote,
    branchPublish: branches.branchPublish,
    listRemoteBranches: branches.listRemoteBranches,
    createBranchFrom: branches.createBranchFrom,
    remoteList: branches.remoteList,
    remoteAdd: branches.remoteAdd,
    remoteRemove: branches.remoteRemove,
    // Stash
    stashPush: stash.stashPush,
    stashList: stash.stashList,
    stashApply: stash.stashApply,
    stashPop: stash.stashPop,
    stashDrop: stash.stashDrop,
    stashClear: stash.stashClear,
  };
}
