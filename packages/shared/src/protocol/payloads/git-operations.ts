export type GitFileChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | '??';

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

export interface GitRepoDiscoveryProgressEvent {
  workspaceId: string;
  repos: GitRepoInfo[];
  depth: number;
  done: boolean;
}

// ---------------------------------------------------------------------------
// Stage / Unstage / Discard
// ---------------------------------------------------------------------------

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
// Commit
// ---------------------------------------------------------------------------

export interface GitCommitRequest {
  workspaceId: string;
  repoPath: string;
  message: string;
}

export interface GitCommitResponse {
  commitHash: string;
}

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
// Push / Fetch
// ---------------------------------------------------------------------------

export interface GitPushRequest {
  workspaceId: string;
  repoPath: string;
  branch: string;
}

export interface GitFetchRequest {
  workspaceId: string;
  repoPath: string;
}

// ---------------------------------------------------------------------------
// Worktree
// ---------------------------------------------------------------------------

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
// Pull / Sync
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
// Merge / Rebase
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
// Remote management
// ---------------------------------------------------------------------------

export interface GitRemoteEntry {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

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

// ---------------------------------------------------------------------------
// Event channels
// ---------------------------------------------------------------------------

export interface GitStatusChangeEvent {
  workspaceId: string;
  repoPath: string;
  status: GitStatusResponse;
}
