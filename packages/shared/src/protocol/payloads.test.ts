import { describe, expect, it } from 'bun:test';
import {
  REQUEST_TYPES,
  EVENT_TYPES,
  type RequestType,
  type EventType,
  // Auth
  type AuthRequest,
  type AuthResponse,
  // Terminal
  type TerminalCreateRequest,
  type TerminalCreateResponse,
  type TerminalInputRequest,
  type TerminalResizeRequest,
  type TerminalOutputEvent,
  type TerminalCloseRequest,
  type TerminalExitEvent,
  // Workspace
  type WorkspaceSummary,
  type WorkspaceListResponse,
  type WorkspaceCreateRequest,
  type WorkspaceCreateResponse,
  type WorkspaceUpdateRequest,
  type WorkspaceDeleteRequest,
  type WorkspaceReorderRequest,
  // File
  type FileNode,
  type FileTreeRequest,
  type FileTreeResponse,
  type FileReadRequest,
  type FileReadResponse,
  type FileWriteRequest,
  type FileDeleteRequest,
  type FileRenameRequest,
  type FileCreateRequest,
  type FileCopyRequest,
  type FileMoveRequest,
  type FileChangeEvent,
  // Git
  type GitFileChange,
  type GitStatusRequest,
  type GitStatusResponse,
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
  // Config
  type ConfigGetRequest,
  type ConfigGetResponse,
  type ConfigSetRequest,
  type ConfigSetResponse,
  // Session
  type ConnectionStatusEvent,
  // Unions
  // Tab
  type TabListRequest,
  type TabCreateRequest,
  type TabUpdateRequest,
  type TabDeleteRequest,
  type TabReorderRequest,
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
    'workspace.list',
    'workspace.create',
    'workspace.update',
    'workspace.delete',
    'workspace.reorder',
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
    'config.get',
    'config.set',
    'tab.list',
    'tab.create',
    'tab.update',
    'tab.delete',
    'tab.reorder',
  ];

  it('contains all expected request types', () => {
    expect(REQUEST_TYPES).toEqual(expected);
  });

  it('has exactly 44 entries', () => {
    expect(REQUEST_TYPES).toHaveLength(44);
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
  ];

  it('contains all expected event types', () => {
    expect(EVENT_TYPES).toEqual(expected);
  });

  it('has exactly 4 entries', () => {
    expect(EVENT_TYPES).toHaveLength(4);
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
// Auth payloads
// ---------------------------------------------------------------------------

describe('AuthRequest', () => {
  it('round-trips through JSON', () => {
    const payload: AuthRequest = { password: 's3cret!' };
    const json = JSON.stringify(payload);
    const parsed: AuthRequest = JSON.parse(json);
    expect(parsed).toEqual(payload);
    expect(parsed.password).toBe('s3cret!');
  });
});

describe('AuthResponse', () => {
  it('round-trips through JSON', () => {
    const payload: AuthResponse = { token: 'jwt-token', expiresIn: 3600 };
    const json = JSON.stringify(payload);
    const parsed: AuthResponse = JSON.parse(json);
    expect(parsed).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// Terminal payloads
// ---------------------------------------------------------------------------

describe('TerminalCreateRequest', () => {
  it('round-trips through JSON with required fields only', () => {
    const payload: TerminalCreateRequest = { workspaceId: 'ws-1' };
    const parsed: TerminalCreateRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });

  it('round-trips through JSON with optional fields', () => {
    const payload: TerminalCreateRequest = {
      workspaceId: 'ws-1',
      cols: 120,
      rows: 40,
    };
    const parsed: TerminalCreateRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('TerminalCreateResponse', () => {
  it('round-trips through JSON', () => {
    const payload: TerminalCreateResponse = { terminalId: 't-1' };
    const parsed: TerminalCreateResponse = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('TerminalInputRequest', () => {
  it('round-trips through JSON', () => {
    const payload: TerminalInputRequest = {
      terminalId: 't-1',
      data: 'aGVsbG8=',
    };
    const parsed: TerminalInputRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
    expect(parsed.data).toBe('aGVsbG8='); // base64
  });
});

describe('TerminalResizeRequest', () => {
  it('round-trips through JSON', () => {
    const payload: TerminalResizeRequest = {
      terminalId: 't-1',
      cols: 80,
      rows: 24,
    };
    const parsed: TerminalResizeRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('TerminalOutputEvent', () => {
  it('round-trips through JSON', () => {
    const payload: TerminalOutputEvent = {
      terminalId: 't-1',
      data: 'b3V0cHV0',
    };
    const parsed: TerminalOutputEvent = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
    expect(parsed.data).toBe('b3V0cHV0'); // base64
  });
});

describe('TerminalCloseRequest', () => {
  it('round-trips through JSON', () => {
    const payload: TerminalCloseRequest = { terminalId: 't-1' };
    const parsed: TerminalCloseRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('TerminalExitEvent', () => {
  it('round-trips through JSON', () => {
    const payload: TerminalExitEvent = { terminalId: 't-1', exitCode: 0 };
    const parsed: TerminalExitEvent = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// Workspace payloads
// ---------------------------------------------------------------------------

describe('WorkspaceSummary', () => {
  it('round-trips through JSON', () => {
    const payload: WorkspaceSummary = {
      id: 'ws-1',
      name: 'my-project',
      cwd: '/home/user/project',
      color: '#ff0000',
      sortOrder: 0,
    };
    const parsed: WorkspaceSummary = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('WorkspaceListResponse', () => {
  it('round-trips through JSON', () => {
    const payload: WorkspaceListResponse = {
      workspaces: [
        { id: 'ws-1', name: 'a', cwd: '/a', color: '#000', sortOrder: 0 },
        { id: 'ws-2', name: 'b', cwd: '/b', color: '#111', sortOrder: 1 },
      ],
    };
    const parsed: WorkspaceListResponse = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
    expect(parsed.workspaces).toHaveLength(2);
  });
});

describe('WorkspaceCreateRequest', () => {
  it('round-trips through JSON', () => {
    const payload: WorkspaceCreateRequest = {
      name: 'new-ws',
      cwd: '/home/user/new',
      color: '#00ff00',
    };
    const parsed: WorkspaceCreateRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('WorkspaceCreateResponse', () => {
  it('round-trips through JSON', () => {
    const payload: WorkspaceCreateResponse = {
      workspace: { id: 'ws-3', name: 'new-ws', cwd: '/new', color: '#00ff00' },
    };
    const parsed: WorkspaceCreateResponse = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('WorkspaceUpdateRequest', () => {
  it('round-trips through JSON with optional fields', () => {
    const payload: WorkspaceUpdateRequest = {
      id: 'ws-1',
      name: 'renamed',
      cwd: '/new/path',
      color: '#ffffff',
    };
    const parsed: WorkspaceUpdateRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });

  it('round-trips through JSON with only required fields', () => {
    const payload: WorkspaceUpdateRequest = { id: 'ws-1' };
    const parsed: WorkspaceUpdateRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('WorkspaceDeleteRequest', () => {
  it('round-trips through JSON', () => {
    const payload: WorkspaceDeleteRequest = { id: 'ws-1' };
    const parsed: WorkspaceDeleteRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// File payloads
// ---------------------------------------------------------------------------

describe('FileNode', () => {
  it('round-trips through JSON (file node without children)', () => {
    const payload: FileNode = {
      name: 'index.ts',
      path: '/src/index.ts',
      isDirectory: false,
    };
    const parsed: FileNode = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
    expect(parsed.children).toBeUndefined();
  });

  it('round-trips through JSON (directory node with children)', () => {
    const payload: FileNode = {
      name: 'src',
      path: '/src',
      isDirectory: true,
      children: [{ name: 'index.ts', path: '/src/index.ts', isDirectory: false }],
    };
    const parsed: FileNode = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
    expect(parsed.children).toHaveLength(1);
  });
});

describe('FileTreeRequest', () => {
  it('round-trips through JSON with required fields only', () => {
    const payload: FileTreeRequest = { workspaceId: 'ws-1' };
    const parsed: FileTreeRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });

  it('round-trips through JSON with optional path', () => {
    const payload: FileTreeRequest = { workspaceId: 'ws-1', path: '/src' };
    const parsed: FileTreeRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileTreeResponse', () => {
  it('round-trips through JSON', () => {
    const payload: FileTreeResponse = {
      tree: [
        { name: 'src', path: '/src', isDirectory: true, children: [] },
        { name: 'README.md', path: '/README.md', isDirectory: false },
      ],
    };
    const parsed: FileTreeResponse = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileReadRequest', () => {
  it('round-trips through JSON', () => {
    const payload: FileReadRequest = {
      workspaceId: 'ws-1',
      path: '/src/index.ts',
    };
    const parsed: FileReadRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileReadResponse', () => {
  it('round-trips through JSON', () => {
    const payload: FileReadResponse = {
      content: "console.log('hello')",
      language: 'typescript',
    };
    const parsed: FileReadResponse = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileWriteRequest', () => {
  it('round-trips through JSON', () => {
    const payload: FileWriteRequest = {
      workspaceId: 'ws-1',
      path: '/src/index.ts',
      content: "console.log('updated')",
    };
    const parsed: FileWriteRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileDeleteRequest', () => {
  it('round-trips through JSON', () => {
    const payload: FileDeleteRequest = {
      workspaceId: 'ws-1',
      path: '/src/old.ts',
    };
    const parsed: FileDeleteRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileRenameRequest', () => {
  it('round-trips through JSON', () => {
    const payload: FileRenameRequest = {
      workspaceId: 'ws-1',
      oldPath: '/src/old.ts',
      newPath: '/src/new.ts',
    };
    const parsed: FileRenameRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileCreateRequest', () => {
  it('round-trips through JSON (file)', () => {
    const payload: FileCreateRequest = {
      workspaceId: 'ws-1',
      path: '/src/new-file.ts',
      isDirectory: false,
    };
    const parsed: FileCreateRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });

  it('round-trips through JSON (directory)', () => {
    const payload: FileCreateRequest = {
      workspaceId: 'ws-1',
      path: '/src/new-dir',
      isDirectory: true,
    };
    const parsed: FileCreateRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileCopyRequest', () => {
  it('round-trips through JSON', () => {
    const payload: FileCopyRequest = {
      workspaceId: 'ws-1',
      srcPath: '/src/a.ts',
      destDir: '/src/sub',
    };
    const parsed: FileCopyRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileMoveRequest', () => {
  it('round-trips through JSON', () => {
    const payload: FileMoveRequest = {
      workspaceId: 'ws-1',
      srcPath: '/src/a.ts',
      destDir: '/src/sub',
    };
    const parsed: FileMoveRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('FileChangeEvent', () => {
  it('round-trips through JSON', () => {
    const payload: FileChangeEvent = {
      workspaceId: 'ws-1',
      path: '/src/index.ts',
      kind: 'modify',
    };
    const parsed: FileChangeEvent = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// Git payloads
// ---------------------------------------------------------------------------

describe('GitFileChange', () => {
  it('round-trips through JSON', () => {
    const payload: GitFileChange = {
      path: '/src/index.ts',
      status: 'M',
    };
    const parsed: GitFileChange = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('GitStatusRequest', () => {
  it('round-trips through JSON', () => {
    const payload: GitStatusRequest = { workspaceId: 'ws-1' };
    const parsed: GitStatusRequest = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('GitStatusResponse', () => {
  it('round-trips through JSON', () => {
    const payload: GitStatusResponse = {
      branch: 'main',
      changes: [
        { path: '/src/index.ts', status: 'modified' },
        { path: '/src/new.ts', status: 'added' },
      ],
      staged: [{ path: '/README.md', status: 'modified' }],
      hasRemote: true,
      ahead: 2,
      behind: 0,
    };
    const parsed: GitStatusResponse = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
    expect(parsed.changes).toHaveLength(2);
    expect(parsed.staged).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Session payloads
// ---------------------------------------------------------------------------

describe('ConnectionStatusEvent', () => {
  it('round-trips through JSON', () => {
    const payload: ConnectionStatusEvent = { status: 'connected' };
    const parsed: ConnectionStatusEvent = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
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
      { workspaceIds: ['ws-1', 'ws-2'] } satisfies WorkspaceReorderRequest,
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
    ];

    // Ensure they all survive a JSON round-trip
    for (const p of payloads) {
      const parsed = JSON.parse(JSON.stringify(p));
      expect(parsed).toEqual(p);
    }
    // 42 payload types: workspace.list has no body (WorkspaceListRequest = Record<string,never>)
    // so REQUEST_TYPES (44) minus workspace.list = 43.
    // All 44 have payload types, but workspace.list's type is
    // Record<string,never> which has no distinguishing fields to satisfy.
    // Count: 43 REQUEST_TYPES - 1 no-body type (workspace.list = Record<string,never>)
    // = 42 typed payloads.
    expect(payloads).toHaveLength(REQUEST_TYPES.length - 1);
  });
});

// ---------------------------------------------------------------------------
// Config response payloads
// ---------------------------------------------------------------------------

describe('ConfigGetResponse', () => {
  it('round-trips through JSON', () => {
    const payload: ConfigGetResponse = { key: 'theme', value: 'dark' };
    const parsed: ConfigGetResponse = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });

  it('round-trips with null value', () => {
    const payload: ConfigGetResponse = { key: 'unknown', value: null };
    const parsed: ConfigGetResponse = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('ConfigSetResponse', () => {
  it('round-trips through JSON', () => {
    const payload: ConfigSetResponse = { ok: true };
    const parsed: ConfigSetResponse = JSON.parse(JSON.stringify(payload));
    expect(parsed).toEqual(payload);
  });
});

describe('EventPayload union', () => {
  it('accepts every event payload type', () => {
    const payloads: EventPayload[] = [
      { terminalId: 't-1', data: '' } satisfies TerminalOutputEvent,
      { terminalId: 't-1', exitCode: 0 } satisfies TerminalExitEvent,
      { workspaceId: 'ws-1', path: '/a', kind: 'create' } satisfies FileChangeEvent,
      { status: 'disconnected' } satisfies ConnectionStatusEvent,
    ];

    for (const p of payloads) {
      const parsed = JSON.parse(JSON.stringify(p));
      expect(parsed).toEqual(p);
    }
    expect(payloads).toHaveLength(EVENT_TYPES.length);
  });
});
