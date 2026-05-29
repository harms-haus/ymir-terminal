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
├── docs/                              — Documentation and plans
└── scripts/                           — Dev tooling (concurrent runner)
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

| Layer       | Technology                                                            |
| ----------- | --------------------------------------------------------------------- |
| Runtime     | [Bun](https://bun.sh) — HTTP server, WebSocket, SQLite, test runner   |
| Language    | TypeScript (strict mode)                                              |
| Backend     | `Bun.serve`, `Bun.Terminal` (PTY), `bun:sqlite`                       |
| Frontend    | React 19, TanStack Router, TanStack Query, Vite                       |
| Terminal    | `@xterm/xterm` + `@xterm/addon-fit`                                   |
| Code Editor | CodeMirror 6 (`@codemirror/lang-*`)                                   |
| Auth        | Argon2id password hashing, JWT (HS256 via `jose`), 7-day token expiry |
| Styling     | Inline CSS, `react-resizable-panels` for IDE layout                   |
| Testing     | `bun:test`, Testing Library (React), happy-dom                        |

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
interface MessageEnvelope {
  v: 1; // protocol version
  type: 'request' | 'response' | 'event';
  id: string; // UUID for correlating request ↔ response
  channel: string; // e.g. "auth", "terminal.create", "file.tree"
  payload: unknown; // request/response body
  error?: ErrorResponse; // code is typed as ErrorCode (union), not plain string
}
```

### Message Flow

1. **Client sends a request** with `type: "request"` and a unique `id`.
2. **Server responds** with `type: "response"`, same `id`, and either `payload` or `error`.
3. **Server pushes events** with `type: "event"` (no `id` correlation needed).

### Channel Reference

| Channel             | Direction | Description                         |
| ------------------- | --------- | ----------------------------------- |
| `auth`              | request   | Authenticate with password          |
| `terminal.create`   | request   | Spawn a new PTY                     |
| `terminal.input`    | request   | Send keystrokes (base64)            |
| `terminal.resize`   | request   | Resize terminal dimensions          |
| `terminal.close`    | request   | Kill a PTY                          |
| `terminal.output`   | event     | PTY output (base64)                 |
| `terminal.exit`     | event     | PTY process exited (with exit code) |
| `workspace.list`    | request   | List saved workspaces               |
| `workspace.create`  | request   | Create a workspace                  |
| `workspace.update`  | request   | Update workspace settings           |
| `workspace.delete`  | request   | Delete a workspace                  |
| `file.tree`         | request   | Get directory listing               |
| `file.read`         | request   | Read file contents                  |
| `file.write`        | request   | Write file contents                 |
| `file.create`       | request   | Create file or directory            |
| `file.delete`       | request   | Delete file or directory            |
| `file.rename`       | request   | Rename/mmove a file                 |
| `file.change`       | event     | Filesystem change notification      |
| `git.status`        | request   | Get git status for a path           |
| `connection.status` | event     | Connection status change            |

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

| File                   | Purpose                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `protocol/types.ts`    | Envelope types (`MessageEnvelope`), `ErrorCodes` constant, `ErrorCode` union type                     |
| `protocol/payloads.ts` | Request/event type constants, payload types, `ConnectionStatusEvent`                                  |
| `protocol/panes.ts`    | Split pane tree types                                                                                 |
| `constants.ts`         | Default ports, paths, timeouts                                                                        |
| `utils.ts`             | `generateId`, `toBase64`, `fromBase64`, `delay`, `clamp`, `expandTilde`, `getConfigPath`, `getDbPath` |

### `apps/server` — `@ymir/server`

| Directory            | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `auth/`              | Password hashing (Argon2id), JWT sign/verify                  |
| `db/`                | Persistent DB (workspaces), session DB (tabs)                 |
| `lib/`               | Shared handler validation (`handler-validation.ts`)           |
| `pty/`               | PTY manager — spawn, resize, write, kill                      |
| `files/`             | File scanner, CRUD operations, filesystem watcher             |
| `git/`               | Git status reader (`git status --porcelain`)                  |
| `ws/`                | WebSocket server, message router, connection state            |
| `ws/handlers/`       | Channel handlers (auth, terminal, files, git, ws)             |
| `ws/handlers/files/` | File handlers split into `tree`, `crud`, `language`, `shared` |
| `test-helpers/`      | Shared server test utilities (`mock-utils.ts`)                |

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

| Directory       | Purpose                                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| `components/`   | React UI components (see below)                                                    |
| `hooks/`        | Custom React hooks for state and data (incl. `useCreateTerminalTab`)               |
| `lib/`          | WebSocket client, request helper, git-tree-status, theme constants, context styles |
| `routes/`       | TanStack Router route definitions                                                  |
| `test-helpers/` | Shared client test utilities (`mock-setup.ts`)                                     |

**Key components:**

| Component                  | Role                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `AppLayout`                | IDE shell with resizable left/center/right                    |
| `SplitPaneView`            | Recursive split pane renderer                                 |
| `Terminal`                 | xterm.js terminal emulator                                    |
| `CodeEditor`               | CodeMirror 6 editor instance                                  |
| `EditorPane`               | Extracted editor pane (file loading, save, retry)             |
| `ContentPane`              | Tab content area coordinator (renders EditorPane or Terminal) |
| `PaneContextMenu`          | Context menu for pane operations                              |
| `WorkspaceSidebar`         | Sidebar listing workspaces                                    |
| `WorkspaceItem`            | Individual workspace item with context menu                   |
| `CreateWorkspaceDialog`    | Dialog for creating new workspaces                            |
| `FileTree`                 | Directory tree with context menu and inline git status        |
| `WorkspaceItemContextMenu` | Context menu for workspace items (rename, color, etc.)        |
| `RightSidebar`             | Resizable explorer panel (FileTree 70% / GitPanel 30%)        |
| `GitPanel`                 | Git status display                                            |
| `LoginPage`                | Password authentication form                                  |
| `BottomPanel`              | Terminal panel at bottom of layout                            |
| `StatusBar`                | Connection status, workspace info                             |
| `TabBar`                   | Editor/terminal tab strip                                     |
| `ToastProvider`            | Toast notification system                                     |

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

| Database   | Location                 | Purpose                    |
| ---------- | ------------------------ | -------------------------- |
| Persistent | `~/.config/ymir/ymir.db` | Workspaces, password hash  |
| Session    | In-memory (`:memory:`)   | Client sessions, tab state |

The config directory is created automatically on first run.

## Explorer Sidebar

The right sidebar (`RightSidebar`) is a vertically resizable panel layout hosting the file tree and git status:

```
┌──────────────────┐
│ Explorer (header)│
├──────────────────┤
│                  │
│   FileTree       │  70% default, 20% min
│   (scrollable)   │
│                  │
├─── (draggable) ──┤
│   GitPanel       │  30% default, 10% min
└──────────────────┘
```

Both `file.tree` and `git.status` are fetched when a workspace is selected. The `useFileChange` hook subscribes to `file.change` events and refreshes **both** the tree and git status on any filesystem change.

`workspaceCwd` flows from `WorkspaceView` → `RightSidebar` → `FileTree` and is used to compute relative paths for git status lookups.

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

**Deleted files:** Since deleted files no longer exist on disk, `mergeDeletedFiles` (in `git-tree-status.ts`) inserts synthetic `FileNode` entries for them in alphabetical order so they remain visible in the tree.

The git status logic lives in `lib/git-tree-status.ts`:

| Export                   | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `GIT_STATUS_COLORS`      | Status code → hex color mapping (re-exported from `lib/theme.ts`) |
| `buildGitPathMap`        | Converts `GitStatusResponse` into a `Map<relativePath, status>`   |
| `computeDirectoryStatus` | Recursively checks if any descendant has changes                  |
| `mergeDeletedFiles`      | Merges synthetic nodes for deleted files into the tree            |

### Accessibility

- Tree nodes have `role="treeitem"`, `tabIndex={0}`, and `aria-expanded` on directories
- Status dots include `aria-label` (e.g. "Git status: modified") and `title` tooltips
- Children containers use `role="group"`
- Keyboard navigation via Enter/Space
