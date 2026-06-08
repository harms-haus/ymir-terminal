// ---------------------------------------------------------------------------
// Stash channels
// ---------------------------------------------------------------------------

export interface GitStashEntry {
  index: number;
  ref: string;
  message: string;
  branchName: string | null;
}

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
