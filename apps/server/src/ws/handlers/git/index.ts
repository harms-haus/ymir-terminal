import type { Database } from 'bun:sqlite';
import type { GitStashEntry } from '@ymir/shared';
import type { MessageRouter } from '../../router';
import {
  type GitStatusResponse,
  type GitLogItem,
  type GitRepoInfo,
  type GitBranch,
  type GitWorktreeInfo,
} from '@ymir/shared';
import type { CommitDetails } from '../../../git/commit-details';
import { GitStatusCache } from '../../../git/status-cache';
import type { GitStatusWatcher } from '../../../git/status-watcher';

// Native git implementations (used as fallbacks when _mocks are absent)
import { getGitStatus as nativeGetGitStatus } from '../../../git/status';
import { getGitStatusEnhanced as nativeGetGitStatusEnhanced } from '../../../git/status';
import { getGitLog as nativeGetGitLog } from '../../../git/log';
import { discoverRepos as nativeDiscoverRepos } from '../../../git/discovery';
import {
  stageFiles as nativeStageFiles,
  unstageFiles as nativeUnstageFiles,
  discardChanges as nativeDiscardChanges,
  commitChanges as nativeCommitChanges,
  stageAllFiles as nativeStageAllFiles,
  unstageAllFiles as nativeUnstageAllFiles,
  discardAllChanges as nativeDiscardAllChanges,
  commitAmend as nativeCommitAmend,
  commitAll as nativeCommitAll,
  resetSoft as nativeResetSoft,
} from '../../../git/operations';
import {
  listBranches as nativeListBranches,
  createBranch as nativeCreateBranch,
  checkoutBranch as nativeCheckoutBranch,
  renameBranch as nativeRenameBranch,
  deleteBranch as nativeDeleteBranch,
  deleteRemoteBranch as nativeDeleteRemoteBranch,
  publishBranch as nativePublishBranch,
  listRemoteBranches as nativeListRemoteBranches,
  createBranchFrom as nativeCreateBranchFrom,
} from '../../../git/branches';
import {
  pushBranch as nativePushBranch,
  fetchRemote as nativeFetchRemote,
  listRemotes as nativeListRemotes,
  addRemote as nativeAddRemote,
  removeRemote as nativeRemoveRemote,
} from '../../../git/remote';
import {
  mergeBranch as nativeMergeBranch,
  rebaseBranch as nativeRebaseBranch,
  rebaseAbort as nativeRebaseAbort,
  isRebaseInProgress as nativeIsRebaseInProgress,
} from '../../../git/merge';
import { pullRemote as nativePullRemote, syncRemote as nativeSyncRemote } from '../../../git/pull';
import { getCurrentBranch as nativeGetCurrentBranch } from '../../../git/status';
import {
  getDiffData as nativeGetDiffData,
  getCommitFileDiff as nativeGetCommitFileDiff,
} from '../../../git/diff';
import { getCommitDetails as nativeGetCommitDetails } from '../../../git/commit-details';
import {
  listWorktrees as nativeListWorktrees,
  createWorktree as nativeCreateWorktree,
  removeWorktree as nativeRemoveWorktree,
  mergeWorktree as nativeMergeWorktree,
  listUntrackedFiles as nativeListUntrackedFiles,
  readWorktreeCopyConfig as nativeReadWorktreeCopyConfig,
  writeWorktreeCopyConfig as nativeWriteWorktreeCopyConfig,
} from '../../../git/worktrees';
import { copyFile as nativeCopyFile } from '../../../files/operations';
import {
  stashPush as nativeStashPush,
  stashList as nativeStashList,
  stashApply as nativeStashApply,
  stashPop as nativeStashPop,
  stashDrop as nativeStashDrop,
  stashClear as nativeStashClear,
} from '../../../git/stash';
import type { Workspace } from '../../../db/persistent';
import { getWorkspace as dbGetWorkspace } from '../../../db/persistent';

// Domain registration functions (stubs — handlers will be moved in follow-up tasks)
import { registerStatusHandlers } from './status';
import { registerOperationsHandlers } from './operations';
import { registerBranchesHandlers } from './branches';
import { registerRemoteHandlers } from './remote';
import { registerDiffHandlers } from './diff';
import { registerWorktreeHandlers } from './worktrees';
import { registerMergeHandlers } from './merge';
import { registerStashHandlers } from './stash';
import { createInvalidator } from './shared';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface GitDeps {
  persistentDb: Database;
  /** GitStatusCache instance (optional — defaults to fresh cache when absent). */
  gitStatusCache?: GitStatusCache;
  /** GitStatusWatcher instance (optional — cache-only mode when absent). */
  gitStatusWatcher?: GitStatusWatcher;
  /** Map tracking git dir → workspace metadata (shared with workspace handlers). */
  watchedGitDirs?: Map<string, { workspaceId: string; repoPath: string }>;
  /** Internal: allows tests to inject mock functions. */
  _mocks?: {
    getGitStatus?: (dirPath: string) => Promise<GitStatusResponse | null>;
    getGitStatusEnhanced?: (
      dirPath: string,
    ) => Promise<
      (GitStatusResponse & { hasRemote: boolean; ahead: number; behind: number }) | null
    >;
    getGitLog?: (dirPath: string, skip: number, limit: number) => Promise<GitLogItem[]>;
    getWorkspace?: (db: Database, id: string) => Workspace | null;
    discoverRepos?: (
      workspaceCwd: string,
      maxDepth?: number,
      onDepthComplete?: (repos: GitRepoInfo[], depth: number) => void,
    ) => Promise<GitRepoInfo[]>;
    stageFiles?: (dirPath: string, files: string[]) => Promise<void>;
    unstageFiles?: (dirPath: string, files: string[]) => Promise<void>;
    discardChanges?: (dirPath: string, files: string[]) => Promise<void>;
    commitChanges?: (dirPath: string, message: string) => Promise<string>;
    stageAllFiles?: (dirPath: string) => Promise<void>;
    unstageAllFiles?: (dirPath: string) => Promise<void>;
    discardAllChanges?: (dirPath: string) => Promise<void>;
    commitAmend?: (
      dirPath: string,
      options?: { message?: string; noEdit?: boolean },
    ) => Promise<string>;
    commitAll?: (
      dirPath: string,
      message: string,
      options?: { includeUntracked?: boolean; amend?: boolean },
    ) => Promise<string>;
    resetSoft?: (dirPath: string, ref?: string) => Promise<void>;
    listBranches?: (dirPath: string) => Promise<{ branches: GitBranch[]; current: string | null }>;
    createBranch?: (dirPath: string, name: string) => Promise<void>;
    checkoutBranch?: (dirPath: string, name: string) => Promise<void>;
    renameBranch?: (dirPath: string, oldName: string, newName: string) => Promise<void>;
    deleteBranch?: (dirPath: string, name: string, force?: boolean) => Promise<void>;
    deleteRemoteBranch?: (dirPath: string, remote: string, branch: string) => Promise<void>;
    publishBranch?: (dirPath: string, remote?: string) => Promise<void>;
    listRemoteBranches?: (
      dirPath: string,
    ) => Promise<{ branches: GitBranch[]; current: string | null }>;
    createBranchFrom?: (dirPath: string, name: string, startPoint: string) => Promise<void>;
    pushBranch?: (dirPath: string, branch: string) => Promise<void>;
    fetchRemote?: (dirPath: string) => Promise<void>;
    addRemote?: (dirPath: string, name: string, url: string) => Promise<void>;
    removeRemote?: (dirPath: string, name: string) => Promise<void>;
    listRemotes?: (
      dirPath: string,
    ) => Promise<{ name: string; fetchUrl: string; pushUrl: string }[]>;
    getDiffData?: (
      repoDir: string,
      filePath: string,
      staged: boolean,
    ) => Promise<{
      originalContent: string;
      modifiedContent: string;
      additions: number;
      deletions: number;
    }>;
    getCommitDetails?: (dirPath: string, commitSha: string) => Promise<CommitDetails | null>;
    getCommitFileDiff?: (
      repoDir: string,
      commitSha: string,
      parentSha: string,
      filePath: string,
    ) => Promise<{
      originalContent: string;
      modifiedContent: string;
      additions: number;
      deletions: number;
    }>;
    listWorktrees?: (dirPath: string) => Promise<GitWorktreeInfo[]>;
    createWorktree?: (
      dirPath: string,
      branchName: string,
      startRef?: string,
    ) => Promise<GitWorktreeInfo>;
    removeWorktree?: (dirPath: string, worktreePath: string, force?: boolean) => Promise<void>;
    mergeWorktree?: (
      dirPath: string,
      worktreePath: string,
      options?: { targetBranch?: string; deleteAfterMerge?: boolean },
    ) => Promise<{ success: boolean; message: string; worktreeRemoved: boolean }>;
    listUntrackedFiles?: (dirPath: string) => Promise<string[]>;
    readWorktreeCopyConfig?: (dirPath: string) => Promise<string[]>;
    writeWorktreeCopyConfig?: (dirPath: string, files: string[]) => Promise<void>;
    copyFile?: (src: string, dest: string) => Promise<void>;
    mergeBranch?: (dirPath: string, branch: string) => Promise<string>;
    rebaseBranch?: (dirPath: string, branch: string) => Promise<string>;
    rebaseAbort?: (dirPath: string) => Promise<void>;
    isRebaseInProgress?: (dirPath: string) => Promise<boolean>;
    pullRemote?: (dirPath: string, rebase?: boolean) => Promise<void>;
    syncRemote?: (dirPath: string, branch: string) => Promise<void>;
    getCurrentBranch?: (dirPath: string) => Promise<string | null>;
    stashPush?: (
      dirPath: string,
      options?: { includeUntracked?: boolean; message?: string },
    ) => Promise<string>;
    stashList?: (dirPath: string) => Promise<GitStashEntry[]>;
    stashApply?: (dirPath: string, stashRef?: string) => Promise<void>;
    stashPop?: (dirPath: string, stashRef?: string) => Promise<void>;
    stashDrop?: (dirPath: string, stashRef: string) => Promise<void>;
    stashClear?: (dirPath: string) => Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// Resolved dependencies (all mocks resolved to concrete functions)
// ---------------------------------------------------------------------------

export interface ResolvedGitDeps {
  persistentDb: Database;
  gitStatusCache: GitStatusCache;
  gitStatusWatcher?: GitStatusWatcher;
  watchedGitDirs: Map<string, { workspaceId: string; repoPath: string }>;
  doGetGitStatus: (dirPath: string) => Promise<GitStatusResponse | null>;
  doGetGitStatusEnhanced: (
    dirPath: string,
  ) => Promise<(GitStatusResponse & { hasRemote: boolean; ahead: number; behind: number }) | null>;
  doGetGitLog: (dirPath: string, skip: number, limit: number) => Promise<GitLogItem[]>;
  doGetWorkspace: (db: Database, id: string) => Workspace | null;
  doDiscoverRepos: (
    workspaceCwd: string,
    maxDepth?: number,
    onDepthComplete?: (repos: GitRepoInfo[], depth: number) => void,
  ) => Promise<GitRepoInfo[]>;
  doStageFiles: (dirPath: string, files: string[]) => Promise<void>;
  doUnstageFiles: (dirPath: string, files: string[]) => Promise<void>;
  doDiscardChanges: (dirPath: string, files: string[]) => Promise<void>;
  doCommitChanges: (dirPath: string, message: string) => Promise<string>;
  doStageAllFiles: (dirPath: string) => Promise<void>;
  doUnstageAllFiles: (dirPath: string) => Promise<void>;
  doDiscardAllChanges: (dirPath: string) => Promise<void>;
  doCommitAmend: (
    dirPath: string,
    options?: { message?: string; noEdit?: boolean },
  ) => Promise<string>;
  doCommitAll: (
    dirPath: string,
    message: string,
    options?: { includeUntracked?: boolean; amend?: boolean },
  ) => Promise<string>;
  doResetSoft: (dirPath: string, ref?: string) => Promise<void>;
  doListBranches: (dirPath: string) => Promise<{ branches: GitBranch[]; current: string | null }>;
  doCreateBranch: (dirPath: string, name: string) => Promise<void>;
  doCheckoutBranch: (dirPath: string, name: string) => Promise<void>;
  doRenameBranch: (dirPath: string, oldName: string, newName: string) => Promise<void>;
  doDeleteBranch: (dirPath: string, name: string, force?: boolean) => Promise<void>;
  doDeleteRemoteBranch: (dirPath: string, remote: string, branch: string) => Promise<void>;
  doPublishBranch: (dirPath: string, remote?: string) => Promise<void>;
  doListRemoteBranches: (
    dirPath: string,
  ) => Promise<{ branches: GitBranch[]; current: string | null }>;
  doCreateBranchFrom: (dirPath: string, name: string, startPoint: string) => Promise<void>;
  doPushBranch: (dirPath: string, branch: string) => Promise<void>;
  doFetchRemote: (dirPath: string) => Promise<void>;
  doAddRemote: (dirPath: string, name: string, url: string) => Promise<void>;
  doRemoveRemote: (dirPath: string, name: string) => Promise<void>;
  doListRemotes: (
    dirPath: string,
  ) => Promise<{ name: string; fetchUrl: string; pushUrl: string }[]>;
  doGetDiffData: (
    repoDir: string,
    filePath: string,
    staged: boolean,
  ) => Promise<{
    originalContent: string;
    modifiedContent: string;
    additions: number;
    deletions: number;
  }>;
  doGetCommitDetails: (dirPath: string, commitSha: string) => Promise<CommitDetails | null>;
  doGetCommitFileDiff: (
    repoDir: string,
    commitSha: string,
    parentSha: string,
    filePath: string,
  ) => Promise<{
    originalContent: string;
    modifiedContent: string;
    additions: number;
    deletions: number;
  }>;
  doListWorktrees: (dirPath: string) => Promise<GitWorktreeInfo[]>;
  doCreateWorktree: (
    dirPath: string,
    branchName: string,
    startRef?: string,
  ) => Promise<GitWorktreeInfo>;
  doRemoveWorktree: (dirPath: string, worktreePath: string, force?: boolean) => Promise<void>;
  doMergeWorktree: (
    dirPath: string,
    worktreePath: string,
    options?: { targetBranch?: string; deleteAfterMerge?: boolean },
  ) => Promise<{ success: boolean; message: string; worktreeRemoved: boolean }>;
  doListUntrackedFiles: (dirPath: string) => Promise<string[]>;
  doReadWorktreeCopyConfig: (dirPath: string) => Promise<string[]>;
  doWriteWorktreeCopyConfig: (dirPath: string, files: string[]) => Promise<void>;
  doCopyFile: (src: string, dest: string) => Promise<void>;
  doMergeBranch: (dirPath: string, branch: string) => Promise<string>;
  doRebaseBranch: (dirPath: string, branch: string) => Promise<string>;
  doRebaseAbort: (dirPath: string) => Promise<void>;
  doIsRebaseInProgress: (dirPath: string) => Promise<boolean>;
  doPullRemote: (dirPath: string, rebase?: boolean) => Promise<void>;
  doSyncRemote: (dirPath: string, branch: string) => Promise<void>;
  doGetCurrentBranch: (dirPath: string) => Promise<string | null>;
  doStashPush: (
    dirPath: string,
    options?: { includeUntracked?: boolean; message?: string },
  ) => Promise<string>;
  doStashList: (dirPath: string) => Promise<GitStashEntry[]>;
  doStashApply: (dirPath: string, stashRef?: string) => Promise<void>;
  doStashPop: (dirPath: string, stashRef?: string) => Promise<void>;
  doStashDrop: (dirPath: string, stashRef: string) => Promise<void>;
  doStashClear: (dirPath: string) => Promise<void>;
  doInvalidateAndRefresh: (gitDir: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGitHandlers(router: MessageRouter, deps: GitDeps): void {
  // Create a default cache if none provided (tests can omit it)
  const gitStatusCache: GitStatusCache = deps.gitStatusCache ?? new GitStatusCache();
  const gitStatusWatcher = deps.gitStatusWatcher;
  const watchedGitDirs: Map<string, { workspaceId: string; repoPath: string }> =
    deps.watchedGitDirs ?? new Map();

  // Resolve all function references (mocks take priority over native)
  const resolved: ResolvedGitDeps = {
    persistentDb: deps.persistentDb,
    gitStatusCache,
    gitStatusWatcher,
    watchedGitDirs,
    doGetGitStatus: deps._mocks?.getGitStatus ?? nativeGetGitStatus,
    doGetGitStatusEnhanced: deps._mocks?.getGitStatusEnhanced ?? nativeGetGitStatusEnhanced,
    doGetGitLog: deps._mocks?.getGitLog ?? nativeGetGitLog,
    doGetWorkspace: deps._mocks?.getWorkspace ?? dbGetWorkspace,
    doDiscoverRepos: deps._mocks?.discoverRepos ?? nativeDiscoverRepos,
    doStageFiles: deps._mocks?.stageFiles ?? nativeStageFiles,
    doUnstageFiles: deps._mocks?.unstageFiles ?? nativeUnstageFiles,
    doDiscardChanges: deps._mocks?.discardChanges ?? nativeDiscardChanges,
    doCommitChanges: deps._mocks?.commitChanges ?? nativeCommitChanges,
    doStageAllFiles: deps._mocks?.stageAllFiles ?? nativeStageAllFiles,
    doUnstageAllFiles: deps._mocks?.unstageAllFiles ?? nativeUnstageAllFiles,
    doDiscardAllChanges: deps._mocks?.discardAllChanges ?? nativeDiscardAllChanges,
    doCommitAmend: deps._mocks?.commitAmend ?? nativeCommitAmend,
    doCommitAll: deps._mocks?.commitAll ?? nativeCommitAll,
    doResetSoft: deps._mocks?.resetSoft ?? nativeResetSoft,
    doListBranches: deps._mocks?.listBranches ?? nativeListBranches,
    doCreateBranch: deps._mocks?.createBranch ?? nativeCreateBranch,
    doCheckoutBranch: deps._mocks?.checkoutBranch ?? nativeCheckoutBranch,
    doRenameBranch: deps._mocks?.renameBranch ?? nativeRenameBranch,
    doDeleteBranch: deps._mocks?.deleteBranch ?? nativeDeleteBranch,
    doDeleteRemoteBranch: deps._mocks?.deleteRemoteBranch ?? nativeDeleteRemoteBranch,
    doPublishBranch: deps._mocks?.publishBranch ?? nativePublishBranch,
    doListRemoteBranches: deps._mocks?.listRemoteBranches ?? nativeListRemoteBranches,
    doCreateBranchFrom: deps._mocks?.createBranchFrom ?? nativeCreateBranchFrom,
    doPushBranch: deps._mocks?.pushBranch ?? nativePushBranch,
    doFetchRemote: deps._mocks?.fetchRemote ?? nativeFetchRemote,
    doAddRemote: deps._mocks?.addRemote ?? nativeAddRemote,
    doRemoveRemote: deps._mocks?.removeRemote ?? nativeRemoveRemote,
    doListRemotes: deps._mocks?.listRemotes ?? nativeListRemotes,
    doGetDiffData: deps._mocks?.getDiffData ?? nativeGetDiffData,
    doGetCommitDetails: deps._mocks?.getCommitDetails ?? nativeGetCommitDetails,
    doGetCommitFileDiff: deps._mocks?.getCommitFileDiff ?? nativeGetCommitFileDiff,
    doListWorktrees: deps._mocks?.listWorktrees ?? nativeListWorktrees,
    doCreateWorktree: deps._mocks?.createWorktree ?? nativeCreateWorktree,
    doRemoveWorktree: deps._mocks?.removeWorktree ?? nativeRemoveWorktree,
    doMergeWorktree: deps._mocks?.mergeWorktree ?? nativeMergeWorktree,
    doListUntrackedFiles: deps._mocks?.listUntrackedFiles ?? nativeListUntrackedFiles,
    doReadWorktreeCopyConfig: deps._mocks?.readWorktreeCopyConfig ?? nativeReadWorktreeCopyConfig,
    doWriteWorktreeCopyConfig:
      deps._mocks?.writeWorktreeCopyConfig ?? nativeWriteWorktreeCopyConfig,
    doCopyFile: deps._mocks?.copyFile ?? nativeCopyFile,
    doMergeBranch: deps._mocks?.mergeBranch ?? nativeMergeBranch,
    doRebaseBranch: deps._mocks?.rebaseBranch ?? nativeRebaseBranch,
    doRebaseAbort: deps._mocks?.rebaseAbort ?? nativeRebaseAbort,
    doIsRebaseInProgress: deps._mocks?.isRebaseInProgress ?? nativeIsRebaseInProgress,
    doPullRemote: deps._mocks?.pullRemote ?? nativePullRemote,
    doSyncRemote: deps._mocks?.syncRemote ?? nativeSyncRemote,
    doGetCurrentBranch: deps._mocks?.getCurrentBranch ?? nativeGetCurrentBranch,
    doStashPush: deps._mocks?.stashPush ?? nativeStashPush,
    doStashList: deps._mocks?.stashList ?? nativeStashList,
    doStashApply: deps._mocks?.stashApply ?? nativeStashApply,
    doStashPop: deps._mocks?.stashPop ?? nativeStashPop,
    doStashDrop: deps._mocks?.stashDrop ?? nativeStashDrop,
    doStashClear: deps._mocks?.stashClear ?? nativeStashClear,
    doInvalidateAndRefresh: createInvalidator(gitStatusCache, gitStatusWatcher),
  };

  // Delegate to domain-specific registration functions
  registerStatusHandlers(router, resolved);
  registerOperationsHandlers(router, resolved);
  registerBranchesHandlers(router, resolved);
  registerRemoteHandlers(router, resolved);
  registerDiffHandlers(router, resolved);
  registerWorktreeHandlers(router, resolved);
  registerMergeHandlers(router, resolved);
  registerStashHandlers(router, resolved);
}
