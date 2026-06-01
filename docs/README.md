# Ymir — Architecture & Development Guide

## Overview

Ymir is a web-based terminal IDE with real-time file management, git integration, and multi-terminal support. It runs as a single self-contained process — a Bun server hosts both the API and the compiled client assets.

## Architecture

Ymir is a 3-package monorepo managed by Bun workspaces:

```
ymir-terminal/
├── apps/
│   ├── server/        @ymir/server   — Bun HTTP + WebSocket server, PTY, SQLite
│   └── client/        @ymir/client   — React SPA (Vite + TanStack Router/Query)
├── packages/
│   └── shared/        @ymir/shared   — Protocol types, constants, utilities
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
└── scripts/
    ├── dev.ts                         Concurrent dev runner (server + client)
    ├── build-sidecar.sh               Compile server to standalone binary
    └── build-client.sh                Build client SPA
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
```

## WebSocket Protocol

All communication uses a JSON envelope format over a single WebSocket connection.

### Envelope Structure

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

### Message Flow

1. **Client sends a request** with `type: "request"` and a unique `id`.
2. **Server responds** with `type: "response"`, same `id`, and either `payload` or `error`.
3. **Server pushes events** with `type: "event"` (no `id` correlation needed).

### Channel Reference

| Channel             | Direction | Description                                                                                            |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `auth`              | request   | Authenticate with password                                                                             |
| `terminal.create`   | request   | Spawn a new PTY                                                                                        |
| `terminal.input`    | request   | Send keystrokes (base64)                                                                               |
| `terminal.resize`   | request   | Resize terminal dimensions                                                                             |
| `terminal.close`    | request   | Kill a PTY                                                                                             |
| `terminal.output`   | event     | PTY output (base64)                                                                                    |
| `terminal.exit`     | event     | PTY process exited (with exit code)                                                                    |
| `workspace.list`    | request   | List saved workspaces                                                                                  |
| `workspace.create`  | request   | Create a workspace                                                                                     |
| `workspace.update`  | request   | Update workspace settings                                                                              |
| `workspace.delete`  | request   | Delete a workspace                                                                                     |
| `file.tree`         | request   | Get directory listing                                                                                  |
| `file.read`         | request   | Read file contents                                                                                     |
| `file.write`        | request   | Write file contents                                                                                    |
| `file.create`       | request   | Create file or directory                                                                               |
| `file.delete`       | request   | Delete file or directory                                                                               |
| `file.rename`       | request   | Rename/move a file                                                                                     |
| `file.change`       | event     | Filesystem change notification                                                                         |
| `git.status`        | request   | Get git status for a path; optional `repoPath`, returns `hasRemote`, `ahead`, `behind`                 |
| `git.log`           | request   | Paginated git commit history (`skip`/`limit`, returns `GitLogItem[]` + `hasMore`); optional `repoPath` |
| `git.repoDiscovery` | request   | Discover all git repositories in a workspace directory                                                 |
| `git.stage`         | request   | Stage files in a git repository                                                                        |
| `git.unstage`       | request   | Unstage files in a git repository                                                                      |
| `git.discard`       | request   | Discard unstaged changes to files                                                                      |
| `git.commit`        | request   | Commit staged changes                                                                                  |
| `git.branches`      | request   | List branches in a git repository                                                                      |
| `git.checkout`      | request   | Switch or create a branch                                                                              |
| `git.push`          | request   | Push branch to origin                                                                                  |
| `git.fetch`         | request   | Fetch from remote                                                                                      |
| `config.get`        | request   | Get a config value from server_config table                                                            |
| `config.set`        | request   | Set a config value in server_config table                                                              |
| `tab.list`          | request   | List tabs for a workspace (with terminal liveness)                                                     |
| `tab.create`        | request   | Create a tab (terminal or editor)                                                                      |
| `tab.update`        | request   | Update tab properties (active, title, sort order)                                                      |
| `tab.delete`        | request   | Delete a tab                                                                                           |
| `tab.reorder`       | request   | Reorder tabs by ID array                                                                               |
| `connection.status` | event     | Connection status change                                                                               |

Terminal data is base64-encoded to safely transport binary PTY output over JSON.

## Authentication Flow

1. Client connects via WebSocket.
2. Client sends an `auth` request with `{ password }`.
3. Server hashes the password (Argon2id) and compares against the stored hash.
4. On success, server returns a JWT signed with HS256 (7-day expiry).
5. Client stores the JWT and includes it via the `token` field on every subsequent request.
6. Server validates the JWT on each request before dispatching to handlers.

The server requires a password to start. Without `--password` or `YMIR_PASSWORD` env var, it exits with an error.

## Project Structure

### `packages/shared` — `@ymir/shared`

| File                   | Purpose                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `protocol/types.ts`    | Envelope types (`MessageEnvelope`), `ErrorCodes` constant, `ErrorCode` union type                                            |
| `protocol/payloads.ts` | Request/event type constants, payload types (`GitLogRequest`, `GitLogItem`, `GitLogResponse`, `ConnectionStatusEvent`, etc.) |
| `protocol/panes.ts`    | Split pane tree types                                                                                                        |
| `constants.ts`         | Default ports, paths, timeouts                                                                                               |
| `utils.ts`             | `generateId`, `toBase64`, `fromBase64`, `delay`, `clamp`, `expandTilde`, `getConfigPath`, `getDbPath`                        |

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
| `ws/handlers/files/`  | File handlers split into `tree`, `crud`, `language`, `shared`                             |
| `test-helpers/`       | Shared server test utilities (`mock-utils.ts`)                                            |

**Git module detail:**

| File                | Responsibility                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git/status.ts`     | Reads `git status --porcelain=v1` output, returns branch name + staged/unstaged file changes; exports `isGitRepo`, `spawnGit`, `getCurrentBranch`, `getGitStatus`, `hasRemote`, `getAheadBehind`, `getGitStatusEnhanced`        |
| `git/log.ts`        | Async `getGitLog(dirPath, skip, limit)` — executes `git log --pretty=format` with NUL-delimited fields (`%H%x00%P%x00%an%x00%at%x00%s`), returns `GitLogItem[]`. Uses `execFile` (promisified) to avoid blocking the event loop |
| `git/discovery.ts`  | Recursive repo discovery within workspace directories                                                                                                                                                                           |
| `git/operations.ts` | Stage, unstage, discard, and commit operations; exports `stageFiles`, `stageAll`, `unstageFiles`, `unstageAll`, `discardChanges`, `discardAll`, `commitChanges`                                                                 |
| `git/branches.ts`   | Branch listing, creation, and checkout                                                                                                                                                                                          |
| `git/remote.ts`     | Push and fetch operations                                                                                                                                                                                                       |

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
| `crud.ts`     | File create, write, delete, rename                       |
| `language.ts` | Language detection from file extensions/filenames        |
| `shared.ts`   | Shared utilities (`safePath`, `resolveWorkspace`, types) |
| `index.ts`    | Re-exports `registerFileHandlers`                        |

### `apps/client` — `@ymir/client`

| Directory       | Purpose                                        |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/`   | React UI components (see below)                |
|                 | `hooks/`                                       | Custom React hooks for state and data (incl. `useCreateTerminalTab`, `usePaneVisibility` with `loading` state for persisted pane visibility, `useFileSearch`, `useGitRepos` for multi-repo git state management — repo discovery, status, branches, and operations) |
|                 | `lib/`                                         | WebSocket client, request helper, git-utils, git-change-tree, git-graph, OSC 7 CWD parser, theme constants, context styles                                                                                                                                          |
| `routes/`       | TanStack Router route definitions              |
| `test-helpers/` | Shared client test utilities (`mock-setup.ts`) |

**Key components:**

| Component                  | Role                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppLayout`                | IDE shell with resizable left/center/right panels, collapsible via `paneVisibility` prop with slide animations (`AnimatedPane`); `topBar` prop renders the top bar; separators are conditionally rendered based on pane visibility; panel sizes are persisted to server via `config.set` and restored on load via `groupRef.setLayout()` |
| `Terminal`                 | ghostty-web terminal emulator with OSC 7 CWD and title tracking                                                                                                                                                                                                                                                                          |
| `CodeEditor`               | CodeMirror 6 editor instance                                                                                                                                                                                                                                                                                                             |
| `EditorPane`               | Extracted editor pane (file loading, save, retry)                                                                                                                                                                                                                                                                                        |
| `ContentPane`              | `forwardRef` tab coordinator — `ContentPaneHandle` for imperative tab management, batch close with dirty-file confirmation                                                                                                                                                                                                               |
| `PaneContextMenu`          | Context menu for pane operations                                                                                                                                                                                                                                                                                                         |
| `WorkspaceSidebar`         | Sidebar listing workspaces                                                                                                                                                                                                                                                                                                               |
| `WorkspaceItem`            | Individual workspace item with context menu                                                                                                                                                                                                                                                                                              |
| `CreateWorkspaceDialog`    | Dialog for creating new workspaces                                                                                                                                                                                                                                                                                                       |
| `FileTree`                 | Directory tree with context menu and inline git status                                                                                                                                                                                                                                                                                   |
| `WorkspaceItemContextMenu` | Context menu for workspace items (rename, color, etc.)                                                                                                                                                                                                                                                                                   |
| `RightSidebar`             | Project sidebar with toggleable top pane (FileTree/GitPanel) and bottom git history panel. Uses react-resizable-panels for the vertical split                                                                                                                                                                                            |
| `GitPanel`                 | Multi-repo git changes panel — discovers repos, displays per-repo headers with branch selectors and push/fetch buttons, commit message input (Ctrl+Enter), and collapsible staged/unstaged tree views with context menus for stage/unstage/discard/diff. Props: `workspaceId`, `workspaceCwd`, `onOpenEditor`                            |
| `GitHistoryPanel`          | Virtualized git commit history with SVG lane graph (per-row rendering) and infinite scroll. Uses `@tanstack/react-virtual` for virtualization and `react-intersection-observer` for infinite loading                                                                                                                                     |
| `GitRepoHeader`            | Per-repo header with branch selector (`GitBranchSelector`) and push/fetch action buttons                                                                                                                                                                                                                                                 |
| `GitChangesSection`        | Collapsible staged/unstaged changes sections rendered as `GitChangeTree` tree views                                                                                                                                                                                                                                                      |
| `GitBranchSelector`        | Custom dropdown for branch selection, integrating with `git.branches` and `git.checkout`                                                                                                                                                                                                                                                 |
| `GitCommitInput`           | Commit message textarea that submits via Ctrl+Enter, integrating with `git.commit`                                                                                                                                                                                                                                                       |
| `GitChangeTree`            | Recursive tree view for file changes grouped by directory with context menus                                                                                                                                                                                                                                                             |
| `GitChangeContextMenu`     | Context menu for git file change items (stage, unstage, discard, diff)                                                                                                                                                                                                                                                                   |
| `LoginPage`                | Password authentication form                                                                                                                                                                                                                                                                                                             |
| `TabBar`                   | Sortable tab strip — `variant` (content/bottom), context menu, inline rename, accent line, DnD via `useSortable`                                                                                                                                                                                                                         |
| `TabContextMenu`           | Right-click context menu (Close, Close Others, Close to the Right, Rename)                                                                                                                                                                                                                                                               |
| `BottomPanel`              | `forwardRef` terminal panel — `BottomPanelHandle`, shared `TabBar`, batch close with process-termination confirmation                                                                                                                                                                                                                    |
| `WorkspaceView`            | Top-level workspace view that wraps content in `PaneVisibilityProvider` and composes `TopBar` with `CommandBar` for the top bar; uses inner component pattern (`WorkspaceViewInner`) to consume pane visibility context; `DragDropProvider` for cross-pane terminal tab DnD                                                              |
| `TopBar`                   | Top bar with connection indicator (left), command bar slot (center), pane toggle buttons (right)                                                                                                                                                                                                                                         |
| `CommandBar`               | File search and command palette (activated by click or Ctrl+K, `/` prefix for commands)                                                                                                                                                                                                                                                  |
| `AnimatedPane`             | Slide animation wrapper for collapsible panels                                                                                                                                                                                                                                                                                           |
| `ToastProvider`            | Toast notification system                                                                                                                                                                                                                                                                                                                |

## Testing

All tests use `bun:test`. The project follows TDD — tests live alongside source files.

```bash
bun test                  # run all tests across the monorepo
bun test --watch          # watch mode
```

Tests exist in every package:

- `packages/shared/src/**/*.test.ts` — protocol types, utilities
- `apps/server/src/**/*.test.ts` — auth, DB, routing, handlers, PTY, files, git
- `apps/client/src/**/*.test.{ts,tsx}` — components, hooks, lib

## Configuration

Ymir stores persistent data in SQLite:

| Database   | Location                 | Purpose                                                                                             |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| Persistent | `~/.config/ymir/ymir.db` | Workspaces, password hash, UI layout state                                                          |
| Session    | In-memory (`:memory:`)   | Client sessions, workspace-scoped tab state (tabs table includes `workspace_id` and `pane` columns) |

The config directory is created automatically on first run.

The `server_config` key-value table (within the persistent database) stores UI layout persistence data — panel sizes and pane visibility — using keys like `ui_pane_visibility`, `ui_panel_sizes`, and `ui_project_sidebar_sizes`.

## Project Sidebar

The right sidebar (`RightSidebar`) is a vertically resizable panel layout with a header labeled "Project" containing two toggle buttons:

- **📁 (File Explorer)** — shows the file tree in the top pane
- **⎇ (Git Changes)** — shows staged/unstaged git changes (`GitPanel`) in the top pane

```
┌─────────────────────────────────────┐
│  Project              [📁] [⎇]      │  ← header with toggle buttons
├─────────────────────────────────────┤
│                                     │
│  Top Pane (60%)                     │  ← FileTree OR GitPanel (toggle)
│                                     │
├─────────────────────────────────────┤
│                                     │
│  Bottom Pane (40%)                  │  ← GitHistoryPanel
│  ●──●──●  feat: add auth           │     (virtualized git commit graph)
│  │   └─●  fix: login bug            │
│  ●──────●  Merge pull request       │
│                                     │
└─────────────────────────────────────┘
```

Panel sizes are persisted under config key `ui_project_sidebar_sizes` as `{ topPane: number, historyPane: number }`.

Both `file.tree` and `git.status` are fetched when a workspace is selected. The `useFileChange` hook subscribes to `file.change` events and refreshes **both** the tree and git status on any filesystem change.

`workspaceCwd` flows from `WorkspaceView` → `RightSidebar` → `FileTree` and is used to compute relative paths for git status lookups.

### Git History Panel

The `GitHistoryPanel` renders a virtualized, infinitely-scrollable git commit log with an SVG lane graph:

- **Pagination** — fetches commits via `git.log` requests with `{ workspaceId, skip, limit }` (page size = 50)
- **Lane graph** — `computeLanes()` assigns each commit a lane and color, draws SVG bezier curves for branch/merge lines, and renders commit dots
- **Virtualization** — uses `@tanstack/react-virtual` with 30px fixed row height and 10-row overscan
- **Infinite scroll** — a sentinel element monitored by `react-intersection-observer` (`rootMargin: '200px'`) triggers the next page load
- **Stale-fetch protection** — a generation counter (`generationRef`) discards responses from outdated workspace contexts
- **Error recovery** — displays an inline error banner with a Retry button; errors persist until manually dismissed

### Inline Git Status in File Tree

`FileTree` decorates nodes with colored git status indicators:

| Status | Color    | Behavior                                  |
| ------ | -------- | ----------------------------------------- |
| `??`   | Grey     | Untracked file — colored dot              |
| `A`    | Green    | Added — colored dot                       |
| `R`    | Green    | Renamed — colored dot                     |
| `C`    | Green    | Copied — colored dot                      |
| `M`    | Gold     | Modified — colored dot                    |
| `D`    | Dark red | Deleted — colored dot, strikethrough name |

**Directory aggregation:** Directories show a gold dot when any descendant has uncommitted changes, computed recursively via `computeDirectoryStatus`.

**Deleted files:** Since deleted files no longer exist on disk, `mergeDeletedFiles` (in `git-utils.ts`) inserts synthetic `FileNode` entries for them in alphabetical order so they remain visible in the tree.

The git status logic lives in `lib/git-utils.ts`:

| Export                   | Purpose                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| `buildGitPathMap`        | Converts `GitStatusResponse` into a `Map<relativePath, { status, staged }>` |
| `computeDirectoryStatus` | Recursively checks if any descendant has changes                            |
| `mergeDeletedFiles`      | Merges synthetic nodes for deleted files into the tree                      |

`GIT_STATUS_COLORS` (status code → hex color mapping) lives in `lib/theme.ts`, not `git-utils.ts`.

The change tree logic lives in `lib/git-change-tree.ts`:

| Export            | Purpose                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `buildChangeTree` | Converts flat git file changes into a recursive tree structure grouped by directory |

### `useGitRepos` Hook

The `useGitRepos` hook manages all git state for the `GitPanel`. It accepts `workspaceId` and `workspaceCwd` and provides:

| Field / Method   | Description                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| `repos`          | Discovered repository list with paths and relative paths                          |
| `repoStatuses`   | Map of repo path → `GitStatusResponse` (including `hasRemote`, `ahead`, `behind`) |
| `repoBranches`   | Map of repo path → branch list                                                    |
| `loading`        | Whether initial repo discovery and status loading is in progress                  |
| `error`          | Error message string if the last operation failed, or `null`                      |
| `stageFiles`     | Stage files in a repo (`git.stage`)                                               |
| `unstageFiles`   | Unstage files in a repo (`git.unstage`)                                           |
| `discardChanges` | Discard unstaged changes (`git.discard`)                                          |
| `commit`         | Commit staged changes (`git.commit`); returns commit hash                         |
| `checkout`       | Switch or create a branch (`git.checkout`)                                        |
| `push`           | Push to remote (`git.push`)                                                       |
| `fetch`          | Fetch from remote (`git.fetch`)                                                   |
| `refresh`        | Re-discover repos and refresh all status/branch data                              |
| `refreshRepo`    | Refresh status (and optionally branches) for a single repo                        |
| `pushLoading`    | Map of repo path → boolean push-in-progress state                                 |
| `fetchLoading`   | Map of repo path → boolean fetch-in-progress state                                |

## Tab System

The tab system manages terminal and editor tabs across two tab strips: the **content pane** (editors + terminals) and the **bottom panel** (terminals only). Both panes share the same `useTabs` hook internally and the `TabBar` component for rendering.

### Tab Interface

```typescript
interface Tab {
  id: string;
  workspaceId: string; // workspace-scoped; each tab belongs to exactly one workspace
  type: 'terminal' | 'editor';
  title: string;
  terminalId?: string;
  filePath?: string;
  cwd?: string; // tracked via OSC 7 for terminal tabs
  paneLayout?: unknown;
  customTitle?: string; // set when a user renames a tab
}
```

### `useTabs` Hook

Each pane (`ContentPane`, `BottomPanel`) owns an independent `useTabs` instance:

| Method            | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `createTab`       | Create a tab (terminal or editor) and activate it                         |
| `closeTab`        | Close a tab; activate the previous tab (or the next, or null)             |
| `activateTab`     | Set a tab as active                                                       |
| `updateTabTitle`  | Update a tab's display title                                              |
| `updateTabCwd`    | Update a terminal tab's working directory (from OSC 7 parsing)            |
| `reorderTabs`     | Move a tab from one index to another (used by DnD)                        |
| `closeTabsRight`  | Close all tabs to the right of a given tab                                |
| `closeOtherTabs`  | Close all tabs except the given one                                       |
| `switchWorkspace` | Set the active workspace; auto-initializes empty state for new workspaces |
| `loadTabs`        | Load tab state from server data for a given workspace                     |

`useTabs` stores per-workspace state in a `Map` keyed by `workspaceId`. When `switchWorkspace` is called, the hook swaps to that workspace's tab set, creating an empty entry if none exists. All new tabs are auto-assigned the current `workspaceId`.

`closeTab` uses a ref (`activeTabIdRef`) to avoid stale closures when computing which tab to activate next.

### TabBar Component

`TabBar` renders a sortable, context-menu-equipped tab strip. It supports two visual variants via the `variant` prop:

| Variant   | Used by       | Styling                                                              |
| --------- | ------------- | -------------------------------------------------------------------- |
| `content` | `ContentPane` | Inactive tabs use `COLOR_TAB_INACTIVE` background, 13px font         |
| `bottom`  | `BottomPanel` | Inactive tabs are transparent, 12px font, accent underline on active |

Each tab is a `SortableTab` (memoized) wired to `@dnd-kit/react`'s `useSortable` with a `group` identifier (`"content"` or `"bottom"`). This group is used by the `DragDropProvider` in `WorkspaceView` to distinguish same-pane reorders from cross-pane transfers.

**Features:**

- **Context menu** — right-click opens `TabContextMenu` (Close, Close Others, Close to the Right, Rename)
- **Middle-click close** — `onAuxClick` with `button === 1` closes the tab
- **Inline rename** — double-triggered from context menu; commits on Enter/blur, cancels on Escape
- **Tooltips** — terminal tabs show `cwd`, editor tabs show `filePath`
- **Active accent line** — 2px `var(--accent)` top border on the active tab

### Drag-and-Drop Architecture

```
WorkspaceView (DragDropProvider)
├── onDragOver → same-group reorder via move() helper
│   ├── group="content" → ContentPane.reorderTabs()
│   └── group="bottom"  → BottomPanel.reorderTabs()
└── onDragEnd → cross-group transfer
    ├── sourcePane.transferTabOut(id) → { terminalId, title, cwd }
    └── targetPane.receiveTab(terminalId, title, cwd)
```

**Same-pane reorder:** During drag-over, `@dnd-kit/helpers`' `move()` computes the new index order. The source pane's `reorderTabs(fromIndex, toIndex)` is called to update state.

**Cross-pane transfer:** On drag-end, if source and target groups differ, the tab is removed from the source pane and added to the target pane. Only terminal tabs can be transferred (editor tabs are bound to a specific pane). `transferTabOut` returns the terminal's data so the target pane can re-create the tab without spawning a new PTY.

**Workspace boundary validation:** Drag-and-drop operations are rejected if the source tab's `workspaceId` does not match the active workspace. This prevents tabs from being transferred across workspace boundaries.

### Imperative Handles

`ContentPane` and `BottomPanel` expose handles via `forwardRef` + `useImperativeHandle` so `WorkspaceView` can orchestrate cross-pane operations:

```typescript
interface ContentPaneHandle {
  transferTabOut(
    tabId: string,
  ): { terminalId: string; title: string; cwd?: string; customTitle?: string } | null;
  receiveTab(terminalId: string, title: string, cwd?: string, customTitle?: string): string;
  reorderTabs(fromIndex: number, toIndex: number): void;
  getTabs(): Tab[];
  getActiveTabId(): string | null;
  updateTabTitle(tabId: string, title: string): void;
  updateTabCwd(tabId: string, cwd: string): void;
}
```

`BottomPanelHandle` has the same shape.

### OSC 7 CWD Tracking

Terminal tabs track their current working directory by parsing OSC 7 escape sequences from PTY output:

```
PTY output → Terminal.onOutput callback
           → parseOsc7Cwd(data) extracts path from OSC 7 sequence
           → onCwdChange(cwd) callback
           → updateTabCwd(tabId, cwd)
```

The OSC 7 format is `ESC ] 7 ; file://hostname/path ST`. The parser (`lib/osc-parser.ts`) uses a global regex to find the last match in each data chunk and returns the decoded path. This enables tooltip display of the current directory and preserves CWD when transferring tabs between panes.

### Title Tracking

ghostty-web emits `onTitleChange` events when the terminal title changes (e.g. via shell `PROMPT_COMMAND`). The `Terminal` component forwards these through `onTitleChange` → `updateTabTitle`, keeping the tab strip in sync with the running process.

### Batch Close Behavior

- **ContentPane:** Checks for dirty (unsaved) editor files before closing. Shows a per-file confirmation dialog if any tab has unsaved changes.
- **BottomPanel:** Warns about running processes being terminated. Shows a single confirmation when closing multiple terminals.
- Both send `terminal.close` requests to the server for each closed terminal tab.

### Accessibility

- Tree nodes have `role="treeitem"`, `tabIndex={0}`, and `aria-expanded` on directories
- Status dots include `aria-label` (e.g. "Git status: modified") and `title` tooltips
- Children containers use `role="group"`
- Keyboard navigation via Enter/Space

#### Tab Components

- `TabBar` uses `role="tablist"`; each tab has `role="tab"` with `aria-selected`
- Keyboard navigation: **Arrow Left/Right** to move focus between tabs, **Enter/Space** to activate
- Close buttons have `aria-label="Close tab"` and a visible focus ring (`:focus-visible` outline)
- Context menu items are keyboard-navigable via `@radix-ui/react-context-menu` (arrow keys, Enter, Escape)
- Tab tooltips expose `cwd` (terminal) or `filePath` (editor) via the `title` attribute

## Desktop App Architecture

### Sidecar Pattern

The desktop app uses a **sidecar pattern**: the Bun server is compiled with `bun build --compile` into a standalone binary that is bundled alongside the Tauri app.

Startup sequence:
1. Tauri app generates or retrieves a persistent password (`~/.config/ymir/tauri-password`)
2. Spawns the sidecar binary with `--port=0 --host=127.0.0.1` and password via env var
3. Awaits the sidecar's stdout for the readiness line (`Ymir server listening on 127.0.0.1:PORT`)
4. Sets the webview URL to `http://127.0.0.1:PORT`
5. The frontend detects Tauri via `window.__TAURI_INTERNALS__` and auto-authenticates

### Frameless Window

The window has `decorations: false` — no native title bar. Instead:
- The `TopBar` component has `data-tauri-drag-region` making it draggable
- Interactive children (buttons, inputs) have `pointerEvents: 'auto'` to remain clickable
- Window controls (minimize, maximize, close) appear right of the panel toggles
- Double-click on the drag region toggles maximize

### Auto-Authentication

In Tauri mode, the `useTauri` hook detects the environment and the `useAuth` hook automatically:
1. Calls `get_tauri_config` Tauri command to get the auto-generated password
2. Calls `login(password)` to authenticate with the sidecar server
3. The JWT token is stored in localStorage for subsequent requests

### Tauri Files

| File                              | Purpose                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `src-tauri/src/lib.rs`            | App builder, sidecar startup, window URL configuration                         |
| `src-tauri/src/sidecar.rs`        | `SidecarManager` — spawn, readiness detection (15s timeout), static dir resolution |
| `src-tauri/src/auth.rs`           | Password generation (32-byte hex via getrandom), file persistence with 0600 permissions |
| `src-tauri/tauri.conf.json`       | Window config (frameless, 1280×800), CSP, sidecar registration, resource bundling |
| `src-tauri/capabilities/default.json` | Scoped shell permissions (sidecar only), window control permissions          |

### Frontend Files

| File                              | Purpose                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `apps/client/src/hooks/useTauri.ts` | Tauri detection (`isTauri`) and config retrieval (`getTauriConfig`) |
| `apps/client/src/hooks/useAuth.ts`  | Auto-login when `isTauri` is true                           |
| `apps/client/src/components/TopBar.tsx` | Drag region, window controls (conditional on `isTauri`)  |
| `apps/client/src/lib/theme.ts`       | Window control theme constants                             |
