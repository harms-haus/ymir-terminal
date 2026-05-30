export interface GitFileChange {
  path: string;
  status: string;
}

export interface GitStatusRequest {
  workspaceId: string;
}

export interface GitStatusResponse {
  branch: string | null;
  changes: GitFileChange[];
  staged: GitFileChange[];
}

export interface GitLogRequest {
  workspaceId: string;
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
