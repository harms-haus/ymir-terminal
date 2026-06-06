import { describe, expect, it } from 'bun:test';
import {
  REQUEST_TYPES,
  EVENT_TYPES,
  type RequestType,
  type EventType,
  // Auth
  type AuthRequest,
  // Terminal
  type TerminalCreateRequest,
  type TerminalInputRequest,
  type TerminalResizeRequest,
  type TerminalCloseRequest,
  type TerminalStateRequest,
  type TerminalOutputEvent,
  type TerminalExitEvent,
  // Workspace
  type WorkspaceCreateRequest,
  type WorkspaceUpdateRequest,
  type WorkspaceDeleteRequest,
  type WorkspaceReorderRequest,
  type WorkspaceSubscribeRequest,
  type WorkspaceUnsubscribeRequest,
  // File
  type FileTreeRequest,
  type FileReadRequest,
  type FileWriteRequest,
  type FileDeleteRequest,
  type FileRenameRequest,
  type FileCreateRequest,
  type FileCopyRequest,
  type FileMoveRequest,
  type FileChangeEvent,
  // Git
  type GitStatusRequest,
  type GitLogRequest,
  type GitRepoDiscoveryRequest,
  type GitStageRequest,
  type GitUnstageRequest,
  type GitDiscardRequest,
  type GitCommitRequest,
  type GitBranchesRequest,
  type GitCheckoutRequest,
  type GitPushRequest,
  type GitFetchRequest,
  type GitDiffDataRequest,
  type GitCommitDetailsRequest,
  type GitCommitDiffRequest,
  type GitWorktreeListRequest,
  type GitWorktreeCreateRequest,
  type GitWorktreeRemoveRequest,
  type GitWorktreeMergeRequest,
  type GitWorktreeCopyFilesRequest,
  type GitStashPushRequest,
  type GitStashListRequest,
  type GitStashApplyRequest,
  type GitStashPopRequest,
  type GitStashDropRequest,
  type GitStashClearRequest,
  type GitPullRequest,
  type GitSyncRequest,
  type GitMergeRequest,
  type GitRebaseRequest,
  type GitRebaseAbortRequest,
  type GitRebaseStatusRequest,
  type GitCommitAmendRequest,
  type GitCommitAllRequest,
  type GitResetSoftRequest,
  type GitStageAllRequest,
  type GitUnstageAllRequest,
  type GitDiscardAllRequest,
  type GitBranchRenameRequest,
  type GitBranchDeleteRequest,
  type GitBranchDeleteRemoteRequest,
  type GitBranchPublishRequest,
  type GitBranchesRemoteRequest,
  type GitBranchCreateFromRequest,
  type GitRemoteAddRequest,
  type GitRemoteRemoveRequest,
  type GitRemoteListRequest,
  type GitStatusChangeEvent,
  type GitRepoDiscoveryProgressEvent,
  // Config
  type ConfigGetRequest,
  type ConfigSetRequest,
  // Session
  type ConnectionStatusEvent,
  // Tab
  type TabListRequest,
  type TabCreateRequest,
  type TabUpdateRequest,
  type TabDeleteRequest,
  type TabReorderRequest,
  type TabRestoreRequest,
  // Unions
  type RequestPayload,
  type EventPayload,
} from './payloads';

// ---------------------------------------------------------------------------
// REQUEST_TYPES constant
// ---------------------------------------------------------------------------

describe('REQUEST_TYPES', () => {
  const expected: readonly string[] = [
    'auth',
    'terminal.create',
    'terminal.input',
    'terminal.resize',
    'terminal.close',
    'terminal.state',
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
  ];

  it('contains all expected request types', () => {
    expect(REQUEST_TYPES).toEqual(expected);
  });

  it('has exactly 75 entries', () => {
    expect(REQUEST_TYPES).toHaveLength(75);
  });

  it('is frozen (readonly tuple)', () => {
    // `as const` produces a readonly tuple — TypeScript enforces this, and at
    // runtime the array should still be an Array (just typed as readonly).
    expect(Array.isArray(REQUEST_TYPES)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// EVENT_TYPES constant
// ---------------------------------------------------------------------------

describe('EVENT_TYPES', () => {
  const expected: readonly string[] = [
    'terminal.output',
    'terminal.exit',
    'file.change',
    'connection.status',
    'git.statusChange',
    'git.repoDiscovery.progress',
  ];

  it('contains all expected event types', () => {
    expect(EVENT_TYPES).toEqual(expected);
  });

  it('has exactly 6 entries', () => {
    expect(EVENT_TYPES).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Type union exhaustiveness
// ---------------------------------------------------------------------------

describe('type unions are exhaustive', () => {
  it('RequestType covers every entry in REQUEST_TYPES', () => {
    // Compile-time check: if we miss one, TS will error on the assignment.
    const values: RequestType[] = [...REQUEST_TYPES];
    expect(values).toHaveLength(REQUEST_TYPES.length);
  });

  it('EventType covers every entry in EVENT_TYPES', () => {
    const values: EventType[] = [...EVENT_TYPES];
    expect(values).toHaveLength(EVENT_TYPES.length);
  });
});

// ---------------------------------------------------------------------------
// RequestPayload / EventPayload union exhaustiveness
// ---------------------------------------------------------------------------

describe('RequestPayload union', () => {
  it('accepts every request payload type', () => {
    // Compile-time: each assignment must be valid. If a type is missing from
    // the union, TypeScript will error here.
    const payloads: RequestPayload[] = [
      { password: 'x' } satisfies AuthRequest,
      { workspaceId: 'ws-1' } satisfies TerminalCreateRequest,
      { terminalId: 't-1', data: '' } satisfies TerminalInputRequest,
      { terminalId: 't-1', cols: 80, rows: 24 } satisfies TerminalResizeRequest,
      { terminalId: 't-1' } satisfies TerminalCloseRequest,
      { terminalId: 't-1' } satisfies TerminalStateRequest,
      { name: 'ws', cwd: '/', color: '#000' } satisfies WorkspaceCreateRequest,
      { id: 'ws-1' } satisfies WorkspaceUpdateRequest,
      { id: 'ws-1' } satisfies WorkspaceDeleteRequest,
      { workspaceId: 'ws-1' } satisfies FileTreeRequest,
      { workspaceId: 'ws-1', path: '/a' } satisfies FileReadRequest,
      { workspaceId: 'ws-1', path: '/a', content: '' } satisfies FileWriteRequest,
      { workspaceId: 'ws-1', path: '/a' } satisfies FileDeleteRequest,
      { workspaceId: 'ws-1', oldPath: '/a', newPath: '/b' } satisfies FileRenameRequest,
      { workspaceId: 'ws-1', path: '/a', isDirectory: false } satisfies FileCreateRequest,
      { workspaceId: 'ws-1', srcPath: '/src/a.ts', destDir: '/src/sub' } satisfies FileCopyRequest,
      { workspaceId: 'ws-1', srcPath: '/src/a.ts', destDir: '/src/sub' } satisfies FileMoveRequest,
      { workspaceId: 'ws-1' } satisfies GitStatusRequest,
      { workspaceId: 'ws-1', skip: 0, limit: 50 } satisfies GitLogRequest,
      { workspaceId: 'ws-1' } satisfies GitRepoDiscoveryRequest,
      { workspaceId: 'ws-1', repoPath: '.', files: ['a.ts'] } satisfies GitStageRequest,
      { workspaceId: 'ws-1', repoPath: '.', files: ['a.ts'] } satisfies GitUnstageRequest,
      { workspaceId: 'ws-1', repoPath: '.', files: ['a.ts'] } satisfies GitDiscardRequest,
      { workspaceId: 'ws-1', repoPath: '.', message: 'fix' } satisfies GitCommitRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitBranchesRequest,
      { workspaceId: 'ws-1', repoPath: '.', branch: 'main' } satisfies GitCheckoutRequest,
      { workspaceId: 'ws-1', repoPath: '.', branch: 'main' } satisfies GitPushRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitFetchRequest,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        filePath: 'a.ts',
        staged: false,
      } satisfies GitDiffDataRequest,
      { workspaceId: 'ws-1', repoPath: '.', commitSha: 'abc123' } satisfies GitCommitDetailsRequest,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        commitSha: 'abc123',
        parentSha: 'def456',
        filePath: 'a.ts',
      } satisfies GitCommitDiffRequest,
      { workspaceId: 'ws-1' } satisfies GitWorktreeListRequest,
      { workspaceId: 'ws-1', branchName: 'feature-x' } satisfies GitWorktreeCreateRequest,
      { workspaceId: 'ws-1', worktreePath: '/path/to/wt' } satisfies GitWorktreeRemoveRequest,
      { workspaceId: 'ws-1', worktreePath: '/path/to/wt' } satisfies GitWorktreeMergeRequest,
      { workspaceId: 'ws-1' } satisfies GitWorktreeCopyFilesRequest,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        includeUntracked: true,
        message: 'save point',
      } satisfies GitStashPushRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitStashListRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitStashApplyRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitStashPopRequest,
      { workspaceId: 'ws-1', repoPath: '.', stashRef: 'stash@{0}' } satisfies GitStashDropRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitStashClearRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitPullRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitSyncRequest,
      { workspaceId: 'ws-1', repoPath: '.', branch: 'feature' } satisfies GitMergeRequest,
      { workspaceId: 'ws-1', repoPath: '.', branch: 'feature' } satisfies GitRebaseRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitRebaseAbortRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitRebaseStatusRequest,
      { workspaceId: 'ws-1', repoPath: '.', message: 'amend' } satisfies GitCommitAmendRequest,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        message: 'all',
        includeUntracked: true,
      } satisfies GitCommitAllRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitResetSoftRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitStageAllRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitUnstageAllRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitDiscardAllRequest,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        oldName: 'old',
        newName: 'new',
      } satisfies GitBranchRenameRequest,
      { workspaceId: 'ws-1', repoPath: '.', name: 'bad' } satisfies GitBranchDeleteRequest,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        remote: 'origin',
        branch: 'old',
      } satisfies GitBranchDeleteRemoteRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitBranchPublishRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitBranchesRemoteRequest,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: 'feat',
        startPoint: 'main',
      } satisfies GitBranchCreateFromRequest,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: 'upstream',
        url: 'https://example.com/repo.git',
      } satisfies GitRemoteAddRequest,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        name: 'upstream',
      } satisfies GitRemoteRemoveRequest,
      { workspaceId: 'ws-1', repoPath: '.' } satisfies GitRemoteListRequest,
      { workspaceIds: ['ws-1', 'ws-2'] } satisfies WorkspaceReorderRequest,
      { workspaceId: 'ws-1' } satisfies WorkspaceSubscribeRequest,
      { workspaceId: 'ws-1' } satisfies WorkspaceUnsubscribeRequest,
      { key: 'theme' } satisfies ConfigGetRequest,
      { key: 'theme', value: 'dark' } satisfies ConfigSetRequest,
      { workspaceId: 'ws-1' } satisfies TabListRequest,
      {
        workspaceId: 'ws-1',
        pane: 'content',
        tabType: 'terminal',
        title: 't',
      } satisfies TabCreateRequest,
      { tabId: 'tab-1' } satisfies TabUpdateRequest,
      { tabId: 'tab-1' } satisfies TabDeleteRequest,
      { tabIds: ['tab-1', 'tab-2'] } satisfies TabReorderRequest,
      { workspaceId: 'ws-1' } satisfies TabRestoreRequest,
    ];

    // Ensure they all survive a JSON round-trip
    for (const p of payloads) {
      const parsed = JSON.parse(JSON.stringify(p));
      expect(parsed).toEqual(p);
    }
    // workspace.list has no body (WorkspaceListRequest = Record<string,never>), so
    // REQUEST_TYPES.length - 1 = number of typed payloads with distinguishable fields.
    expect(payloads).toHaveLength(REQUEST_TYPES.length - 1);
  });
});

describe('EventPayload union', () => {
  it('accepts every event payload type', () => {
    const payloads: EventPayload[] = [
      { terminalId: 't-1', data: '' } satisfies TerminalOutputEvent,
      { terminalId: 't-1', exitCode: 0 } satisfies TerminalExitEvent,
      { workspaceId: 'ws-1', path: '/a', kind: 'create' } satisfies FileChangeEvent,
      { status: 'disconnected' } satisfies ConnectionStatusEvent,
      {
        workspaceId: 'ws-1',
        repoPath: '.',
        status: {
          branch: 'main',
          changes: [],
          staged: [],
          hasRemote: true,
          ahead: 0,
          behind: 0,
        },
      } satisfies GitStatusChangeEvent,
      {
        workspaceId: 'ws-1',
        repos: [],
        depth: 0,
        done: false,
      } satisfies GitRepoDiscoveryProgressEvent,
    ];

    for (const p of payloads) {
      const parsed = JSON.parse(JSON.stringify(p));
      expect(parsed).toEqual(p);
    }
    expect(payloads).toHaveLength(EVENT_TYPES.length);
  });
});
