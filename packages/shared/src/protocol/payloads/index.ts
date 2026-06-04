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
  WorkspaceReorderRequest,
  WorkspaceSubscribeRequest,
  WorkspaceUnsubscribeRequest,
} from './workspace';
import type {
  FileTreeRequest,
  FileReadRequest,
  FileWriteRequest,
  FileDeleteRequest,
  FileRenameRequest,
  FileCreateRequest,
  FileCopyRequest,
  FileMoveRequest,
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
  GitWorktreeListRequest,
  GitWorktreeCreateRequest,
  GitWorktreeRemoveRequest,
  GitWorktreeMergeRequest,
  GitWorktreeCopyFilesRequest,
  GitStashPushRequest,
  GitStashListRequest,
  GitStashApplyRequest,
  GitStashPopRequest,
  GitStashDropRequest,
  GitStashClearRequest,
  GitPullRequest,
  GitSyncRequest,
  GitMergeRequest,
  GitRebaseRequest,
  GitRebaseAbortRequest,
  GitRebaseStatusRequest,
  GitCommitAmendRequest,
  GitCommitAllRequest,
  GitResetSoftRequest,
  GitStageAllRequest,
  GitUnstageAllRequest,
  GitDiscardAllRequest,
  GitBranchRenameRequest,
  GitBranchDeleteRequest,
  GitBranchDeleteRemoteRequest,
  GitBranchPublishRequest,
  GitBranchesRemoteRequest,
  GitBranchCreateFromRequest,
  GitRemoteAddRequest,
  GitRemoteRemoveRequest,
  GitRemoteListRequest,
  GitStatusChangeEvent,
  GitRepoDiscoveryProgressEvent,
} from './git';
import type { ConfigGetRequest, ConfigSetRequest } from './config';
import type { ConnectionStatusEvent } from './session';
import type {
  TabListRequest,
  TabCreateRequest,
  TabUpdateRequest,
  TabDeleteRequest,
  TabReorderRequest,
  TabRestoreRequest,
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
  'workspace.reorder',
  'workspace.subscribe',
  'workspace.unsubscribe',
  'file.tree',
  'file.read',
  'file.write',
  'file.delete',
  'file.rename',
  'file.create',
  'file.copy',
  'file.move',
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
  'git.worktreeList',
  'git.worktreeCreate',
  'git.worktreeRemove',
  'git.worktreeMerge',
  'git.worktreeCopyFiles',
  'git.stashPush',
  'git.stashList',
  'git.stashApply',
  'git.stashPop',
  'git.stashDrop',
  'git.stashClear',
  'git.pull',
  'git.sync',
  'git.merge',
  'git.rebase',
  'git.rebaseAbort',
  'git.rebaseStatus',
  'git.commitAmend',
  'git.commitAll',
  'git.resetSoft',
  'git.stageAll',
  'git.unstageAll',
  'git.discardAll',
  'git.branchRename',
  'git.branchDelete',
  'git.branchDeleteRemote',
  'git.branchPublish',
  'git.branchesRemote',
  'git.branchCreateFrom',
  'git.remoteAdd',
  'git.remoteRemove',
  'git.remoteList',
  'config.get',
  'config.set',
  'tab.list',
  'tab.create',
  'tab.update',
  'tab.delete',
  'tab.reorder',
  'tab.restore',
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

export const EVENT_TYPES = [
  'terminal.output',
  'terminal.exit',
  'file.change',
  'connection.status',
  'git.statusChange',
  'git.repoDiscovery.progress',
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
  | WorkspaceReorderRequest
  | WorkspaceSubscribeRequest
  | WorkspaceUnsubscribeRequest
  | FileTreeRequest
  | FileReadRequest
  | FileWriteRequest
  | FileDeleteRequest
  | FileRenameRequest
  | FileCreateRequest
  | FileCopyRequest
  | FileMoveRequest
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
  | GitWorktreeListRequest
  | GitWorktreeCreateRequest
  | GitWorktreeRemoveRequest
  | GitWorktreeMergeRequest
  | GitWorktreeCopyFilesRequest
  | GitStashPushRequest
  | GitStashListRequest
  | GitStashApplyRequest
  | GitStashPopRequest
  | GitStashDropRequest
  | GitStashClearRequest
  | GitPullRequest
  | GitSyncRequest
  | GitMergeRequest
  | GitRebaseRequest
  | GitRebaseAbortRequest
  | GitRebaseStatusRequest
  | GitCommitAmendRequest
  | GitCommitAllRequest
  | GitResetSoftRequest
  | GitStageAllRequest
  | GitUnstageAllRequest
  | GitDiscardAllRequest
  | GitBranchRenameRequest
  | GitBranchDeleteRequest
  | GitBranchDeleteRemoteRequest
  | GitBranchPublishRequest
  | GitBranchesRemoteRequest
  | GitBranchCreateFromRequest
  | GitRemoteAddRequest
  | GitRemoteRemoveRequest
  | GitRemoteListRequest
  | ConfigGetRequest
  | ConfigSetRequest
  | TabListRequest
  | TabCreateRequest
  | TabUpdateRequest
  | TabDeleteRequest
  | TabReorderRequest
  | TabRestoreRequest;

export type EventPayload =
  | TerminalOutputEvent
  | TerminalExitEvent
  | FileChangeEvent
  | ConnectionStatusEvent
  | GitStatusChangeEvent
  | GitRepoDiscoveryProgressEvent;
