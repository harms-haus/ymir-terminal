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

// Server → client unilateral event (no matching request, no id)
interface EventEnvelope<T = unknown> extends Omit<MessageEnvelope<T>, 'type' | 'id'> {
  type: 'event';
  payload: T;
}
```

## Message Flow

1. **Client sends a request** with `type: "request"` and a unique `id`.
2. **Server responds** with `type: "response"`, same `id`, and either `payload` or `error`.
3. **Server pushes events** with `type: "event"` (no `id` correlation needed).

## Channel Reference

| Channel                      | Direction | Description                                                                                              |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `auth`                       | request   | Authenticate with password                                                                               |
| `terminal.create`            | request   | Spawn a new PTY                                                                                          |
| `terminal.input`             | request   | Send keystrokes (base64)                                                                                 |
| `terminal.resize`            | request   | Resize terminal dimensions                                                                               |
| `terminal.close`             | request   | Kill a PTY                                                                                               |
| `terminal.state`             | request   | Get buffered VT output + dimensions for re-attachment                                                    |
| `terminal.output`            | event     | PTY output (base64)                                                                                      |
| `terminal.exit`              | event     | PTY process exited (with exit code)                                                                      |
| `workspace.list`             | request   | List saved workspaces                                                                                    |
| `workspace.create`           | request   | Create a workspace                                                                                       |
| `workspace.update`           | request   | Update workspace settings                                                                                |
| `workspace.delete`           | request   | Delete a workspace                                                                                       |
| `workspace.reorder`          | request   | Reorder workspaces by ID array                                                                           |
| `workspace.subscribe`        | request   | Subscribe to real-time updates for a workspace                                                           |
| `workspace.unsubscribe`      | request   | Unsubscribe from real-time updates for a workspace                                                       |
| `file.tree`                  | request   | Get directory listing                                                                                    |
| `file.read`                  | request   | Read file contents                                                                                       |
| `file.write`                 | request   | Write file contents                                                                                      |
| `file.create`                | request   | Create file or directory                                                                                 |
| `file.delete`                | request   | Delete file or directory                                                                                 |
| `file.rename`                | request   | Rename/move a file                                                                                       |
| `file.copy`                  | request   | Copy a file or directory to a target directory (auto-renames on conflict)                                |
| `file.move`                  | request   | Move a file or directory to a target directory (auto-renames on conflict)                                |
| `file.change`                | event     | Filesystem change notification                                                                           |
| `file.search`                | request   | Search files for text matches (streaming results via progress events)                                    |
| `file.search.replace`        | request   | Find and replace text across files in a workspace                                                        |
| `file.search.progress`       | event     | Incremental search results — emitted per file during `file.search` request processing                    |
| `git.status`                 | request   | Get git status for a path; optional `repoPath`, returns `hasRemote`, `ahead`, `behind`                   |
| `git.log`                    | request   | Paginated git commit history (`skip`/`limit`, returns `GitLogItem[]` + `hasMore`); optional `repoPath`   |
| `git.repoDiscovery`          | request   | Discover git repositories in a workspace directory (optional `repoPath` scopes to a subdirectory)        |
| `git.repoDiscovery.progress` | event     | Incremental repo discovery results — emitted per BFS depth during `git.repoDiscovery` request processing |
| `git.stage`                  | request   | Stage files in a git repository                                                                          |
| `git.unstage`                | request   | Unstage files in a git repository                                                                        |
| `git.discard`                | request   | Discard unstaged changes to files                                                                        |
| `git.commit`                 | request   | Commit staged changes                                                                                    |
| `git.branches`               | request   | List branches in a git repository                                                                        |
| `git.checkout`               | request   | Switch or create a branch                                                                                |
| `git.push`                   | request   | Push branch to origin                                                                                    |
| `git.fetch`                  | request   | Fetch from remote                                                                                        |
| `git.diffData`               | request   | Get diff for a file (staged or unstaged)                                                                 |
| `git.commitDetails`          | request   | Get commit body and changed files                                                                        |
| `git.commitDiff`             | request   | Get diff of a specific file between a commit and its parent                                              |
| `git.worktreeList`           | request   | List git worktrees for a workspace                                                                       |
| `git.worktreeCreate`         | request   | Create a new git worktree                                                                                |
| `git.worktreeRemove`         | request   | Remove a git worktree                                                                                    |
| `git.worktreeMerge`          | request   | Merge a worktree branch back into a target branch                                                        |
| `git.worktreeCopyFiles`      | request   | List untracked files and configured copy files for worktree setup                                        |
| `git.stashPush`              | request   | Stash current changes                                                                                    |
| `git.stashList`              | request   | List stash entries                                                                                       |
| `git.stashApply`             | request   | Apply a stash without removing it                                                                        |
| `git.stashPop`               | request   | Apply a stash and remove it                                                                              |
| `git.stashDrop`              | request   | Drop a specific stash entry                                                                              |
| `git.stashClear`             | request   | Clear all stash entries                                                                                  |
| `git.pull`                   | request   | Pull from remote (optionally with rebase)                                                                |
| `git.sync`                   | request   | Sync: stash, pull, and pop                                                                               |
| `git.merge`                  | request   | Merge a branch into the current branch                                                                   |
| `git.rebase`                 | request   | Rebase current branch onto target                                                                        |
| `git.rebaseAbort`            | request   | Abort an in-progress rebase                                                                              |
| `git.rebaseStatus`           | request   | Check if a rebase is in progress                                                                         |
| `git.commitAmend`            | request   | Amend the last commit                                                                                    |
| `git.commitAll`              | request   | Stage all changes and commit in one step                                                                 |
| `git.resetSoft`              | request   | Soft reset to a ref (keeps changes staged)                                                               |
| `git.stageAll`               | request   | Stage all changes                                                                                        |
| `git.unstageAll`             | request   | Unstage all changes                                                                                      |
| `git.discardAll`             | request   | Discard all unstaged changes                                                                             |
| `git.branchRename`           | request   | Rename a branch                                                                                          |
| `git.branchDelete`           | request   | Delete a local branch                                                                                    |
| `git.branchDeleteRemote`     | request   | Delete a remote branch                                                                                   |
| `git.branchPublish`          | request   | Publish current branch to remote                                                                         |
| `git.branchesRemote`         | request   | List remote branches                                                                                     |
| `git.branchCreateFrom`       | request   | Create a new branch from a specific start point                                                          |
| `git.remoteAdd`              | request   | Add a remote                                                                                             |
| `git.remoteRemove`           | request   | Remove a remote                                                                                          |
| `git.remoteList`             | request   | List remotes                                                                                             |
| `path.autocomplete`          | request   | List directories at a given path for autocomplete (1-level deep, sorted, max 256 entries)                |
| `config.get`                 | request   | Get a config value from server_config table                                                              |
| `config.set`                 | request   | Set a config value in server_config table                                                                |
| `tab.list`                   | request   | List tabs for a workspace (with terminal liveness); optional `pane` filter                               |
| `tab.create`                 | request   | Create a tab (terminal, editor, diff, or git-tree)                                                       |
| `tab.update`                 | request   | Update tab properties (active, title, sort order)                                                        |
| `tab.delete`                 | request   | Delete a tab                                                                                             |
| `tab.reorder`                | request   | Reorder tabs by ID array                                                                                 |
| `tab.restore`                | request   | Restore persisted tabs for a workspace, reusing live PTYs or creating new ones for terminal tabs         |
| `git.statusChange`           | event     | Git status updated (`GitStatusChangeEvent` with `workspaceId`, `repoPath`, `status: GitStatusResponse`)  |
| `connection.status`          | event     | Connection status change                                                                                 |

Terminal data is base64-encoded to safely transport binary PTY output over JSON.

## Shared Git Types

```typescript
type GitFileChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | '??';
```

| Value | Meaning   |
| ----- | --------- |
| `M`   | Modified  |
| `A`   | Added     |
| `D`   | Deleted   |
| `R`   | Renamed   |
| `C`   | Copied    |
| `??`  | Untracked |

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

### Status Change Event

| Channel            | Event type             | Fields                                                                           |
| ------------------ | ---------------------- | -------------------------------------------------------------------------------- |
| `git.statusChange` | `GitStatusChangeEvent` | `workspaceId`, `repoPath`, `status` (`GitStatusResponse` — full status snapshot) |

### Repo Discovery Progress Event

| Channel                      | Event type                      | Fields                                                                                    |
| ---------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `git.repoDiscovery.progress` | `GitRepoDiscoveryProgressEvent` | `workspaceId`, `repos` (`GitRepoInfo[]`), `depth` (BFS level, 0 = root), `done` (boolean) |

```typescript
interface GitRepoDiscoveryProgressEvent {
  workspaceId: string; // workspace being scanned
  repos: GitRepoInfo[]; // repos discovered at this depth
  depth: number; // BFS level (0 = workspace root)
  done: boolean; // Always false; completion is signaled by the final git.repoDiscovery response
}
```

### Repo Discovery Request / Response

| Channel             | Request type              | Response type              | Fields                                           |
| ------------------- | ------------------------- | -------------------------- | ------------------------------------------------ |
| `git.repoDiscovery` | `GitRepoDiscoveryRequest` | `GitRepoDiscoveryResponse` | req: `repoPath?`; res: `repos` (`GitRepoInfo[]`) |

Full type signatures:

- `GitRepoDiscoveryRequest { workspaceId: string, repoPath?: string }`
- `GitRepoDiscoveryResponse { repos: GitRepoInfo[] }`

When a client sends a `git.repoDiscovery` request, the server emits `git.repoDiscovery.progress` events (one per BFS depth that contains repos) before sending the final response with the complete sorted list. Clients subscribe to these events via `wsClient.onMessage` filtering by channel and `workspaceId` for progressive display.

### Worktree Extended Operations

| Channel                 | Request type                  | Response type                  | Fields                                                                                                                   |
| ----------------------- | ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `git.worktreeMerge`     | `GitWorktreeMergeRequest`     | `GitWorktreeMergeResponse`     | req: `worktreePath`, `targetBranch?`, `deleteAfterMerge?`, `filesToCopy?`; res: `success`, `message`, `worktreeRemoved?` |
| `git.worktreeCopyFiles` | `GitWorktreeCopyFilesRequest` | `GitWorktreeCopyFilesResponse` | req: `dirPath?`; res: `untrackedFiles[]`, `configuredFiles[]`                                                            |

## File Search Channel Type Reference

### Search

| Channel               | Request type               | Response type               | Fields                                                                                                                                              |
| --------------------- | -------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file.search`         | `FileSearchRequest`        | `FileSearchResponse`        | req: `query`, `caseSensitive?`, `wholeWord?`, `useRegex?`, `includePattern?`; res: `totalMatches`, `truncated`, `fileCount`                         |
| `file.search.replace` | `FileSearchReplaceRequest` | `FileSearchReplaceResponse` | req: `query`, `replacement`, `caseSensitive?`, `wholeWord?`, `useRegex?`, `includePattern?`; res: `replacedFiles` (`string[]`), `totalReplacements` |

### Search Progress Event

| Channel                | Event type                | Fields                                                                                                                                        |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `file.search.progress` | `FileSearchProgressEvent` | `workspaceId`, `requestId` (correlates to request `id`), `fileResult` (`FileSearchFileResult`), `done` (boolean), `totalMatches`, `truncated` |

### Type Definitions

```typescript
interface FileSearchRequest {
  workspaceId: string;
  query: string; // non-empty search string or regex pattern
  caseSensitive?: boolean; // default: false
  wholeWord?: boolean; // default: false
  useRegex?: boolean; // treat query as regex; default: false
  includePattern?: string; // glob pattern to filter files (e.g. "*.ts")
}

interface FileSearchResponse {
  totalMatches: number; // total matches across all files
  truncated: boolean; // true if limits were hit
  fileCount: number; // number of files with matches
}

interface FileSearchProgressEvent {
  workspaceId: string;
  requestId: string; // correlates to the request envelope id
  fileResult: FileSearchFileResult;
  done: boolean; // false for per-file events; true for the final event
  totalMatches: number; // running count of matches so far
  truncated: boolean; // true if any result was truncated
}

interface FileSearchFileResult {
  path: string; // absolute file path
  relativePath: string; // path relative to workspace root
  matches: FileSearchMatch[]; // match details (max 50 per file)
  truncated: boolean; // true if per-file limit was hit
}

interface FileSearchMatch {
  lineNumber: number;
  lineText: string;
  submatches: FileSearchSubmatch[];
}

interface FileSearchSubmatch {
  matchText: string;
  start: number; // byte offset within lineText
  end: number; // byte offset within lineText
}

interface FileSearchReplaceRequest {
  workspaceId: string;
  query: string; // non-empty search string or regex pattern
  replacement: string; // replacement text (regex groups supported when useRegex is true)
  caseSensitive?: boolean; // default: false
  wholeWord?: boolean; // default: false
  useRegex?: boolean; // treat query as regex; default: false
  includePattern?: string; // glob pattern to filter files
}

interface FileSearchReplaceResponse {
  replacedFiles: string[]; // absolute paths of files that were modified
  totalReplacements: number; // total number of individual replacements
}
```

### Streaming Behavior

When a client sends a `file.search` request, the server:

1. Aborts any previous in-progress search for the same connection (one active search per connection).
2. Emits `file.search.progress` events with `done: false` — one per file that contains matches.
3. Emits a final `file.search.progress` event with `done: true` and an empty `fileResult` (path and matches are empty).
4. Sends the `file.search` response with aggregate counts.

Clients subscribe to progress events by filtering on channel `file.search.progress` and matching `requestId` to the original request `id`.

**Result limits:**

- Maximum 1000 total matches across all files.
- Maximum 50 matches per file.
- If either limit is hit, `truncated` is set to `true` and remaining results are skipped.

**Replace limits:**

- Files larger than 1 MB are skipped during `file.search.replace`.
- Regex patterns are limited to 500 characters (ReDoS protection) when `useRegex` is `true`.

### Error Scenarios

**`file.search` errors:**

| Error code            | Condition                                                            |
| --------------------- | -------------------------------------------------------------------- |
| `INVALID_MESSAGE`     | Missing or non-string `workspaceId` or `query`; empty `query` string |
| `WORKSPACE_NOT_FOUND` | No workspace matches the provided `workspaceId`                      |
| `HANDLER_ERROR`       | Unexpected internal error during search                              |

**`file.search.replace` errors:**

| Error code            | Condition                                                                            |
| --------------------- | ------------------------------------------------------------------------------------ |
| `INVALID_MESSAGE`     | Missing or non-string `workspaceId`, `query`, or `replacement`; empty `query` string |
| `INVALID_MESSAGE`     | Regex pattern exceeds 500 characters when `useRegex` is `true`                       |
| `INVALID_MESSAGE`     | Invalid regex pattern in `query` when `useRegex` is `true`                           |
| `WORKSPACE_NOT_FOUND` | No workspace matches the provided `workspaceId`                                      |
| `HANDLER_ERROR`       | ripgrep exited with unexpected error code; unexpected internal error during replace  |

## Terminal Channel Type Reference

### State Query

| Channel          | Request type           | Response type           | Fields                                                                                           |
| ---------------- | ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `terminal.state` | `TerminalStateRequest` | `TerminalStateResponse` | req: `terminalId`; res: `terminalId`, `data` (base64-encoded raw VT byte buffer), `cols`, `rows` |

```typescript
interface TerminalStateRequest {
  terminalId: string;
}

interface TerminalStateResponse {
  terminalId: string;
  /** Base64-encoded raw VT byte buffer. */
  data: string;
  cols: number;
  rows: number;
}
```

## Tab Channel Type Reference

All tab request payloads include `workspaceId` (except `tab.update`, `tab.delete` which use `tabId`).
The `pane` field is a dynamic string (any pane ID), not limited to a fixed set.

### Tab Listing & Restoration

| Channel       | Request type        | Response type        | Fields                                                                                                                    |
| ------------- | ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `tab.list`    | `TabListRequest`    | `TabListResponse`    | req: `pane?`, `worktreePath?`; res: `tabs` (`TabInfo[]`)                                                                  |
| `tab.restore` | `TabRestoreRequest` | `TabRestoreResponse` | req: `workspaceId`, `worktreePath?`; res: `tabs` (`PersistedTabInfo[]`) — creates new PTYs for terminal tabs, updates IDs |

### Tab Lifecycle

| Channel       | Request type        | Response type       | Fields                                                                                                                                                                                   |
| ------------- | ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tab.create`  | `TabCreateRequest`  | `TabCreateResponse` | req: `pane`, `tabType`, `title`, `terminalId?`, `filePath?`, `diffRef?`, `diffRepoPath?`, `repoPath?`, `commitSha?`, `parentSha?`, `cwd?`, `customTitle?`, `worktreePath?`; res: `tabId` |
| `tab.update`  | `TabUpdateRequest`  | —                   | req: `tabId`, `active?`, `sortOrder?`, `title?`                                                                                                                                          |
| `tab.delete`  | `TabDeleteRequest`  | —                   | req: `tabId`                                                                                                                                                                             |
| `tab.reorder` | `TabReorderRequest` | —                   | req: `tabIds` (`string[]`)                                                                                                                                                               |

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
  terminalAlive?: boolean; // present when terminalId is set
  diffRef?: 'staged' | 'unstaged' | 'commit' | null;
  repoPath?: string | null;
  commitSha?: string | null;
  parentSha?: string | null;
  cwd?: string | null;
  customTitle?: string | null;
  worktreePath?: string | null;
}
```

### PersistedTabInfo

Returned by `tab.restore`. Represents a tab persisted across server restarts.
The `terminal_id` column is persisted in `persisted_tabs`, so terminal tabs
may reference a reused live terminal when the PTY is still running, or a
freshly-created one when no live terminal matches.

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
  worktreePath?: string | null;
}
```

## Path Channel Type Reference

### Autocomplete

| Channel             | Request type              | Response type              | Fields                                                           |
| ------------------- | ------------------------- | -------------------------- | ---------------------------------------------------------------- |
| `path.autocomplete` | `PathAutocompleteRequest` | `PathAutocompleteResponse` | req: `path`; res: `directories` (`AutocompleteDirectoryEntry[]`) |

```typescript
interface PathAutocompleteRequest {
  path: string; // absolute path or ~-prefixed path
}

interface AutocompleteDirectoryEntry {
  name: string; // directory name only (not full path)
}

interface PathAutocompleteResponse {
  directories: AutocompleteDirectoryEntry[];
}
```

**Error scenarios:**

| Error code          | Condition                                            |
| ------------------- | ---------------------------------------------------- |
| `INVALID_MESSAGE`   | Empty, missing, or non-string `path`; relative path  |
| `FILE_NOT_FOUND`    | Directory does not exist, or path is not a directory |
| `PERMISSION_DENIED` | Insufficient permissions to read the directory       |
| `HANDLER_ERROR`     | Unexpected internal error                            |

**Notes:**

- Tilde (`~`) expansion is applied — both bare `~` and `~/…` forms are resolved to the user's home directory.
- Only absolute paths are accepted; relative paths result in an `INVALID_MESSAGE` error.
- Results are sorted alphabetically by name.
- A maximum of 256 entries is returned.
- Hidden directories (dot-prefixed) are included in results.

## Protocol Type Reference

### Type Narrowing

Several protocol types use union types for correctness:

| Type                    | Field     | Union                                                                                 |
| ----------------------- | --------- | ------------------------------------------------------------------------------------- |
| `ConnectionStatusEvent` | `status`  | `'connecting' \| 'connected' \| 'disconnected' \| 'reconnecting'` (was bare `string`) |
| `TabCreateRequest`      | `diffRef` | `'staged' \| 'unstaged' \| 'commit' \| null` (was bare `string`)                      |
| `TabInfo`               | —         | Includes `tabType`, `diffRef`, `repoPath`, `cwd`, `customTitle`, etc.                 |

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

## Request Validation

All incoming request payloads are validated at the boundary using [Zod](https://zod.dev) schemas defined in `packages/shared/src/protocol/schemas.ts`. Auth, Git, Tab, and File write channels each have a corresponding exported Zod schema that the handler runs the raw `payload` through before any business logic executes. Other channels validate payloads inline.

### `validatePayload<T>(schema, data)`

```typescript
import { z } from 'zod';

function validatePayload<T>(schema: z.ZodType<T>, data: unknown): T;
```

Accepts any Zod schema and an `unknown` value (typically `envelope.payload`). On success it returns the parsed, typed result. On failure it throws an `Error` with a multi-line message listing every validation issue and its field path:

```
Payload validation failed:
  files.0: String must contain at least 1 character(s)
  repoPath: Required
```

The thrown error message is suitable for returning directly to clients as an `INVALID_MESSAGE` error — the handler layer catches it, wraps it into a standard `ErrorResponse`, and sends it back on the same `id`.

### Available Schemas

All schemas are exported from `@ymir/shared` (re-exported through `schemas.ts` → `index.ts`).

#### Auth

| Schema              | Validates              |
| ------------------- | ---------------------- |
| `AuthRequestSchema` | `{ password: string }` |

#### Git

Git schemas extend a shared base (`workspaceId: string`, `repoPath: string`) and add channel-specific fields.

| Schema                               | Additional fields                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `GitStageRequestSchema`              | `files: string[]` (≥1 item, each non-empty)                                             |
| `GitUnstageRequestSchema`            | Same shape as `GitStageRequestSchema`                                                   |
| `GitDiscardRequestSchema`            | Same shape as `GitStageRequestSchema`                                                   |
| `GitStageAllRequestSchema`           | Base only                                                                               |
| `GitUnstageAllRequestSchema`         | Base only                                                                               |
| `GitDiscardAllRequestSchema`         | Base only                                                                               |
| `GitCommitRequestSchema`             | `message: string` (trimmed, non-empty)                                                  |
| `GitCommitAmendRequestSchema`        | `message?: string`, `noEdit?: boolean`                                                  |
| `GitCommitAllRequestSchema`          | `message: string` (trimmed, non-empty), `includeUntracked?: boolean`, `amend?: boolean` |
| `GitResetSoftRequestSchema`          | `ref?: string`                                                                          |
| `GitCheckoutRequestSchema`           | `branch: string`, `createNew?: boolean`                                                 |
| `GitBranchRenameRequestSchema`       | `oldName: string`, `newName: string`                                                    |
| `GitBranchDeleteRequestSchema`       | `name: string`, `force?: boolean`                                                       |
| `GitBranchDeleteRemoteRequestSchema` | `remote: string`, `branch: string`                                                      |
| `GitBranchPublishRequestSchema`      | `remote?: string`                                                                       |
| `GitBranchesRequestSchema`           | Base only                                                                               |
| `GitBranchesRemoteRequestSchema`     | Base only                                                                               |
| `GitBranchCreateFromRequestSchema`   | `name: string`, `startPoint: string`                                                    |

#### Tabs

| Schema                    | Validates                                                                                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TabListRequestSchema`    | `workspaceId`, `pane?`, `worktreePath?` (nullable)                                                                                                                                                                                        |
| `TabCreateRequestSchema`  | `workspaceId`, `pane`, `tabType` (enum: `terminal \| editor \| diff \| git-tree`), `title`, plus optional `terminalId`, `filePath`, `diffRef`, `diffRepoPath`, `repoPath`, `commitSha`, `parentSha`, `cwd`, `customTitle`, `worktreePath` |
| `TabUpdateRequestSchema`  | `tabId`, optional `active`, `sortOrder`, `title`                                                                                                                                                                                          |
| `TabDeleteRequestSchema`  | `tabId`                                                                                                                                                                                                                                   |
| `TabReorderRequestSchema` | `tabIds: string[]` (≥1)                                                                                                                                                                                                                   |
| `TabRestoreRequestSchema` | `workspaceId`, optional `worktreePath`                                                                                                                                                                                                    |

#### Files

| Schema                   | Validates                                      |
| ------------------------ | ---------------------------------------------- |
| `FileWriteRequestSchema` | `workspaceId`, `path`, `content` (all strings) |

### Validation Error Format

When `validatePayload` throws, the error has a predictable shape:

```
Payload validation failed:
  <field-path>: <zod-issue-message>
  <field-path>: <zod-issue-message>
```

- `<field-path>` is a dot-joined path (`files.0`, `repoPath`, etc.), or `(root)` for top-level issues.
- `<zod-issue-message>` is the default Zod issue message (e.g. `Required`, `Expected string, received number`).

Handlers should catch this error and map it to an `INVALID_MESSAGE` error response.

### Handler Integration Example

```typescript
import { validatePayload, GitCommitRequestSchema } from '@ymir/shared';

function handleGitCommit(envelope: RequestEnvelope, send: SendFn) {
  let payload: GitCommitRequest;
  try {
    payload = validatePayload(GitCommitRequestSchema, envelope.payload);
  } catch (err) {
    send({
      type: 'response',
      id: envelope.id,
      payload: null,
      error: { code: 'INVALID_MESSAGE', message: (err as Error).message },
    });
    return;
  }

  // payload is now typed as GitCommitRequest — safe to use
  const hash = gitCommit(payload.workspaceId, payload.repoPath, payload.message);
  send({ type: 'response', id: envelope.id, payload: { commitHash: hash } });
}
```

## Git Payload Module Layout

Git request/response types are split across focused modules under `packages/shared/src/protocol/payloads/`:

| Module              | Contents                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `git-operations.ts` | Status, log, stage/unstage/discard, commit, push, fetch, pull/sync, merge/rebase, worktree, remotes, status change event |
| `git-branches.ts`   | Branch listing, checkout, rename, delete, publish, create-from                                                           |
| `git-diff.ts`       | Diff data, commit details, commit diff                                                                                   |
| `git-stash.ts`      | Stash push/list/apply/pop/drop/clear                                                                                     |

All four modules are re-exported through the **barrel file** `git.ts`:

```typescript
// payloads/git.ts
export * from './git-operations';
export * from './git-branches';
export * from './git-diff';
export * from './git-stash';
```

Consumers can import from either the barrel or individual modules:

```typescript
// Barrel import (most common)
import { GitStageRequest, GitBranchRenameRequest } from './git';

// Direct module import (tree-shake friendly)
import { GitStageRequest } from './git-operations';
import { GitBranchRenameRequest } from './git-branches';
```
