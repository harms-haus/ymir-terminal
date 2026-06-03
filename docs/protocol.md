# WebSocket Protocol

All communication uses a JSON envelope format over a single WebSocket connection.

## Envelope Structure

The base `MessageEnvelope` is a union discriminant. Three concrete subtypes refine it:

```typescript
// Shared fields present on every envelope
interface MessageEnvelope<T = unknown> {
  v: 1; // protocol version
  type: 'request' | 'response' | 'event';
  id?: string; // Required for requests/responses; absent for events
  channel?: string; // Required for requests; absent for most responses/events
  token?: string; // Auth token; attached by the client transport layer
  payload: T;
}

// Client → server request (id and channel are required)
interface RequestEnvelope<T = unknown> extends Omit<MessageEnvelope<T>, 'type' | 'id'> {
  type: 'request';
  id: string;
  payload: T;
}

// Server → client response (paired by id to a prior request)
interface ResponseEnvelope<T = unknown> extends Omit<MessageEnvelope<T | null>, 'type' | 'id'> {
  type: 'response';
  id: string;
  payload: T | null;
  error?: ErrorResponse; // code is typed as ErrorCode (union), not plain string
}

// Server → client unilateral event (no matching request)
interface EventEnvelope<T = unknown> extends Omit<MessageEnvelope<T>, 'type'> {
  type: 'event';
  payload: T;
}
```

## Message Flow

1. **Client sends a request** with `type: "request"` and a unique `id`.
2. **Server responds** with `type: "response"`, same `id`, and either `payload` or `error`.
3. **Server pushes events** with `type: "event"` (no `id` correlation needed).

## Channel Reference

| Channel                  | Direction | Description                                                                                            |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------ |
| `auth`                   | request   | Authenticate with password                                                                             |
| `terminal.create`        | request   | Spawn a new PTY                                                                                        |
| `terminal.input`         | request   | Send keystrokes (base64)                                                                               |
| `terminal.resize`        | request   | Resize terminal dimensions                                                                             |
| `terminal.close`         | request   | Kill a PTY                                                                                             |
| `terminal.output`        | event     | PTY output (base64)                                                                                    |
| `terminal.exit`          | event     | PTY process exited (with exit code)                                                                    |
| `workspace.list`         | request   | List saved workspaces                                                                                  |
| `workspace.create`       | request   | Create a workspace                                                                                     |
| `workspace.update`       | request   | Update workspace settings                                                                              |
| `workspace.delete`       | request   | Delete a workspace                                                                                     |
| `workspace.reorder`      | request   | Reorder workspaces by ID array                                                                         |
| `file.tree`              | request   | Get directory listing                                                                                  |
| `file.read`              | request   | Read file contents                                                                                     |
| `file.write`             | request   | Write file contents                                                                                    |
| `file.create`            | request   | Create file or directory                                                                               |
| `file.delete`            | request   | Delete file or directory                                                                               |
| `file.rename`            | request   | Rename/move a file                                                                                     |
| `file.copy`              | request   | Copy a file or directory to a target directory (auto-renames on conflict)                              |
| `file.move`              | request   | Move a file or directory to a target directory (auto-renames on conflict)                              |
| `file.change`            | event     | Filesystem change notification                                                                         |
| `git.status`             | request   | Get git status for a path; optional `repoPath`, returns `hasRemote`, `ahead`, `behind`                 |
| `git.log`                | request   | Paginated git commit history (`skip`/`limit`, returns `GitLogItem[]` + `hasMore`); optional `repoPath` |
| `git.repoDiscovery`      | request   | Discover all git repositories in a workspace directory                                                 |
| `git.stage`              | request   | Stage files in a git repository                                                                        |
| `git.unstage`            | request   | Unstage files in a git repository                                                                      |
| `git.discard`            | request   | Discard unstaged changes to files                                                                      |
| `git.commit`             | request   | Commit staged changes                                                                                  |
| `git.branches`           | request   | List branches in a git repository                                                                      |
| `git.checkout`           | request   | Switch or create a branch                                                                              |
| `git.push`               | request   | Push branch to origin                                                                                  |
| `git.fetch`              | request   | Fetch from remote                                                                                      |
| `git.diffData`           | request   | Get diff for a file (staged or unstaged)                                                               |
| `git.commitDetails`      | request   | Get commit body and changed files                                                                      |
| `git.commitDiff`         | request   | Get diff of a specific file between a commit and its parent                                            |
| `git.worktreeList`       | request   | List git worktrees for a workspace                                                                     |
| `git.worktreeCreate`     | request   | Create a new git worktree                                                                              |
| `git.worktreeRemove`     | request   | Remove a git worktree                                                                                  |
| `git.worktreeMerge`      | request   | Merge a worktree branch back into a target branch                                                      |
| `git.worktreeCopyFiles`  | request   | List untracked files and configured copy files for worktree setup                                      |
| `git.stashPush`          | request   | Stash current changes                                                                                  |
| `git.stashList`          | request   | List stash entries                                                                                     |
| `git.stashApply`         | request   | Apply a stash without removing it                                                                      |
| `git.stashPop`           | request   | Apply a stash and remove it                                                                            |
| `git.stashDrop`          | request   | Drop a specific stash entry                                                                            |
| `git.stashClear`         | request   | Clear all stash entries                                                                                |
| `git.pull`               | request   | Pull from remote (optionally with rebase)                                                              |
| `git.sync`               | request   | Sync: stash, pull, and pop                                                                             |
| `git.merge`              | request   | Merge a branch into the current branch                                                                 |
| `git.rebase`             | request   | Rebase current branch onto target                                                                      |
| `git.rebaseAbort`        | request   | Abort an in-progress rebase                                                                            |
| `git.rebaseStatus`       | request   | Check if a rebase is in progress                                                                       |
| `git.commitAmend`        | request   | Amend the last commit                                                                                  |
| `git.commitAll`          | request   | Stage all changes and commit in one step                                                               |
| `git.resetSoft`          | request   | Soft reset to a ref (keeps changes staged)                                                             |
| `git.stageAll`           | request   | Stage all changes                                                                                      |
| `git.unstageAll`         | request   | Unstage all changes                                                                                    |
| `git.discardAll`         | request   | Discard all unstaged changes                                                                           |
| `git.branchRename`       | request   | Rename a branch                                                                                        |
| `git.branchDelete`       | request   | Delete a local branch                                                                                  |
| `git.branchDeleteRemote` | request   | Delete a remote branch                                                                                 |
| `git.branchPublish`      | request   | Publish current branch to remote                                                                       |
| `git.branchesRemote`     | request   | List remote branches                                                                                   |
| `git.branchCreateFrom`   | request   | Create a new branch from a specific start point                                                        |
| `git.remoteAdd`          | request   | Add a remote                                                                                           |
| `git.remoteRemove`       | request   | Remove a remote                                                                                        |
| `git.remoteList`         | request   | List remotes                                                                                           |
| `config.get`             | request   | Get a config value from server_config table                                                            |
| `config.set`             | request   | Set a config value in server_config table                                                              |
| `tab.list`               | request   | List tabs for a workspace (with terminal liveness); optional `pane` filter                             |
| `tab.create`             | request   | Create a tab (terminal, editor, diff, or git-tree)                                                     |
| `tab.update`             | request   | Update tab properties (active, title, sort order)                                                      |
| `tab.delete`             | request   | Delete a tab                                                                                           |
| `tab.reorder`            | request   | Reorder tabs by ID array                                                                               |
| `tab.restore`            | request   | Restore persisted tabs for a workspace, creating new PTYs for terminal tabs                            |
| `connection.status`      | event     | Connection status change                                                                               |

Terminal data is base64-encoded to safely transport binary PTY output over JSON.

## Git Channel Type Reference

All git request payloads include `workspaceId` (and usually `repoPath`).
Only the distinguishing fields are listed below.

### Diff & Commit Inspection

| Channel             | Request type              | Response type              | Fields                                                                                              |
| ------------------- | ------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `git.diffData`      | `GitDiffDataRequest`      | `GitDiffDataResponse`      | req: `filePath`, `staged`; res: `originalContent`, `modifiedContent`, `additions`, `deletions`      |
| `git.commitDetails` | `GitCommitDetailsRequest` | `GitCommitDetailsResponse` | req: `commitSha`; res: `body`, `files` (`GitCommitFileChange[]`)                                    |
| `git.commitDiff`    | `GitCommitDiffRequest`    | `GitCommitDiffResponse`    | req: `commitSha`, `parentSha` (`''` for root), `filePath`; res: same shape as `GitDiffDataResponse` |

### Stash Operations

| Channel          | Request type           | Response type          | Fields                                                            |
| ---------------- | ---------------------- | ---------------------- | ----------------------------------------------------------------- |
| `git.stashPush`  | `GitStashPushRequest`  | `GitStashPushResponse` | req: `includeUntracked?`, `message?`; res: `stashRef`             |
| `git.stashList`  | `GitStashListRequest`  | `GitStashListResponse` | res: `stashes` (`GitStashEntry[]` with `index`, `ref`, `message`) |
| `git.stashApply` | `GitStashApplyRequest` | —                      | req: `stashRef?` (defaults to latest)                             |
| `git.stashPop`   | `GitStashPopRequest`   | —                      | req: `stashRef?` (defaults to latest)                             |
| `git.stashDrop`  | `GitStashDropRequest`  | —                      | req: `stashRef` (required)                                        |
| `git.stashClear` | `GitStashClearRequest` | —                      | —                                                                 |

### Pull / Sync

| Channel    | Request type     | Response type | Fields                              |
| ---------- | ---------------- | ------------- | ----------------------------------- |
| `git.pull` | `GitPullRequest` | —             | req: `rebase?`                      |
| `git.sync` | `GitSyncRequest` | —             | Stash → pull → pop in one operation |

### Merge / Rebase

| Channel            | Request type             | Response type             | Fields                       |
| ------------------ | ------------------------ | ------------------------- | ---------------------------- |
| `git.merge`        | `GitMergeRequest`        | `GitMergeResponse`        | req: `branch`; res: `result` |
| `git.rebase`       | `GitRebaseRequest`       | —                         | req: `branch`                |
| `git.rebaseAbort`  | `GitRebaseAbortRequest`  | —                         | —                            |
| `git.rebaseStatus` | `GitRebaseStatusRequest` | `GitRebaseStatusResponse` | res: `inProgress`            |

### Enhanced Commit

| Channel           | Request type            | Response type            | Fields                                                           |
| ----------------- | ----------------------- | ------------------------ | ---------------------------------------------------------------- |
| `git.commitAmend` | `GitCommitAmendRequest` | `GitCommitAmendResponse` | req: `message?`, `noEdit?`; res: `commitHash`                    |
| `git.commitAll`   | `GitCommitAllRequest`   | `GitCommitAllResponse`   | req: `message`, `includeUntracked?`, `amend?`; res: `commitHash` |
| `git.resetSoft`   | `GitResetSoftRequest`   | —                        | req: `ref?` (defaults to HEAD)                                   |

### Bulk Change Operations

| Channel          | Request type           | Response type | Fields |
| ---------------- | ---------------------- | ------------- | ------ |
| `git.stageAll`   | `GitStageAllRequest`   | —             | —      |
| `git.unstageAll` | `GitUnstageAllRequest` | —             | —      |
| `git.discardAll` | `GitDiscardAllRequest` | —             | —      |

### Enhanced Branch Operations

| Channel                  | Request type                   | Response type               | Fields                              |
| ------------------------ | ------------------------------ | --------------------------- | ----------------------------------- |
| `git.branchRename`       | `GitBranchRenameRequest`       | —                           | req: `oldName`, `newName`           |
| `git.branchDelete`       | `GitBranchDeleteRequest`       | —                           | req: `name`, `force?`               |
| `git.branchDeleteRemote` | `GitBranchDeleteRemoteRequest` | —                           | req: `remote`, `branch`             |
| `git.branchPublish`      | `GitBranchPublishRequest`      | —                           | req: `remote?` (defaults to origin) |
| `git.branchesRemote`     | `GitBranchesRemoteRequest`     | `GitBranchesRemoteResponse` | res: `branches` (`GitBranch[]`)     |
| `git.branchCreateFrom`   | `GitBranchCreateFromRequest`   | —                           | req: `name`, `startPoint`           |

### Remote Management

| Channel            | Request type             | Response type           | Fields                                                                 |
| ------------------ | ------------------------ | ----------------------- | ---------------------------------------------------------------------- |
| `git.remoteAdd`    | `GitRemoteAddRequest`    | —                       | req: `name`, `url`                                                     |
| `git.remoteRemove` | `GitRemoteRemoveRequest` | —                       | req: `name`                                                            |
| `git.remoteList`   | `GitRemoteListRequest`   | `GitRemoteListResponse` | res: `remotes` (`GitRemoteEntry[]` with `name`, `fetchUrl`, `pushUrl`) |

### Worktree Extended Operations

| Channel                 | Request type                  | Response type                  | Fields                                                                                                                   |
| ----------------------- | ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `git.worktreeMerge`     | `GitWorktreeMergeRequest`     | `GitWorktreeMergeResponse`     | req: `worktreePath`, `targetBranch?`, `deleteAfterMerge?`, `filesToCopy?`; res: `success`, `message`, `worktreeRemoved?` |
| `git.worktreeCopyFiles` | `GitWorktreeCopyFilesRequest` | `GitWorktreeCopyFilesResponse` | req: `dirPath?`; res: `untrackedFiles[]`, `configuredFiles[]`                                                            |

## Tab Channel Type Reference

All tab request payloads include `workspaceId` (except `tab.update`, `tab.delete` which use `tabId`).
The `pane` field is a dynamic string (any pane ID), not limited to a fixed set.

### Tab Listing & Restoration

| Channel       | Request type        | Response type        | Fields                                                                                                    |
| ------------- | ------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| `tab.list`    | `TabListRequest`    | `TabListResponse`    | req: `pane?`; res: `tabs` (`TabInfo[]`)                                                                   |
| `tab.restore` | `TabRestoreRequest` | `TabRestoreResponse` | req: `workspaceId`; res: `tabs` (`PersistedTabInfo[]`) — creates new PTYs for terminal tabs, updates IDs  |

### Tab Lifecycle

| Channel       | Request type       | Response type    | Fields                                                                                                                              |
| ------------- | ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `tab.create`  | `TabCreateRequest` | `TabCreateResponse` | req: `pane`, `tabType`, `title`, `terminalId?`, `filePath?`, `diffRef?`, `diffRepoPath?`, `repoPath?`, `commitSha?`, `parentSha?`, `cwd?`, `customTitle?`; res: `tabId` |
| `tab.update`  | `TabUpdateRequest` | —                | req: `tabId`, `active?`, `sortOrder?`, `title?`                                                                                     |
| `tab.delete`  | `TabDeleteRequest` | —                | req: `tabId`                                                                                                                        |
| `tab.reorder` | `TabReorderRequest`| —                | req: `tabIds` (`string[]`)                                                                                                          |

### TabInfo

Returned by `tab.list`. Represents a live tab in the current session.

```typescript
interface TabInfo {
  id: string;
  tabType: 'terminal' | 'editor' | 'diff' | 'git-tree';
  title: string | null;
  filePath: string | null;
  terminalId: string | null;
  active: boolean;
  sortOrder: number;
  terminalAlive?: boolean;      // present when terminalId is set
  diffRef?: 'staged' | 'unstaged' | 'commit' | null;
  repoPath?: string | null;
  commitSha?: string | null;
  parentSha?: string | null;
  cwd?: string | null;
  customTitle?: string | null;
}
```

### PersistedTabInfo

Returned by `tab.restore`. Represents a tab persisted across server restarts.
Terminal tabs include a freshly-created `terminalId`.

```typescript
interface PersistedTabInfo {
  id: string;
  tabType: 'terminal' | 'editor' | 'diff' | 'git-tree';
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
}
```

## Protocol Type Reference

### Type Narrowing

Several protocol types use union types for correctness:

| Type                    | Field     | Union                                                                                                 |
| ----------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `ConnectionStatusEvent` | `status`  | `'connecting' \| 'connected' \| 'disconnected' \| 'reconnecting'` (was bare `string`)                 |
| `TabCreateRequest`      | `diffRef` | `'staged' \| 'unstaged' \| 'commit' \| null` (was bare `string`)                                      |
| `TabInfo`               | —         | Includes `tabType`, `diffRef`, `repoPath`, `cwd`, `customTitle`, etc.                                                      |

### Removed Types

`packages/shared/src/protocol/panes.ts` has been removed. The types it defined (`SplitDirection`, `PaneNode`, `SplitNode`, `LayoutNode`) were never used at runtime.

## Authentication Flow

1. Client connects via WebSocket.
2. Client sends an `auth` request with `{ password }`.
3. Server hashes the password (Argon2id) and compares against the stored hash.
4. On success, server returns a JWT signed with HS256 (7-day expiry).
5. Client stores the JWT and includes it via the `token` field on every subsequent request.
6. Server validates the JWT on each request before dispatching to handlers.

The server requires a password to start. Without `--password` or `YMIR_PASSWORD` env var, it exits with an error.
