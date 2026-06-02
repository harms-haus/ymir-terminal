export type GitFileChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | '?' | '??';

export interface GitFileChange {
  path: string;
  status: GitFileChangeStatus;
}

export interface GitStatusRequest {
  workspaceId: string;
  repoPath?: string;
}

export interface GitStatusResponse {
  branch: string | null;
  changes: GitFileChange[];
  staged: GitFileChange[];
  repoPath?: string;
  hasRemote: boolean;
  ahead: number;
  behind: number;
}

export interface GitLogRequest {
  workspaceId: string;
  repoPath?: string;
  skip: number;
  limit: number;
}

export interface GitLogItem {
  id: string;
  message: string;
  author: string;
  date: number; // Unix timestamp in seconds
  parents: string[];
}

export interface GitLogResponse {
  commits: GitLogItem[];
  hasMore: boolean;
}

export interface GitRepoInfo {
  path: string; // relative path from workspace root
  name: string; // directory name
  branch: string | null;
  hasRemote: boolean;
  ahead: number;
  behind: number;
}

export interface GitRepoDiscoveryRequest {
  workspaceId: string;
  repoPath?: string;
}

export interface GitRepoDiscoveryResponse {
  repos: GitRepoInfo[];
}

export interface GitStageRequest {
  workspaceId: string;
  repoPath: string;
  files: string[];
}

export interface GitUnstageRequest {
  workspaceId: string;
  repoPath: string;
  files: string[];
}

export interface GitDiscardRequest {
  workspaceId: string;
  repoPath: string;
  files: string[];
}

export interface GitCommitRequest {
  workspaceId: string;
  repoPath: string;
  message: string;
}

export interface GitCommitResponse {
  commitHash: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface GitBranchesRequest {
  workspaceId: string;
  repoPath: string;
}

export interface GitBranchesResponse {
  branches: GitBranch[];
  current: string | null;
}

export interface GitCheckoutRequest {
  workspaceId: string;
  repoPath: string;
  branch: string;
  createNew?: boolean;
}

export interface GitPushRequest {
  workspaceId: string;
  repoPath: string;
  branch: string;
}

export interface GitFetchRequest {
  workspaceId: string;
  repoPath: string;
}

export interface GitDiffDataRequest {
  workspaceId: string;
  repoPath: string;
  filePath: string;
  staged: boolean;
}

export interface GitDiffDataResponse {
  originalContent: string;
  modifiedContent: string;
  additions: number;
  deletions: number;
  filePath: string;
}

export interface GitCommitDetailsRequest {
  workspaceId: string;
  repoPath?: string;
  commitSha: string;
}

export interface GitCommitFileChange {
  filePath: string;
  status: GitFileChangeStatus;
  additions: number;
  deletions: number;
}

export interface GitCommitDetailsResponse {
  commitSha: string;
  body: string;
  files: GitCommitFileChange[];
}

export interface GitCommitDiffRequest {
  workspaceId: string;
  repoPath: string;
  commitSha: string;
  parentSha: string; // empty string '' for root commits with no parent
  filePath: string;
}

export interface GitCommitDiffResponse {
  originalContent: string;
  modifiedContent: string;
  additions: number;
  deletions: number;
  filePath: string;
}

export interface GitWorktreeInfo {
  path: string;
  branch: string | null;
  isMain: boolean;
  isDetached: boolean;
}

export interface GitWorktreeListRequest {
  workspaceId: string;
}

export interface GitWorktreeListResponse {
  worktrees: GitWorktreeInfo[];
}

export interface GitWorktreeCreateRequest {
  workspaceId: string;
  branchName: string;
  startRef?: string;
  filesToCopy?: string[];
}

export interface GitWorktreeCreateResponse {
  worktree: GitWorktreeInfo;
}

export interface GitWorktreeRemoveRequest {
  workspaceId: string;
  worktreePath: string;
  force?: boolean;
}

export interface GitWorktreeMergeRequest {
  workspaceId: string;
  worktreePath: string;
  targetBranch?: string; // defaults to main/master
  deleteAfterMerge?: boolean;
  filesToCopy?: string[];
}

export interface GitWorktreeMergeResponse {
  success: boolean;
  message: string;
  worktreeRemoved?: boolean;
}

export interface GitWorktreeCopyFilesRequest {
  workspaceId: string;
  dirPath?: string; // absolute path to scan; if omitted, uses workspace cwd
}

export interface GitWorktreeCopyFilesResponse {
  untrackedFiles: string[]; // relative paths of untracked files (excludes .worktreecopy)
  configuredFiles: string[]; // paths listed in .worktreecopy (empty if file doesn't exist)
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface GitStashEntry {
  index: number;
  ref: string;
  message: string;
  branchName: string | null;
}

export interface GitRemoteEntry {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

// ---------------------------------------------------------------------------
// Stash channels
// ---------------------------------------------------------------------------

export interface GitStashPushRequest {
  workspaceId: string;
  repoPath: string;
  includeUntracked?: boolean;
  message?: string;
}

export interface GitStashPushResponse {
  stashRef: string;
}

export interface GitStashListRequest {
  workspaceId: string;
  repoPath: string;
}

export interface GitStashListResponse {
  stashes: GitStashEntry[];
}

export interface GitStashApplyRequest {
  workspaceId: string;
  repoPath: string;
  stashRef?: string;
}

export interface GitStashPopRequest {
  workspaceId: string;
  repoPath: string;
  stashRef?: string;
}

export interface GitStashDropRequest {
  workspaceId: string;
  repoPath: string;
  stashRef: string;
}

export interface GitStashClearRequest {
  workspaceId: string;
  repoPath: string;
}

// ---------------------------------------------------------------------------
// Pull / Sync channels
// ---------------------------------------------------------------------------

export interface GitPullRequest {
  workspaceId: string;
  repoPath: string;
  rebase?: boolean;
}

export interface GitSyncRequest {
  workspaceId: string;
  repoPath: string;
}

// ---------------------------------------------------------------------------
// Merge / Rebase channels
// ---------------------------------------------------------------------------

export interface GitMergeRequest {
  workspaceId: string;
  repoPath: string;
  branch: string;
}

export interface GitMergeResponse {
  result: string;
}

export interface GitRebaseRequest {
  workspaceId: string;
  repoPath: string;
  branch: string;
}

export interface GitRebaseAbortRequest {
  workspaceId: string;
  repoPath: string;
}

export interface GitRebaseStatusRequest {
  workspaceId: string;
  repoPath: string;
}

export interface GitRebaseStatusResponse {
  inProgress: boolean;
}

// ---------------------------------------------------------------------------
// Enhanced commit channels
// ---------------------------------------------------------------------------

export interface GitCommitAmendRequest {
  workspaceId: string;
  repoPath: string;
  message?: string;
  noEdit?: boolean;
}

export interface GitCommitAmendResponse {
  commitHash: string;
}

export interface GitCommitAllRequest {
  workspaceId: string;
  repoPath: string;
  message: string;
  includeUntracked?: boolean;
  amend?: boolean;
}

export interface GitCommitAllResponse {
  commitHash: string;
}

export interface GitResetSoftRequest {
  workspaceId: string;
  repoPath: string;
  ref?: string;
}

// ---------------------------------------------------------------------------
// Bulk change channels
// ---------------------------------------------------------------------------

export interface GitStageAllRequest {
  workspaceId: string;
  repoPath: string;
}

export interface GitUnstageAllRequest {
  workspaceId: string;
  repoPath: string;
}

export interface GitDiscardAllRequest {
  workspaceId: string;
  repoPath: string;
}

// ---------------------------------------------------------------------------
// Enhanced branch channels
// ---------------------------------------------------------------------------

export interface GitBranchRenameRequest {
  workspaceId: string;
  repoPath: string;
  oldName: string;
  newName: string;
}

export interface GitBranchDeleteRequest {
  workspaceId: string;
  repoPath: string;
  name: string;
  force?: boolean;
}

export interface GitBranchDeleteRemoteRequest {
  workspaceId: string;
  repoPath: string;
  remote: string;
  branch: string;
}

export interface GitBranchPublishRequest {
  workspaceId: string;
  repoPath: string;
  remote?: string;
}

export interface GitBranchesRemoteRequest {
  workspaceId: string;
  repoPath: string;
}

export interface GitBranchesRemoteResponse {
  branches: GitBranch[];
}

export interface GitBranchCreateFromRequest {
  workspaceId: string;
  repoPath: string;
  name: string;
  startPoint: string;
}

// ---------------------------------------------------------------------------
// Remote management channels
// ---------------------------------------------------------------------------

export interface GitRemoteAddRequest {
  workspaceId: string;
  repoPath: string;
  name: string;
  url: string;
}

export interface GitRemoteRemoveRequest {
  workspaceId: string;
  repoPath: string;
  name: string;
}

export interface GitRemoteListRequest {
  workspaceId: string;
  repoPath: string;
}

export interface GitRemoteListResponse {
  remotes: GitRemoteEntry[];
}
