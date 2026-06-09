export interface TabListRequest {
  workspaceId: string;
  pane?: string;
  worktreePath?: string | null;
}

export interface TabInfo {
  id: string;
  tabType: 'terminal' | 'editor' | 'diff' | 'git-tree' | 'agent';
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
  cwd?: string | null;
  customTitle?: string | null;
  worktreePath?: string | null;
}

export interface TabListResponse {
  tabs: TabInfo[];
}

export interface TabCreateRequest {
  workspaceId: string;
  pane: string;
  tabType: 'terminal' | 'editor' | 'diff' | 'git-tree' | 'agent';
  title: string;
  terminalId?: string;
  filePath?: string;
  diffRef?: 'staged' | 'unstaged' | 'commit' | null;
  diffRepoPath?: string;
  repoPath?: string;
  commitSha?: string;
  parentSha?: string;
  cwd?: string;
  customTitle?: string;
  worktreePath?: string | null;
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

export interface PersistedTabInfo {
  id: string;
  tabType: 'terminal' | 'editor' | 'diff' | 'git-tree' | 'agent';
  title: string | null;
  filePath: string | null;
  pane: string;
  sortOrder: number;
  diffRef: string | null;
  repoPath: string | null;
  commitSha: string | null;
  parentSha: string | null;
  cwd: string | null;
  customTitle: string | null;
  terminalId: string | null;
  worktreePath?: string | null;
}

export interface TabRestoreRequest {
  workspaceId: string;
  worktreePath?: string | null;
}

export interface TabRestoreResponse {
  tabs: PersistedTabInfo[];
}
