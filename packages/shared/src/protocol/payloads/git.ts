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
