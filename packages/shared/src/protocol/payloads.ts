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
  'file.tree',
  'file.read',
  'file.write',
  'file.delete',
  'file.rename',
  'file.create',
  'git.status',
  'git.log',
  'config.get',
  'config.set',
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

export const EVENT_TYPES = [
  'terminal.output',
  'terminal.exit',
  'file.change',
  'connection.status',
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

/** @deprecated — retained for union completeness; the request carries no body. */
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
// Git Log
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ConfigGetRequest {
  key: string;
}

export interface ConfigGetResponse {
  key: string;
  value: string | null;
}

export interface ConfigSetRequest {
  key: string;
  value: string;
}

export interface ConfigSetResponse {
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

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
  | FileTreeRequest
  | FileReadRequest
  | FileWriteRequest
  | FileDeleteRequest
  | FileRenameRequest
  | FileCreateRequest
  | GitStatusRequest
  | GitLogRequest
  | ConfigGetRequest
  | ConfigSetRequest;

export type EventPayload =
  | TerminalOutputEvent
  | TerminalExitEvent
  | FileChangeEvent
  | ConnectionStatusEvent;
