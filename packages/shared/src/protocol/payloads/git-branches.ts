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
