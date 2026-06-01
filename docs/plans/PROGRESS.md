# Ymir Implementation Progress

_Last updated: 2026-06-01_

## Phase Overview

| Phase | Focus                     | Status      | Start Date | End Date   |
| ----- | ------------------------- | ----------- | ---------- | ---------- |
| 1     | Scaffolding & Tooling     | ✅ Complete | 2026-05-27 | 2026-05-27 |
| 2     | Shared Types & Protocol   | ✅ Complete | 2026-05-27 | 2026-05-27 |
| 3     | Server Foundation         | ✅ Complete | 2026-05-27 | 2026-05-27 |
| 4     | Server Features           | ✅ Complete | 2026-05-27 | 2026-05-27 |
| 5     | Client Foundation         | ✅ Complete | 2026-05-27 | 2026-05-27 |
| 6     | Terminal Client           | ✅ Complete | 2026-05-27 | 2026-05-27 |
| 7     | File Tree & Editor        | ✅ Complete | 2026-05-27 | 2026-05-27 |
| 8     | Split Panes & Theme       | ✅ Complete | 2026-05-27 | 2026-05-27 |
| 9     | Polish & Integration      | ✅ Complete | 2026-05-27 | 2026-05-27 |
| 10    | Tauri Desktop App         | ✅ Complete | 2026-05-31 | 2026-05-31 |
| 11    | Deployment & Distribution | ✅ Complete | 2026-06-01 | 2026-06-01 |

---

## Phase 1: Scaffolding & Tooling

- [x] 1.1 Initialize monorepo structure with Bun workspaces
- [x] 1.2 Configure TypeScript project references
- [x] 1.3 Set up ESLint flat config
- [x] 1.4 Set up Prettier
- [x] 1.5 Set up bun:test infrastructure
- [x] 1.6 Create docs directory structure
- [x] 1.7 Create dev script and CLI entry point stub

## Phase 2: Shared Types & Protocol

- [x] 2.1 Define WebSocket message envelope types
- [x] 2.2 Define protocol message payload types
- [x] 2.3 Define split pane tree types
- [x] 2.4 Define shared constants and utility functions
- [x] 2.5 Create shared package entry point and re-exports

## Phase 3: Server Foundation — Auth, Database & WebSocket

- [x] 3.1 Implement Argon2id password hashing utilities
- [x] 3.2 Implement JWT token management
- [x] 3.3 Implement persistent database layer (workspaces)
- [x] 3.4 Implement in-memory session database
- [x] 3.5 Implement WebSocket server with Bun.serve
- [x] 3.6 Implement message parsing and request/response correlation
- [x] 3.7 Implement auth message handler
- [x] 3.8 Wire server entry point with auth and WebSocket

## Phase 4: Server Features — PTY, File Operations & Git Status

- [x] 4.1 Implement PTY process manager
- [x] 4.2 Implement terminal WebSocket handlers
- [x] 4.3 Implement file tree scanner
- [x] 4.4 Implement file operations (CRUD)
- [x] 4.5 Implement file watcher with fs.watch
- [x] 4.6 Implement git status reader
- [x] 4.7 Implement file and git WebSocket handlers
- [x] 4.8 Implement workspace WebSocket handlers
- [x] 4.9 Wire all handlers into server

## Phase 5: Client Foundation — TanStack Start App, Layout & Auth

- [x] 5.1 Initialize TanStack Start client app
- [x] 5.2 Implement WebSocket client with reconnection
- [x] 5.3 Implement auth state management and login page
- [x] 5.4 Implement connection status hook
- [x] 5.5 Implement root layout with resizable panels
- [x] 5.6 Implement workspace sidebar
- [x] 5.7 Implement status bar
- [x] 5.8 Implement TanStack Query hooks for workspace data

## Phase 6: Terminal Client — ghostty-web Integration & Terminal UI

- [x] 6.1 Implement ghostty-web terminal component
- [x] 6.2 Implement terminal data flow hook
- [x] 6.3 Implement tab management system
- [x] 6.4 Implement bottom terminal panel
- [x] 6.5 Implement terminal resize handling
- [x] 6.6 Wire terminal components together in main content area

## Phase 7: File Tree & Code Editor

- [x] 7.1 Implement file tree component
- [x] 7.2 Implement file tree context menu
- [x] 7.3 Implement file icon resolver
- [x] 7.4 Implement CodeMirror editor component
- [x] 7.5 Implement editor tab integration
- [x] 7.6 Implement git status panel
- [x] 7.7 Wire right sidebar with file tree and git status

## Phase 8: Split Panes & Theme System

- [x] 8.1 Implement split pane rendering
- [x] 8.2 Implement workspace accent color theming
- [x] 8.3 Implement toast notification system
- [x] 8.4 Implement pane context menu and split controls
- [x] 8.5 Wire everything into complete workspace view

## Phase 9: Polish, Integration & Documentation

- [x] 9.1 Implement comprehensive error handling
- [x] 9.2 Implement dev mode concurrent runner
- [x] 9.3 Implement multi-client isolation verification
- [x] 9.4 Implement production server build and CLI
- [x] 9.5 Write final documentation and update PROGRESS.md

## Phase 10: Tauri Desktop App Integration

- [x] 10.1 Support --port=0 in Bun server for ephemeral port assignment
- [x] 10.2 Tauri 2.x project scaffolding (Cargo.toml, tauri.conf.json, capabilities)
- [x] 10.3 Tauri npm dependencies (@tauri-apps/api, @tauri-apps/cli)
- [x] 10.4 Window control theme constants
- [x] 10.5 Sidecar manager (spawn, readiness detection, shutdown)
- [x] 10.6 Tauri lib.rs startup sequence (password → sidecar → URL)
- [x] 10.7 useTauri hook for Tauri environment detection
- [x] 10.8 Auto-login for Tauri environment
- [x] 10.9 Window controls and drag region in TopBar
- [x] 10.10 Build scripts for sidecar and Tauri

## Phase 11: Deployment & Distribution ✅ Complete

**Date**: 2026-06-01
**Tasks**: 14 tasks across 6 sub-phases

### Changes:

- Added VERSION constant and platform constants to @ymir/shared
- Platform-aware config paths (Windows LOCALAPPDATA, Unix ~/.config/ymir)
- Windows PTY support (ConPTY, Windows shells, COMSPEC resolution)
- CLI wrapper package (apps/cli/) with ymir, ymir web, ymir update commands
- Tauri env var overrides (YMIR_STATIC_DIR, YMIR_SERVER_PATH) for non-bundled installs
- Cross-platform build scripts (TypeScript, replacing bash-only scripts)
- npm package structure with platform-specific optional dependencies
- From-source install script (scripts/install.ts)
- GitHub Actions release workflow (build-linux, build-windows, publish-main)
- Cross-platform CI testing
- Version synchronization script
- Updated README with installation and CLI usage documentation
- Created CHANGELOG.md and release checklist template

### Stats:

- 14 tasks completed
- 6 phases
- New packages: @ymir/cli
- New scripts: 10 build/utility scripts
- New npm packages: ymir, ymir-linux-x64, ymir-windows-x64

---

## Code Review & Fixes

### Review Phase

- **Security review**: Found 1 CRITICAL, 3 HIGH, 4 MEDIUM, 3 LOW issues
- **Efficiency review**: Found 3 CRITICAL, 3 HIGH, 4 MEDIUM, 4 LOW issues
- **UI/UX review**: Found 2 CRITICAL, 5 HIGH, 7 MEDIUM, 3 LOW issues

### Fixes Applied

All CRITICAL and HIGH issues fixed:

- Path traversal protection in file handlers
- `toBase64` chunked approach for large payloads
- `WorkspaceView` wired into routes
- `AuthProvider` mounted in `main.tsx`
- Session/PTY cleanup on disconnect
- Cross-session terminal ownership validation
- `YMIR_PASSWORD` env var support
- Auth rate limiting (5 attempts/min)
- Double `JSON.parse` eliminated
- `FileTreeContextMenu` composed into `FileTree`
- Delete confirmation dialog

### Final Stats

- **526 tests**, 0 failures, 1,356 assertions
- 11 phases, 73 tasks — all complete

---

## Explorer Sidebar Git Integration

_2026-05-28_

Enhanced the right sidebar with inline git status decorations and resizable panels.

### Changes

- **`lib/git-tree-status.ts`**: New utility module — `buildGitPathMap`, `computeDirectoryStatus`, `mergeDeletedFiles`, `GIT_STATUS_COLORS`
- **`FileTree`**: Colored status dots per file (green/gold/red), directory aggregation (gold dot for dirty trees), strikethrough text for deleted files
- **`RightSidebar`**: Replaced static layout with `react-resizable-panels` vertical `Group` — FileTree (70%) / GitPanel (30%) with draggable separator
- **Git auto-refresh**: `useFileChange` hook triggers both file tree and git status refresh on `file.change` events
- **`workspaceCwd` prop chain**: `WorkspaceView` → `RightSidebar` → `FileTree` for relative-path git lookups
- **Accessibility**: `role="tree"`/`role="treeitem"`/`role="group"`, `aria-expanded`, `aria-label` on status indicators, keyboard Enter/Space navigation
- **`mergeDeletedFiles`**: Synthetic `FileNode` entries inserted in alphabetical order for deleted files still referenced in git status

---

## Terminal Tab Improvements

_2026-05-29_

Enhanced terminal tabs with dynamic titles, context menus, drag-and-drop reordering, and cross-pane tab transfers.

### New Files

- **`lib/osc-parser.ts`** — OSC 7 CWD parser
- **`lib/osc-parser.test.ts`** — Tests for OSC parser
- **`components/TabContextMenu.tsx`** — Right-click tab context menu
- **`components/TabContextMenu.test.tsx`** — Tests for tab context menu

### Modified Files

- **`hooks/useTabs.ts`** — Added `cwd` field, `updateTabTitle`, `updateTabCwd`, `reorderTabs`, `closeTabsRight`, `closeOtherTabs`
- **`components/Terminal.tsx`** — Added `onTitleChange`/`onCwdChange` callbacks
- **`components/TabBar.tsx`** — Added `variant` prop, context menu integration, middle-click close, accent color line, inline rename, DnD sortable via `@dnd-kit`, ARIA tab roles, keyboard navigation
- **`components/ContentPane.tsx`** — `forwardRef` with imperative handle, batch close handlers
- **`components/BottomPanel.tsx`** — Refactored to use shared `TabBar`, `forwardRef`, batch close confirmation
- **`components/WorkspaceView.tsx`** — `DragDropProvider` wrapping for cross-pane DnD
- **`hooks/useTerminal.ts`** — `TextDecoder` reuse for efficiency

### New Dependencies

- `@dnd-kit/react` ^0.4.0
- `@dnd-kit/helpers` ^0.4.0

### Features

1. Terminal tab name shows current command (via ghostty `onTitleChange`)
2. Hover tooltip shows CWD for terminal tabs
3. Middle-click to close tabs
4. Right-click context menu: Close, Close Others, Close to the Right, Rename
5. Drag tabs to reorder within tab bars
6. Drag terminal tabs between ContentPane and BottomPanel
7. Focused tab shows workspace accent color line at top
8. ARIA tab roles and keyboard navigation

### Test Coverage

- **112 client tests** across 8 test files — all passing

---

## 2026-05-30 — Project Sidebar Redesign & Git History

### Summary

Redesigned the right sidebar (renamed 'Project sidebar') with a toggleable top pane (FileTree/GitPanel) and a new git history panel with commit graph visualization and infinite scroll.

### Files Created

- `apps/client/src/components/GitHistoryPanel.tsx` — Virtualized git commit history with SVG lane graph and infinite scroll
- `apps/server/src/git/log.ts` — Server-side git log command wrapper (async)

### Files Modified

- `packages/shared/src/protocol/payloads.ts` — Added `git.log` channel, `GitLogRequest`, `GitLogItem`, `GitLogResponse` types
- `packages/shared/src/protocol/payloads.test.ts` — Updated for new protocol types
- `apps/client/src/components/RightSidebar.tsx` — Added toggle buttons, switchable top pane, replaced bottom pane with GitHistoryPanel
- `apps/client/src/components/RightSidebar.test.tsx` — Updated tests for new layout
- `apps/client/src/components/RightSidebar.css` — Added custom scrollbar styles and focus-visible rule
- `apps/client/src/lib/theme.ts` — Added scrollbar color constants
- `apps/server/src/ws/handlers/git.ts` — Registered `git.log` WebSocket handler
- `apps/client/package.json` — Added `@tanstack/react-virtual`, `react-intersection-observer`

### New Dependencies

- `@tanstack/react-virtual@^3.13` — Virtualized list rendering
- `react-intersection-observer@^10.0` — Infinite scroll

### Features

- **Toggle top pane**: Switch between file tree and git changes via header buttons
- **Git history panel**: Bottom pane shows commit history with SVG lane graph (custom per-row renderer)
- **Virtualized rendering**: Only visible rows are in the DOM (via @tanstack/react-virtual)
- **Infinite scroll**: Loads 50 commits at a time when scrolling down
- **Custom scrollbars**: 4px thin, transparent track, rounded thumb
- **Accessibility**: aria-labels on toggle buttons, focus-visible indicators, improved color contrast

---

## 2026-05-30 — Workspace Tab Isolation

### Summary

Fixed workspace tab isolation so each workspace has its own independent set of tabs. Terminals and editors created in one workspace no longer appear in other workspaces. Tabs persist per-workspace when switching between workspaces, and terminal instances remain mounted (hidden) in the background to preserve scrollback history. Server-side tab persistence was activated with new CRUD WebSocket handlers.

### Files Created

- `packages/shared/src/protocol/payloads/tab.ts` — Tab CRUD protocol types
- `apps/server/src/ws/handlers/tabs.ts` — Server tab CRUD WebSocket handlers
- `apps/server/src/ws/handlers/tabs.test.ts` — Server handler tests (34 tests)

### Files Modified

- `apps/client/src/hooks/useTabs.ts` — Refactored to per-workspace Map storage; added `switchWorkspace`, `loadTabs`, `onTabChange`, `workspaceId` on Tab interface
- `apps/client/src/hooks/useTabs.test.tsx` — 17 new per-workspace tests (47 total)
- `apps/client/src/hooks/useTerminalPane.ts` — Accepts `workspaceId`/`pane`; syncs tabs to server; restores from server on workspace switch
- `apps/client/src/components/ContentPane.tsx` — Passes `workspaceId`/`pane` to useTerminalPane
- `apps/client/src/components/BottomPanel.tsx` — Passes `workspaceId`/`pane` to useTerminalPane
- `apps/client/src/components/WorkspaceView.tsx` — `workspaceId` on `TerminalRegistryEntry`; visibility-based `isActive` computation; drag-and-drop workspace guard
- `apps/server/src/db/session/tabs.ts` — Added `pane` column, `getTab`, `reorderTabs`, `setActiveTab` functions
- `apps/server/src/db/session/index.ts` — Updated schema, exports
- `apps/server/src/ws/handlers/tabs.ts` — 5 handlers: tab.list/create/update/delete/reorder with batch queries and path traversal protection
- `apps/server/src/server.ts` — Wired tab handler registration
- `apps/server/src/lib/handler-validation.ts` — Added `validateTabOwnership`
- `packages/shared/src/protocol/payloads/index.ts` — Added tab channel types to REQUEST_TYPES
- `packages/shared/src/protocol/types.ts` — Added `TAB_NOT_FOUND` error code

### Features

1. Each workspace has its own isolated set of terminal and editor tabs
2. Switching workspaces shows only that workspace's tabs
3. Terminal instances stay mounted (hidden with display:none) preserving scrollback
4. Editor tabs are workspace-scoped — no more path traversal errors
5. Drag-and-drop validates workspace boundaries
6. Server-side tab persistence via WebSocket CRUD handlers
7. Tabs restore from server on workspace switch and page reload (within session)
8. Path traversal protection on editor tab filePaths

### Test Coverage

- **47 useTabs tests** (17 new for workspace isolation)
- **34 server tab handler tests** (15 test cases)
- **40 component tests** (5 new integration tests)

---

## Phase 10: Tauri Desktop App Integration

- [x] 10.1 Support --port=0 in Bun server for ephemeral port assignment
- [x] 10.2 Tauri 2.x project scaffolding (Cargo.toml, tauri.conf.json, capabilities)
- [x] 10.3 Tauri npm dependencies (@tauri-apps/api, @tauri-apps/cli)
- [x] 10.4 Window control theme constants
- [x] 10.5 Sidecar manager (spawn, readiness detection, shutdown)
- [x] 10.6 Tauri lib.rs startup sequence (password → sidecar → URL)
- [x] 10.7 useTauri hook for Tauri environment detection
- [x] 10.8 Auto-login for Tauri environment
- [x] 10.9 Window controls and drag region in TopBar
- [x] 10.10 Build scripts for sidecar and Tauri
