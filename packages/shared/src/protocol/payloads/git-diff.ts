import type { GitFileChangeStatus } from './git-operations';

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

// ---------------------------------------------------------------------------
// Commit detail channels
// ---------------------------------------------------------------------------

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
