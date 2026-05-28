// ---------------------------------------------------------------------------
// Request & event type constants
// ---------------------------------------------------------------------------

export const REQUEST_TYPES = [
  'auth',
  'terminal.create',
  'terminal.input',
  'terminal.resize',
  'terminal.close',
  'workspace.list',
  'workspace.create',
  'workspace.update',
  'workspace.delete',
  // Tab management — handlers to be implemented
  'tab.create',
  'tab.close',
  'tab.activate',
  'file.tree',
  'file.read',
  'file.write',
  'file.delete',
  'file.rename',
  'file.create',
  'git.status',
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

export const EVENT_TYPES = [
  'terminal.output',
  'terminal.exit',
  'file.change',
  // Emitted on connection after auth — to be implemented
  'session.init',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthRequest {
  password: string;
}

export interface AuthResponse {
  token: string;
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

export interface TerminalCreateRequest {
  workspaceId: string;
  cols?: number;
  rows?: number;
}

export interface TerminalCreateResponse {
  terminalId: string;
}

export interface TerminalInputRequest {
  terminalId: string;
  /** Base64-encoded input data. */
  data: string;
}

export interface TerminalResizeRequest {
  terminalId: string;
  cols: number;
  rows: number;
}

export interface TerminalOutputEvent {
  terminalId: string;
  /** Base64-encoded output data. */
  data: string;
}

export interface TerminalCloseRequest {
  terminalId: string;
}

export interface TerminalExitEvent {
  terminalId: string;
  exitCode: number;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export interface TabInfo {
  id: string;
  tabType: string;
  title: string;
  active: boolean;
  order: number;
}

export interface TabCreateRequest {
  workspaceId: string;
  tabType: string;
  filePath?: string;
}

export interface TabCloseRequest {
  tabId: string;
}

export interface TabActivateRequest {
  tabId: string;
}

export interface TabsListResponse {
  tabs: TabInfo[];
}

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface FileTreeRequest {
  workspaceId: string;
  path?: string;
}

export interface FileTreeResponse {
  tree: FileNode[];
}

export interface FileReadRequest {
  workspaceId: string;
  path: string;
}

export interface FileReadResponse {
  content: string;
  language: string;
}

export interface FileWriteRequest {
  workspaceId: string;
  path: string;
  content: string;
}

export interface FileDeleteRequest {
  workspaceId: string;
  path: string;
}

export interface FileRenameRequest {
  workspaceId: string;
  oldPath: string;
  newPath: string;
}

export interface FileCreateRequest {
  workspaceId: string;
  path: string;
  isDirectory: boolean;
}

export interface FileChangeEvent {
  workspaceId: string;
  path: string;
  kind: string;
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionInitEvent {
  sessionId: string;
}

export interface ConnectionStatusEvent {
  status: string;
}

// ---------------------------------------------------------------------------
// Union types — exhaustive over all request / event payloads
// ---------------------------------------------------------------------------

export type RequestPayload =
  | AuthRequest
  | TerminalCreateRequest
  | TerminalInputRequest
  | TerminalResizeRequest
  | TerminalCloseRequest
  | WorkspaceListRequest
  | WorkspaceCreateRequest
  | WorkspaceUpdateRequest
  | WorkspaceDeleteRequest
  | TabCreateRequest
  | TabCloseRequest
  | TabActivateRequest
  | FileTreeRequest
  | FileReadRequest
  | FileWriteRequest
  | FileDeleteRequest
  | FileRenameRequest
  | FileCreateRequest
  | GitStatusRequest;

export type EventPayload =
  | TerminalOutputEvent
  | TerminalExitEvent
  | FileChangeEvent
  | SessionInitEvent
  | ConnectionStatusEvent;
