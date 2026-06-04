import type {
  GitRepoInfo,
  GitStatusResponse,
  GitBranch,
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
