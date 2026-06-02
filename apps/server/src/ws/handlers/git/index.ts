import type { Database } from 'bun:sqlite';
import type { MessageRouter } from '../../router';
import {
  type GitStatusResponse,
  type GitLogItem,
  type GitRepoInfo,
  type GitBranch,
  type GitWorktreeInfo,
} from '@ymir/shared';
import type { CommitDetails } from '../../../git/commit-details';

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
} from '../../../git/operations';
import {
  listBranches as nativeListBranches,
  createBranch as nativeCreateBranch,
  checkoutBranch as nativeCheckoutBranch,
} from '../../../git/branches';
import { pushBranch as nativePushBranch, fetchRemote as nativeFetchRemote } from '../../../git/remote';
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
import type { Workspace } from '../../../db/persistent';
import { getWorkspace as dbGetWorkspace } from '../../../db/persistent';

// Domain registration functions (stubs — handlers will be moved in follow-up tasks)
import { registerStatusHandlers } from './status';
import { registerOperationsHandlers } from './operations';
import { registerBranchesHandlers } from './branches';
import { registerRemoteHandlers } from './remote';
import { registerDiffHandlers } from './diff';
import { registerWorktreeHandlers } from './worktrees';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface GitDeps {
  persistentDb: Database;
  /** Internal: allows tests to inject mock functions. */
  _mocks?: {
    getGitStatus?: (dirPath: string) => Promise<GitStatusResponse | null>;
    getGitStatusEnhanced?: (
      dirPath: string,
    ) => Promise<
      (GitStatusResponse & { hasRemote: boolean; ahead: number; behind: number }) | null
    >;
    getGitLog?: (
      dirPath: string,
      skip: number,
      limit: number,
    ) => Promise<GitLogItem[]>;
    getWorkspace?: (db: Database, id: string) => Workspace | null;
    discoverRepos?: (
      workspaceCwd: string,
      maxDepth?: number,
    ) => Promise<GitRepoInfo[]>;
    stageFiles?: (dirPath: string, files: string[]) => Promise<void>;
    unstageFiles?: (dirPath: string, files: string[]) => Promise<void>;
    discardChanges?: (dirPath: string, files: string[]) => Promise<void>;
    commitChanges?: (dirPath: string, message: string) => Promise<string>;
    listBranches?: (
      dirPath: string,
    ) => Promise<{ branches: GitBranch[]; current: string | null }>;
    createBranch?: (dirPath: string, name: string) => Promise<void>;
    checkoutBranch?: (dirPath: string, name: string) => Promise<void>;
    pushBranch?: (dirPath: string, branch: string) => Promise<void>;
    fetchRemote?: (dirPath: string) => Promise<void>;
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
    getCommitDetails?: (
      dirPath: string,
      commitSha: string,
    ) => Promise<CommitDetails | null>;
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
  };
}

// ---------------------------------------------------------------------------
// Resolved dependencies (all mocks resolved to concrete functions)
// ---------------------------------------------------------------------------

export interface ResolvedGitDeps {
  persistentDb: Database;
  doGetGitStatus: (dirPath: string) => Promise<GitStatusResponse | null>;
  doGetGitStatusEnhanced: (
    dirPath: string,
  ) => Promise<
    (GitStatusResponse & { hasRemote: boolean; ahead: number; behind: number }) | null
  >;
  doGetGitLog: (dirPath: string, skip: number, limit: number) => Promise<GitLogItem[]>;
  doGetWorkspace: (db: Database, id: string) => Workspace | null;
  doDiscoverRepos: (workspaceCwd: string, maxDepth?: number) => Promise<GitRepoInfo[]>;
  doStageFiles: (dirPath: string, files: string[]) => Promise<void>;
  doUnstageFiles: (dirPath: string, files: string[]) => Promise<void>;
  doDiscardChanges: (dirPath: string, files: string[]) => Promise<void>;
  doCommitChanges: (dirPath: string, message: string) => Promise<string>;
  doListBranches: (
    dirPath: string,
  ) => Promise<{ branches: GitBranch[]; current: string | null }>;
  doCreateBranch: (dirPath: string, name: string) => Promise<void>;
  doCheckoutBranch: (dirPath: string, name: string) => Promise<void>;
  doPushBranch: (dirPath: string, branch: string) => Promise<void>;
  doFetchRemote: (dirPath: string) => Promise<void>;
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
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGitHandlers(router: MessageRouter, deps: GitDeps): void {
  // Resolve all function references (mocks take priority over native)
  const resolved: ResolvedGitDeps = {
    persistentDb: deps.persistentDb,
    doGetGitStatus: deps._mocks?.getGitStatus ?? nativeGetGitStatus,
    doGetGitStatusEnhanced: deps._mocks?.getGitStatusEnhanced ?? nativeGetGitStatusEnhanced,
    doGetGitLog: deps._mocks?.getGitLog ?? nativeGetGitLog,
    doGetWorkspace: deps._mocks?.getWorkspace ?? dbGetWorkspace,
    doDiscoverRepos: deps._mocks?.discoverRepos ?? nativeDiscoverRepos,
    doStageFiles: deps._mocks?.stageFiles ?? nativeStageFiles,
    doUnstageFiles: deps._mocks?.unstageFiles ?? nativeUnstageFiles,
    doDiscardChanges: deps._mocks?.discardChanges ?? nativeDiscardChanges,
    doCommitChanges: deps._mocks?.commitChanges ?? nativeCommitChanges,
    doListBranches: deps._mocks?.listBranches ?? nativeListBranches,
    doCreateBranch: deps._mocks?.createBranch ?? nativeCreateBranch,
    doCheckoutBranch: deps._mocks?.checkoutBranch ?? nativeCheckoutBranch,
    doPushBranch: deps._mocks?.pushBranch ?? nativePushBranch,
    doFetchRemote: deps._mocks?.fetchRemote ?? nativeFetchRemote,
    doGetDiffData: deps._mocks?.getDiffData ?? nativeGetDiffData,
    doGetCommitDetails: deps._mocks?.getCommitDetails ?? nativeGetCommitDetails,
    doGetCommitFileDiff: deps._mocks?.getCommitFileDiff ?? nativeGetCommitFileDiff,
    doListWorktrees: deps._mocks?.listWorktrees ?? nativeListWorktrees,
    doCreateWorktree: deps._mocks?.createWorktree ?? nativeCreateWorktree,
    doRemoveWorktree: deps._mocks?.removeWorktree ?? nativeRemoveWorktree,
    doMergeWorktree: deps._mocks?.mergeWorktree ?? nativeMergeWorktree,
    doListUntrackedFiles: deps._mocks?.listUntrackedFiles ?? nativeListUntrackedFiles,
    doReadWorktreeCopyConfig:
      deps._mocks?.readWorktreeCopyConfig ?? nativeReadWorktreeCopyConfig,
    doWriteWorktreeCopyConfig:
      deps._mocks?.writeWorktreeCopyConfig ?? nativeWriteWorktreeCopyConfig,
    doCopyFile: deps._mocks?.copyFile ?? nativeCopyFile,
  };

  // Delegate to domain-specific registration functions
  registerStatusHandlers(router, resolved);
  registerOperationsHandlers(router, resolved);
  registerBranchesHandlers(router, resolved);
  registerRemoteHandlers(router, resolved);
  registerDiffHandlers(router, resolved);
  registerWorktreeHandlers(router, resolved);
}
