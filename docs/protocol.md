# WebSocket Protocol

All communication uses a JSON envelope format over a single WebSocket connection.

## Envelope Structure

```typescript
interface MessageEnvelope<T = unknown> {
  v: 1; // protocol version
  type: 'request' | 'response' | 'event';
  id?: string; // Required for requests/responses; absent for events
  channel?: string; // Required for requests; absent for most responses/events
  token?: string; // Auth token; attached by the client transport layer
  payload: T;
  error?: ErrorResponse; // code is typed as ErrorCode (union), not plain string
}
```

## Message Flow

1. **Client sends a request** with `type: "request"` and a unique `id`.
2. **Server responds** with `type: "response"`, same `id`, and either `payload` or `error`.
3. **Server pushes events** with `type: "event"` (no `id` correlation needed).

## Channel Reference

| Channel              | Direction | Description                                                                                            |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `auth`               | request   | Authenticate with password                                                                             |
| `terminal.create`    | request   | Spawn a new PTY                                                                                        |
| `terminal.input`     | request   | Send keystrokes (base64)                                                                               |
| `terminal.resize`    | request   | Resize terminal dimensions                                                                             |
| `terminal.close`     | request   | Kill a PTY                                                                                             |
| `terminal.output`    | event     | PTY output (base64)                                                                                    |
| `terminal.exit`      | event     | PTY process exited (with exit code)                                                                    |
| `workspace.list`     | request   | List saved workspaces                                                                                  |
| `workspace.create`   | request   | Create a workspace                                                                                     |
| `workspace.update`   | request   | Update workspace settings                                                                              |
| `workspace.delete`   | request   | Delete a workspace                                                                                     |
| `workspace.reorder`  | request   | Reorder workspaces by ID array                                                                         |
| `file.tree`          | request   | Get directory listing                                                                                  |
| `file.read`          | request   | Read file contents                                                                                     |
| `file.write`         | request   | Write file contents                                                                                    |
| `file.create`        | request   | Create file or directory                                                                               |
| `file.delete`        | request   | Delete file or directory                                                                               |
| `file.rename`        | request   | Rename/move a file                                                                                     |
| `file.copy`          | request   | Copy a file or directory to a target directory (auto-renames on conflict)                              |
| `file.move`          | request   | Move a file or directory to a target directory (auto-renames on conflict)                              |
| `file.change`        | event     | Filesystem change notification                                                                         |
| `git.status`         | request   | Get git status for a path; optional `repoPath`, returns `hasRemote`, `ahead`, `behind`                 |
| `git.log`            | request   | Paginated git commit history (`skip`/`limit`, returns `GitLogItem[]` + `hasMore`); optional `repoPath` |
| `git.repoDiscovery`  | request   | Discover all git repositories in a workspace directory                                                 |
| `git.stage`          | request   | Stage files in a git repository                                                                        |
| `git.unstage`        | request   | Unstage files in a git repository                                                                      |
| `git.discard`        | request   | Discard unstaged changes to files                                                                      |
| `git.commit`         | request   | Commit staged changes                                                                                  |
| `git.branches`       | request   | List branches in a git repository                                                                      |
| `git.checkout`       | request   | Switch or create a branch                                                                              |
| `git.push`           | request   | Push branch to origin                                                                                  |
| `git.fetch`          | request   | Fetch from remote                                                                                      |
| `git.worktreeList`   | request   | List git worktrees for a workspace                                                                     |
| `git.worktreeCreate` | request   | Create a new git worktree                                                                              |
| `git.worktreeRemove` | request   | Remove a git worktree                                                                                  |
| `config.get`         | request   | Get a config value from server_config table                                                            |
| `config.set`         | request   | Set a config value in server_config table                                                              |
| `tab.list`           | request   | List tabs for a workspace (with terminal liveness)                                                     |
| `tab.create`         | request   | Create a tab (terminal or editor)                                                                      |
| `tab.update`         | request   | Update tab properties (active, title, sort order)                                                      |
| `tab.delete`         | request   | Delete a tab                                                                                           |
| `tab.reorder`        | request   | Reorder tabs by ID array                                                                               |
| `connection.status`  | event     | Connection status change                                                                               |

Terminal data is base64-encoded to safely transport binary PTY output over JSON.

## Protocol Type Reference

### Type Narrowing

Several protocol types use union types for correctness:

| Type                    | Field     | Union                                                                                                 |
| ----------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `ConnectionStatusEvent` | `status`  | `'connecting' \| 'connected' \| 'disconnected' \| 'reconnecting'` (was bare `string`)                 |
| `TabCreateRequest`      | `diffRef` | `'staged' \| 'unstaged' \| 'commit' \| null` (was bare `string`)                                      |
| `TabInfo`               | —         | Renamed from `ServerTabInfo` throughout the protocol; includes `tabType`, `diffRef`, `repoPath`, etc. |

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
