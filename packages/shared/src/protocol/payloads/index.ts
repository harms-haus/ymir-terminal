// ---------------------------------------------------------------------------
// Re-exports from domain modules
// ---------------------------------------------------------------------------

export * from './auth';
export * from './terminal';
export * from './workspace';
export * from './file';
export * from './git';
export * from './config';
export * from './session';
export * from './tab';

// Import types explicitly for union definitions below
import type { AuthRequest } from './auth';
import type {
  TerminalCreateRequest,
  TerminalInputRequest,
  TerminalResizeRequest,
  TerminalCloseRequest,
  TerminalOutputEvent,
  TerminalExitEvent,
} from './terminal';
import type {
  WorkspaceListRequest,
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
  WorkspaceDeleteRequest,
} from './workspace';
import type {
  FileTreeRequest,
  FileReadRequest,
  FileWriteRequest,
  FileDeleteRequest,
  FileRenameRequest,
  FileCreateRequest,
  FileChangeEvent,
} from './file';
import type {
  GitStatusRequest,
  GitLogRequest,
  GitRepoDiscoveryRequest,
  GitStageRequest,
  GitUnstageRequest,
  GitDiscardRequest,
  GitCommitRequest,
  GitBranchesRequest,
  GitCheckoutRequest,
  GitPushRequest,
  GitFetchRequest,
  GitDiffDataRequest,
  GitCommitDetailsRequest,
  GitCommitDiffRequest,
} from './git';
import type { ConfigGetRequest, ConfigSetRequest } from './config';
import type { ConnectionStatusEvent } from './session';
import type {
  TabListRequest,
  TabCreateRequest,
  TabUpdateRequest,
  TabDeleteRequest,
  TabReorderRequest,
} from './tab';

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
  'git.repoDiscovery',
  'git.stage',
  'git.unstage',
  'git.discard',
  'git.commit',
  'git.branches',
  'git.checkout',
  'git.push',
  'git.fetch',
  'git.diffData',
  'git.commitDetails',
  'git.commitDiff',
  'config.get',
  'config.set',
  'tab.list',
  'tab.create',
  'tab.update',
  'tab.delete',
  'tab.reorder',
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
  | GitRepoDiscoveryRequest
  | GitStageRequest
  | GitUnstageRequest
  | GitDiscardRequest
  | GitCommitRequest
  | GitBranchesRequest
  | GitCheckoutRequest
  | GitPushRequest
  | GitFetchRequest
  | GitDiffDataRequest
  | GitCommitDetailsRequest
  | GitCommitDiffRequest
  | ConfigGetRequest
  | ConfigSetRequest
  | TabListRequest
  | TabCreateRequest
  | TabUpdateRequest
  | TabDeleteRequest
  | TabReorderRequest;

export type EventPayload =
  | TerminalOutputEvent
  | TerminalExitEvent
  | FileChangeEvent
  | ConnectionStatusEvent;
