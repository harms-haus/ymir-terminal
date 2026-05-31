export interface WorkspaceSummary {
  id: string;
  name: string;
  cwd: string;
  color: string;
}

export type WorkspaceListRequest = Record<string, never>;

export interface WorkspaceListResponse {
  workspaces: WorkspaceSummary[];
}

export interface WorkspaceCreateRequest {
  name: string;
  cwd: string;
  color: string;
}

export interface WorkspaceCreateResponse {
  workspace: WorkspaceSummary;
}

export interface WorkspaceUpdateRequest {
  id: string;
  name?: string;
  cwd?: string;
  color?: string;
}

export interface WorkspaceDeleteRequest {
  id: string;
}
