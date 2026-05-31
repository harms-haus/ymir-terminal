export interface TabListRequest {
  workspaceId: string;
  pane?: 'content' | 'bottom';
}

export interface ServerTabInfo {
  id: string;
  tabType: 'terminal' | 'editor';
  title: string | null;
  filePath: string | null;
  terminalId: string | null;
  active: boolean;
  sortOrder: number;
  terminalAlive?: boolean;
}

export interface TabListResponse {
  tabs: ServerTabInfo[];
}

export interface TabCreateRequest {
  workspaceId: string;
  pane: 'content' | 'bottom';
  tabType: 'terminal' | 'editor';
  title: string;
  terminalId?: string;
  filePath?: string;
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
