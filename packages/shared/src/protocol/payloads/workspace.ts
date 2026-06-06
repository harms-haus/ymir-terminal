export interface CwdCompression {
  /** The path segments split on "/" — e.g. ["~", "Documents", "software", "project"] */
  segments: string[];
  /** Shortest unique prefix for each segment (same length as segments). Root and last segment keep their full value. */
  uniquePrefixes: string[];
  /** Number of compressible middle segments: max(0, segments.length - 2) */
  compressibleCount: number;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  cwd: string;
  cwdCompression?: CwdCompression;
  color: string;
  sortOrder: number;
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

export interface WorkspaceReorderRequest {
  workspaceIds: string[];
}

export interface WorkspaceSubscribeRequest {
  workspaceId: string;
}

export interface WorkspaceUnsubscribeRequest {
  workspaceId: string;
}
