# Architecture

## Overview

Ymir is a web-based terminal IDE with real-time file management, git integration, and multi-terminal support. It runs as a single self-contained process — a Bun server hosts both the API and the compiled client assets.

## Architecture

Ymir is a 4-package monorepo managed by Bun workspaces:

```
ymir-terminal/
├── apps/
│   ├── server/        @ymir/server   — Bun HTTP + WebSocket server, PTY, SQLite
│   ├── client/        @ymir/client   — React SPA (Vite + TanStack Router/Query)
│   └── cli/           @ymir/cli      — CLI wrapper (launch, web, update commands)
├── packages/
│   ├── shared/        @ymir/shared   — Protocol types, constants, utilities
│   └── npm/                           npm distribution packages
│       ├── ymir/                     Main package (bin shim + postinstall downloader)
│       ├── ymir-linux-x64/           Linux x64 platform-specific binary
│       └── ymir-windows-x64/         Windows x64 platform-specific binary
├── src-tauri/         @ymir/tauri    — Tauri 2.x desktop app
│   ├── src/
│   │   ├── main.rs                  Desktop entry point
│   │   ├── lib.rs                    App setup, sidecar orchestration, auto-auth
│   │   ├── sidecar.rs               Sidecar lifecycle (spawn, health check, shutdown)
│   │   └── auth.rs                   Password generation and persistence
│   ├── capabilities/                Permission definitions
│   ├── Cargo.toml                   Rust dependencies
│   └── tauri.conf.json              Window config, CSP, sidecar registration
├── docs/                              — Documentation and plans
├── dist/                              — Build output (CLI, server, Tauri binaries)
└── scripts/
    ├── dev.ts                         Concurrent dev runner (server + client)
    ├── build-server.ts                Compile server to standalone binary
    ├── build-cli.ts                   Compile CLI to standalone binary
    ├── build-client.sh                Build client SPA
    ├── build-client-dist.ts           Build client SPA + package as archive
    ├── build-all.ts                   Build all artifacts (client, server, CLI, Tauri)
    ├── extract-tauri-binary.ts        Extract Tauri binary from bundle to dist/
    ├── install.ts                     From-source installer (clones, builds, installs)
    ├── publish-npm.ts                 Publish platform + main npm packages
    ├── sync-version.ts                Sync version across all package.json, Cargo.toml, constants
    └── lib/build-utils.ts             Shared build helpers (target maps, run, ensureDir)
```

**Data flow:**

```
Browser (React SPA)
  ↕ WebSocket (JSON envelopes, base64 terminal data)
Bun Server
  ↕ PTY (Bun.Terminal)
  ↕ Filesystem (read/write/watch)
  ↕ SQLite (persistent: workspaces, session: tabs)
```

**Git status push flow:**

```
Filesystem changes (.git/HEAD, .git/refs/, working tree)
  → GitStatusWatcher (fs.watch, debounced 500 ms)
  → GitStatusCache (TTL 5 s, request coalescing)
  → WebSocket broadcast (git.statusChange event)
  → Client useGitStatusSubscription hook
```

## Tech Stack

| Layer           | Technology                                                                              |
| --------------- | --------------------------------------------------------------------------------------- |
| Runtime         | [Bun](https://bun.sh) — HTTP server, WebSocket, SQLite, test runner                     |
| Language        | TypeScript (strict mode)                                                                |
| Backend         | `Bun.serve`, `Bun.Terminal` (PTY), `bun:sqlite`                                         |
| Frontend        | React 19, TanStack Router, TanStack Query, Vite                                         |
| Terminal        | `ghostty-web` + `ghostty-web FitAddon`                                                  |
| Code Editor     | CodeMirror 6 (`@codemirror/lang-*`)                                                     |
| Auth            | Argon2id password hashing, JWT (HS256 via `jose`), 7-day token expiry                   |
| DnD             | `@dnd-kit/react` + `@dnd-kit/helpers` — tab drag-and-drop, cross-pane transfer          |
| Context Menu    | `@radix-ui/react-context-menu`                                                          |
| Virtualization  | `@tanstack/react-virtual@^3.13` — virtualized list rendering for large commit histories |
| Infinite scroll | `react-intersection-observer@^10.0` — infinite scroll via Intersection Observer API     |
| Desktop Shell   | Tauri 2.x (Rust) — wraps webview in native window                                       |
| Sidecar         | Compiled Bun binary — server bundled as platform-native executable                      |
| Styling         | Inline CSS, `react-resizable-panels` for IDE layout                                     |
| Testing         | `bun:test`, Testing Library (React), happy-dom                                          |

## Project Structure

### `packages/shared` — `@ymir/shared`

| File                 | Purpose                                                                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocol/types.ts`  | Envelope types (`MessageEnvelope`), `ErrorCodes` constant, `ErrorCode` union type                                                                                                                                                                                      |
| `protocol/payloads/` | Payload types split into 8 domain modules: `auth`, `config`, `file`, `git`, `session`, `tab`, `terminal`, `workspace`. `index.ts` re-exports all types and defines union types (`RequestPayload`, `EventPayload`) and constant arrays (`REQUEST_TYPES`, `EVENT_TYPES`) |
| `constants.ts`       | `VERSION`, platform booleans (`IS_WINDOWS`, `IS_MACOS`, `IS_LINUX`), binary names (`CLI_BINARY_NAME`, `APP_BINARY_NAME`, `SERVER_BINARY_NAME`), `GITHUB_REPO`, `YMIR_HOME_DIR_NAME`, default ports, paths, timeouts, reconnection settings                             |
| `utils.ts`           | `generateId`, `toBase64`, `fromBase64`, `expandTilde`, `getConfigDir`, `getDbPath`, `getYmirHomeDir`, `getClientDistDir`, `getServerBinaryPath`, `getAppBinaryPath`                                                                                                    |

### `apps/server` — `@ymir/server`

| Directory             | Purpose                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `auth/`               | Password hashing (Argon2id), JWT sign/verify                                              |
| `db/`                 | Persistent DB (workspaces), session DB (tabs)                                             |
| `lib/`                | Shared handler validation (`handler-validation.ts`)                                       |
| `pty/`                | PTY manager — spawn, resize, write, kill                                                  |
| `files/`              | File scanner, CRUD operations, filesystem watcher                                         |
| `git/`                | Git status, log, repo discovery, staging, branching, and remote operations                |
| `ws/`                 | WebSocket server, message router, connection state                                        |
| `ws/handlers/`        | Channel handlers (auth, terminal, files, git, tabs, ws)                                   |
| `ws/handlers/tabs.ts` | Tab CRUD operations — `tab.list`, `tab.create`, `tab.update`, `tab.delete`, `tab.reorder` |
| `ws/handlers/git/`    | Git handlers split into 8 domain modules (see below)                                      |
| `ws/handlers/files/`  | File handlers split into `tree`, `crud`, `language`, `shared`                             |
| `test-helpers/`       | Shared server test utilities (`mock-utils.ts`)                                            |

**Git module detail:**

| File                    | Responsibility                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git/status.ts`         | Reads `git status --porcelain=v1` output (with `GIT_OPTIONAL_LOCKS=0`), returns branch name + staged/unstaged file changes; exports `isGitRepo`, `spawnGit`, `getCurrentBranch`, `getGitStatus`, `hasRemote`, `getAheadBehind`, `getGitStatusEnhanced`                                                                                                                |
| `git/log.ts`            | Async `getGitLog(dirPath, skip, limit)` — executes `git log --pretty=format` with NUL-delimited fields (`%H%x00%P%x00%an%x00%at%x00%s`), returns `GitLogItem[]`. Uses `execFile` (promisified) to avoid blocking the event loop                                                                                                                                       |
| `git/discovery.ts`      | BFS (breadth-first) repo discovery within workspace directories with progressive async per-depth callback (`onDepthComplete`). Processes directories level-by-level up to `maxDepth` (default 5) in batches of 10 (`BATCH_SIZE`). Skips common non-project directories (`node_modules`, `dist`, `.cache`, etc.). Returns repos sorted root-first then alphabetically. |
| `git/operations.ts`     | Stage, unstage, discard, and commit operations; exports `stageFiles`, `stageAll`, `unstageFiles`, `unstageAll`, `discardChanges`, `discardAll`, `commitChanges`                                                                                                                                                                                                       |
| `git/branches.ts`       | Branch listing, creation, and checkout                                                                                                                                                                                                                                                                                                                                |
| `git/remote.ts`         | Push and fetch operations; exports `pushBranch`, `fetchRemote`, `listRemotes`, `addRemote`, `removeRemote`                                                                                                                                                                                                                                                            |
| `git/merge.ts`          | Merge and rebase operations; exports `mergeBranch`, `rebaseBranch`, `rebaseAbort`, `isRebaseInProgress`                                                                                                                                                                                                                                                               |
| `git/pull.ts`           | Pull and sync operations; exports `pullRemote` (with optional `--rebase`), `syncRemote` (fetch + pull --rebase + push)                                                                                                                                                                                                                                                |
| `git/commit-details.ts` | Commit detail retrieval; exports `getCommitDetails` (message body + changed files with status/additions/deletions via `diff-tree`)                                                                                                                                                                                                                                    |
| `git/stash.ts`          | Stash operations; exports `stashPush`, `stashList`, `stashApply`, `stashPop`, `stashDrop`, `stashClear`                                                                                                                                                                                                                                                               |
| `git/diff.ts`           | Diff generation; exports `getDiffData`, `getCommitFileDiff`                                                                                                                                                                                                                                                                                                           |
| `git/worktrees.ts`      | Git worktree management — list, create, remove, and merge linked worktrees; exports `parseWorktreeList`, `listWorktrees`, `createWorktree`, `removeWorktree`, `mergeWorktree`                                                                                                                                                                                         |
| `git/status-cache.ts`   | In-memory `GitStatusCache` — per-repo status cache with 5 s TTL (`CACHE_TTL_MS`), freshness checks (`isFresh`), and request coalescing (`getOrCreate`) to deduplicate concurrent in-flight git status reads                                                                                                                                                           |
| `git/status-watcher.ts` | `GitStatusWatcher` — watches `.git/HEAD`, `.git/refs/`, and the working tree via `fs.watch`; debounces events (500 ms, `DEBOUNCE_MS`); triggers cache-coalesced refreshes; broadcasts status changes via handler; safety-polls every 45 s (`SAFETY_POLL_MS`) in staggered batches of 3; caps at 200 repos                                                             |

**Git repo discovery data flow (BFS progressive):**

`discoverRepos()` has two independent consumers that pass different `onDepthComplete` callbacks:

**Consumer 1 — Client request (`git.repoDiscovery` handler):**

```
Client sends git.repoDiscovery request
  → Server handler resolves workspace cwd
  → discoverRepos() BFS from workspace root:
      For each depth (0..maxDepth):
        Batch directories (10 concurrent) → check isGitRepo()
        Collect repos → onDepthComplete emits git.repoDiscovery.progress event to client
          → Client useGitRepos subscribes to progress events
          → Progressive repos appended to state
          → Status + branches fetched per new repo
        Collect subdirs for next depth level
  → Final response with complete sorted repo list sent to client
  → Client reconciles: sets final repo list, fetches status/branches for any repos not yet loaded
```

**Consumer 2 — Workspace create/update (`startGitWatchersForWorkspace`):**

```
Workspace created or cwd updated
  → startGitWatchersForWorkspace() calls discoverRepos()
      For each depth (0..maxDepth):
        Batch directories (10 concurrent) → check isGitRepo()
        Collect repos → onDepthComplete registers watchers progressively:
          → gitStatusWatcher.watchRepo() per repo
          → watchedGitDirs map updated
        Collect subdirs for next depth level
```

These are separate callers with separate triggers — the client request provides UI progress, while the workspace lifecycle hook starts filesystem watchers. They never run concurrently from a single call.

**Server lifecycle (GitStatusCache + GitStatusWatcher):**

In `server.ts`, a `GitStatusCache` and `GitStatusWatcher` are created before handler registration (step 5a). The watcher's `statusChangeHandler` broadcasts `git.statusChange` events to all authenticated WebSocket connections, using a `watchedGitDirs` map to resolve `workspaceId` and `repoPath` from the absolute `.git` directory. Both are passed via dependency injection to `registerGitHandlers` and `registerWorkspaceHandlers`. On graceful shutdown, `gitStatusWatcher.unwatchAll()` closes all `fs.watch` watchers and stops the safety-poll timer.

**Workspace handler progressive git watcher startup:** The `registerWorkspaceHandlers` function creates a `startGitWatchersForWorkspace` helper that calls `discoverRepos` with an `onDepthComplete` callback. As each BFS depth completes, the callback registers discovered repos with `gitStatusWatcher.watchRepo()` and updates the `watchedGitDirs` map — so git status watching begins progressively rather than waiting for full discovery. A `cancelledDiscovery` map tracks in-flight discoveries so watchers are not started for deleted or cwd-changed workspaces. The `stopGitWatchersForWorkspace` helper cancels in-flight discovery and removes all watcher entries for a workspace.

**Git handler structure:** The git handlers are split into focused modules under `ws/handlers/git/`:

| Module          | Registration function        | Responsibility                                                                                                                                          |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status.ts`     | `registerStatusHandlers`     | `git.status` (cache-aware: serves fresh/stale cache hits, background refreshes via watcher), `git.repoDiscovery`                                        |
| `operations.ts` | `registerOperationsHandlers` | `git.stage`, `git.unstage`, `git.discard`, `git.commit`                                                                                                 |
| `branches.ts`   | `registerBranchesHandlers`   | `git.branches`, `git.checkout`                                                                                                                          |
| `remote.ts`     | `registerRemoteHandlers`     | `git.push`, `git.fetch`                                                                                                                                 |
| `diff.ts`       | `registerDiffHandlers`       | `git.diffData`, `git.commitDetails`, `git.commitDiff`                                                                                                   |
| `worktrees.ts`  | `registerWorktreeHandlers`   | `git.worktreeList`, `git.worktreeCreate`, `git.worktreeRemove`, merge                                                                                   |
| `shared.ts`     | —                            | Re-exports for sub-modules (`safePath`, `resolveWorkspace`, types), `createInvalidator` (cache + watcher invalidation helper used by mutation handlers) |
| `index.ts`      | `registerGitHandlers`        | Resolves deps (native + mock), creates `doInvalidateAndRefresh` via `createInvalidator`, delegates to domain registrations                              |

**Handler registration pattern:**

```typescript
// ws/handlers/terminal.ts
export function registerTerminalHandlers(router: MessageRouter, deps: { ... }): void {
  router.handle('terminal.create', async (conn, envelope) => { ... });
  router.handle('terminal.input',  async (conn, envelope) => { ... });
}
```

Handlers are registered in `server.ts` and receive the parsed envelope plus the authenticated `ClientConnection`. Shared validation helpers (`validateTerminalOwnership`, `resolveWorkspaceOrError`, `resolveSafePathOrError`) live in `lib/handler-validation.ts` and are used by multiple handler modules.

**File handler structure:** The file handlers are split into focused modules under `ws/handlers/files/`:

| Module        | Responsibility                                           |
| ------------- | -------------------------------------------------------- |
| `tree.ts`     | File tree reading, directory scanning                    |
| `crud.ts`     | File create, write, delete, rename, copy, move           |
| `language.ts` | Language detection from file extensions/filenames        |
| `shared.ts`   | Shared utilities (`safePath`, `resolveWorkspace`, types) |
| `index.ts`    | Re-exports `registerFileHandlers`                        |

### `apps/client` — `@ymir/client`

| Directory       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/`   | React UI components (see below)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `hooks/`        | Custom React hooks for state and data (see [Hook Architecture](#hook-architecture) below). Includes top-level hooks and the `git/` subdirectory which decomposes git functionality into domain hooks (`useGitDiscovery`, `useGitStatus`, `useGitOperations`, `useGitBranches`, `useGitStash`) composed by a coordinator `useGitRepos` hook. Top-level `useGitRepos.ts` and `useGitStatusSubscription.ts` are barrel re-exports from `git/`. |
|                 | `lib/`                                                                                                                                                                                                                                                                                                                                                                                                                                      | WebSocket client, request helper, git-utils, git-change-tree, git-graph, OSC 7 CWD parser, pane-tree (binary tree model for split layouts), theme constants, context styles |
| `routes/`       | TanStack Router route definitions                                                                                                                                                                                                                                                                                                                                                                                                           |
| `test-helpers/` | Shared client test utilities (`mock-setup.ts`)                                                                                                                                                                                                                                                                                                                                                                                              |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.2

### Install

```bash
bun install
```

### Development

Starts both the Vite dev server (client) and the Bun server with `--watch`:

```bash
bun run dev
```

- Client: `http://localhost:5173`
- Server: `ws://localhost:3000`

### Production

```bash
bun run build              # builds client to apps/client/dist/
YMIR_PASSWORD=secret bun run start
```

The production server serves the compiled client assets and the WebSocket API on the same port.

### CLI Options

```
bun apps/server/src/index.ts [options]

  --password=<pass>   Password for authentication (required, or set YMIR_PASSWORD)
  --port=<number>     Server port (default: 3000)
  --host=<addr>       Bind address (default: 127.0.0.1)
  --staticDir=<path>  Path to built client static files (default: auto-detected)
```

The password can also be provided via the `YMIR_PASSWORD` environment variable, which is preferred in production since it avoids exposing the password in process listings.

The `--staticDir` option overrides the default static file directory. In development, this defaults to `apps/client/dist/` relative to the project root. In production (sidecar binary), the Tauri app passes the bundled resource directory.

## Hook Architecture

The client extracts complex stateful logic into dedicated hooks, each with a single responsibility. Top-level hooks live in `hooks/`; git-specific hooks are organized under `hooks/git/` (see [Git hooks](#git-hooks-hooksgit) below).

### Core hooks

| Hook                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `useAuth`               | Authentication state context (`AuthProvider` / `useAuth`). Manages JWT token lifecycle (localStorage persistence, WebSocket token injection), login/logout, auto-login in Tauri via `getTauriConfig`, and `AUTH_REQUIRED`/`AUTH_FAILED` recovery.                                                                                                                                                                                                                       |
| `useConnectionStatus`   | Tracks WebSocket connection state (`connecting` \| `connected` \| `disconnected` \| `reconnecting`) via `wsClient.onStatusChange`. Exposes `isConnected` and `isReconnecting` boolean convenience flags.                                                                                                                                                                                                                                                                |
| `useWorkspaces`         | TanStack Query hooks for workspace CRUD: `useWorkspaces` (list query), `useCreateWorkspace`, `useUpdateWorkspace`, `useDeleteWorkspace`, `useReorderWorkspaces` (optimistic update with rollback). Also provides worktree hooks: `useWorktreeList`, `useCreateWorktree`, `useRemoveWorktree`, `useMergeWorktree`, `useWorktreeCopyFiles`. Queries are gated on `isConnected` from `useConnectionStatus`.                                                                |
| `useWorkspaceSelection` | Manages workspace and worktree selection state. Derives `activeWorkspaceId` from `selectedWorkspaceId` (falls back to first workspace), fetches worktrees for all workspaces eagerly via `useQueries`, and exposes handlers for workspace CRUD, worktree CRUD, color/accents, and dialog state.                                                                                                                                                                         |
| `useTheme`              | Manages accent color theming. Provides `accentColor`, `setAccentColor`, and computed `themeVars` (CSS custom properties `--accent`, `--accent-hover`, `--accent-dim`). Applies colors to the document root via CSS custom properties. Includes `dullColor()` utility for generating desaturated accent variants.                                                                                                                                                        |
| `useTauri`              | Detects Tauri desktop environment (`window.__TAURI_INTERNALS__`). Provides `isTauri` boolean and `getTauriConfig()` for retrieving sidecar port + password via Tauri IPC (`invoke('get_tauri_config')`). Uses cached dynamic imports to avoid errors in browser.                                                                                                                                                                                                        |
| `useDialog`             | Exports `useConfirm` and `usePrompt` hooks backed by `DialogContext`. `useConfirm` returns a `(opts) => Promise<boolean>`; `usePrompt` returns a `(opts) => Promise<string                                                                                                                                                                                                                                                                                              | null>`. Both throw if used outside `<DialogProvider>`. |
| `useTerminal`           | Low-level terminal I/O hook for a single terminal. Subscribes to `terminal.output` WebSocket events, provides `sendData` (base64-encoded input), `resizeTerminal`, `closeTerminal`, `createTerminal`, and `onOutput` handler registration.                                                                                                                                                                                                                              |
| `useTerminalRegistry`   | Tracks all live terminals across all panes (content, bottom, and dynamic split panes). Maintains a `terminalRegistry` array of `{ terminalId, tabId, owningPane, workspaceId }` entries, a `terminalRefsMap` for focus management, a stable `callbackCacheRef` for `onTitleChange`/`onCwdChange` per tab, and computed `terminalEntries` for `TerminalManager`. Auto-focuses the active terminal only in panes whose active tab actually changed.                       |
| `useTerminalPane`       | Per-pane tab management. Wraps `useTabs` with server sync (mirrors create/close/reorder/activate to WebSocket requests), dirty-file close confirmation, and an imperative interface for cross-pane tab transfer (`transferTabOut`/`receiveTab`). Accepts a `scopeKey` option (e.g. `"workspaceId"` or `"workspaceId:/path/to/worktree"`) as the primary key for tab scope isolation. Also provides `loadRestoredTabs` for restoring persisted tabs on workspace switch. |
| `useTerminalPanel`      | Defines the `TerminalPanelHandle` interface and wires it via `useImperativeHandle`. The handle exposes `transferTabOut`, `receiveTab`, `loadRestoredTabs`, `reorderTabs`, `getTabs`, `getActiveTabId`, `updateTabTitle`, and `updateTabCwd` — shared by ContentPane and BottomPanel.                                                                                                                                                                                    |
| `usePaneBounds`         | Tracks container bounds for dynamic pane containers using `ResizeObserver`. Maintains a `registerContainer` callback ref for each pane ID and a `getPaneBounds` synchronous accessor. Computes `{ top, left, width, height }` relative to a wrapper div for overlay positioning. Skips observation while pane visibility is loading to avoid stale refs.                                                                                                                |
| `usePaneCallbacks`      | Pane management callbacks: `handleSplitRight`, `handleSplitDown`, `handleClosePane`, `handleMoveToPane`. Uses `requestAnimationFrame` to defer cross-pane tab transfer after layout state updates. Cleans up terminal connections and registry entries when panes close.                                                                                                                                                                                                |
| `useSplitLayout`        | Manages the pane layout binary tree (`LayoutNode`) with debounced (300 ms) persistence to `config.set` via key `pane_layout_{workspaceId}`. Provides `splitPane`, `removePane`, `loadLayout`, and focused-pane tracking. Uses immutable tree mutations from `pane-tree.ts`.                                                                                                                                                                                             |
| `useTabDragDrop`        | `@dnd-kit` drag-and-drop event handlers for tab reorder and cross-pane transfer. `handleDragOver` handles same-pane reorder and suppresses cross-pane DOM mutations; `handleDragEnd` handles workspace reorder commits and cross-pane tab transfers (source → target handle). Auto-expands the bottom panel when a tab is dragged there.                                                                                                                                |
| `useTabRestore`         | Restores persisted tabs when the active scope (workspace/worktree) changes. Calls `tab.restore` for each scope key, groups tabs by pane, and delegates to `TerminalPanelHandle.loadRestoredTabs`. Each scope is restored at most once.                                                                                                                                                                                                                                  |
| `useFileChange`         | Subscribes to `file.change` WebSocket events for a given workspace. Calls the provided callback with each `FileChangeEvent` payload.                                                                                                                                                                                                                                                                                                                                    |
| `usePaginatedGitLog`    | Reusable pagination + infinite scroll for git commit history. Uses `useReducer` with a generation counter to discard stale responses after workspace/repo changes. Provides a `sentinelRef` (via `react-intersection-observer`) that auto-fetches the next page when scrolled into view. Page size defaults to 50.                                                                                                                                                      |

### Git hooks (`hooks/git/`)

The monolithic `useGitRepos` hook was decomposed into 5 domain hooks under `hooks/git/`, composed by a coordinator hook in `hooks/git/index.ts`:

| Hook                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useGitDiscovery`          | Repo discovery and initialization. Sends `git.repoDiscovery` request, subscribes to `git.repoDiscovery.progress` WebSocket events for progressive BFS repo loading (repos appear as each depth completes), and reconciles with the final response. Fetches status and branches for each discovered repo in parallel. Subscribes to push-based `git.statusChange` events via `useGitStatusSubscription` for real-time status updates. Uses a generation counter to discard stale responses. Exposes `repos`, `repoStatuses`, `repoBranches`, `refresh`, and `refreshRepo`. |
| `useGitStatus`             | Staging and discarding operations: `stageFiles`, `unstageFiles`, `discardChanges`, `stageAll`, `unstageAll`, `discardAll`. Each sends the corresponding `git.*` request via `sendRequest`.                                                                                                                                                                                                                                                                                                                                                                                |
| `useGitOperations`         | Commit, push, pull, fetch, merge, rebase, and reset operations. Tracks per-repo loading state for push/fetch (`pushLoading`, `fetchLoading` maps). Provides `commitAmend`, `commitAll`, `resetSoft`, `pull`, `sync`, `merge`, `rebase`, `rebaseAbort`, `isRebaseInProgress`.                                                                                                                                                                                                                                                                                              |
| `useGitBranches`           | Branch and remote management: `checkout`, `branchRename`, `branchDelete`, `branchDeleteRemote`, `branchPublish`, `listRemoteBranches`, `createBranchFrom`, `remoteList`, `remoteAdd`, `remoteRemove`. Checkout and `createBranchFrom` trigger a full `refresh()` after completion.                                                                                                                                                                                                                                                                                        |
| `useGitStash`              | Git stash operations: `stashPush`, `stashList`, `stashApply`, `stashPop`, `stashDrop`, `stashClear`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `useGitStatusSubscription` | Subscribes to push-based `git.statusChange` WebSocket events for a given workspace. Uses `wsClient.onMessage` with a stable callback ref to update repo status in real-time without polling. Called by `useGitDiscovery` and `RightSidebar` to keep status state in sync with server-side filesystem watchers.                                                                                                                                                                                                                                                            |
| `useGitRepos`              | Coordinator hook (`hooks/git/index.ts`). Composes the 5 domain hooks above into a single `UseGitReposReturn` interface, maintaining the same API surface as the original monolithic hook. Top-level `hooks/useGitRepos.ts` and `hooks/useGitStatusSubscription.ts` are barrel re-exports from `hooks/git/`.                                                                                                                                                                                                                                                               |

## Testing

All tests use `bun:test`. The project follows TDD — tests live alongside source files.

```bash
bun test                  # run all tests across the monorepo
bun test --watch          # watch mode
```

Tests exist in every package:

- `packages/shared/src/**/*.test.ts` — protocol types, utilities
- `apps/server/src/**/*.test.ts` — auth, DB, routing, handlers, PTY, files, git (incl. `status-cache.test.ts`, `status-watcher.test.ts`)
- `apps/client/src/**/*.test.{ts,tsx}` — components, hooks, lib (incl. `useGitStatusSubscription.test.tsx`)
- `apps/cli/src/**/*.test.ts` — CLI commands, argument parsing

## Configuration

Ymir uses two platform-aware directory roots (resolved by `@ymir/shared`):

| Directory     | Unix             | Windows               | Purpose                                                  |
| ------------- | ---------------- | --------------------- | -------------------------------------------------------- |
| Config (data) | `~/.config/ymir` | `%LOCALAPPDATA%\ymir` | Database, password hash, Tauri auth file                 |
| Home (binary) | `~/.ymir`        | `%LOCALAPPDATA%\ymir` | Installed binaries (CLI, server, Tauri app), client-dist |

Resolved by `getConfigDir()` and `getYmirHomeDir()` in `packages/shared/src/utils.ts`.

### Database

Ymir stores persistent data in SQLite:

| Database   | Location                   | Purpose                                                                                                                                           |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent | `{getConfigDir()}/ymir.db` | Workspaces, password hash, UI layout state, persisted tabs (survive server restarts), server config (`pane_layout_*`, `ui_pane_visibility`, etc.) |
| Session    | In-memory (`:memory:`)     | Client sessions, workspace-scoped tab state (tabs table includes `workspace_id` and `pane` columns)                                               |

The workspaces table includes a `sort_order` column (integer) that persists drag-and-drop ordering. The `WorkspaceSummary` type returned by `workspace.list` includes `sortOrder: number` reflecting this column.

The config directory is created automatically on first run.

The `server_config` key-value table (within the persistent database) stores UI layout persistence data. Config keys include:

| Key pattern                 | Value                                       |
| --------------------------- | ------------------------------------------- |
| `pane_layout_{workspaceId}` | Serialized pane tree JSON (see `pane-tree`) |
| `ui_pane_visibility`        | Pane visibility state                       |
| `ui_panel_sizes`            | Panel size state                            |
| `ui_project_sidebar_sizes`  | Project sidebar size state                  |

### Persisted Tabs

The `persisted_tabs` table mirrors tab state into the persistent database so tabs survive server restarts. Every `tab.create`, `tab.delete`, `tab.reorder`, and `tab.update` handler writes through to this table.

```sql
persisted_tabs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tab_type TEXT NOT NULL CHECK(tab_type IN ('terminal', 'editor', 'diff', 'git-tree')),
  title TEXT,
  file_path TEXT,
  pane TEXT DEFAULT 'content',
  sort_order INTEGER DEFAULT 0,
  diff_ref TEXT,
  repo_path TEXT,
  commit_sha TEXT,
  parent_sha TEXT,
  cwd TEXT,
  custom_title TEXT,
  worktree_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)
```

CRUD functions: `savePersistedTab`, `deletePersistedTab`, `updatePersistedTabOrder`, `updatePersistedTabTitle`, `listPersistedTabsByWorkspace`, `deletePersistedTabsByWorkspace`.

## Windows Support

Ymir supports both Linux and Windows (x64) as first-class platforms:

- **PTY**: Bun's `Bun.Terminal` uses ConPTY on Windows. The `PTYManager` detects the platform at construction and adapts shell resolution (Windows shells resolved via PATH, `COMSPEC` env var as fallback), resize behavior (no `SIGWINCH` on Windows — handled by ConPTY directly), and process termination.
- **Shell allowlist**: On Windows, `cmd.exe`, `powershell.exe`, and `pwsh.exe` are allowed; fallback order is `cmd.exe` → `powershell.exe`.
- **Paths**: All path resolution is platform-aware via `getConfigDir()` / `getYmirHomeDir()` in `@ymir/shared`.
- **Binary names**: `.exe` suffix is appended automatically on Windows via `IS_WINDOWS` / `getBinaryName()`.
- **Build scripts**: `build-all.ts`, `build-server.ts`, `build-cli.ts`, and `build-client-dist.ts` all handle Windows targets (PowerShell for zip, `.exe` suffixes, no `chmod`).
