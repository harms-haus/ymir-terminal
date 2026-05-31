export interface TabListRequest {
  workspaceId: string;
  pane?: 'content' | 'bottom';
}

export interface ServerTabInfo {
  id: string;
  tabType: 'terminal' | 'editor' | 'diff' | 'git-tree';
  title: string | null;
  filePath: string | null;
  terminalId: string | null;
  active: boolean;
  sortOrder: number;
  terminalAlive?: boolean;
  diffRef?: 'staged' | 'unstaged' | 'commit' | null;
  repoPath?: string | null;
  commitSha?: string | null;
  parentSha?: string | null;
}

export interface TabListResponse {
  tabs: ServerTabInfo[];
}

export interface TabCreateRequest {
  workspaceId: string;
  pane: 'content' | 'bottom';
  tabType: 'terminal' | 'editor' | 'diff' | 'git-tree';
  title: string;
  terminalId?: string;
  filePath?: string;
  diffRef?: string;
  diffRepoPath?: string;
  repoPath?: string;
  commitSha?: string;
  parentSha?: string;
}

export interface TabCreateResponse {
  tabId: string;
}

export interface TabUpdateRequest {
  tabId: string;
  active?: boolean;
  sortOrder?: number;
  title?: string;
}

export interface TabDeleteRequest {
  tabId: string;
}

export interface TabReorderRequest {
  tabIds: string[];
}
