# Components

## Key Components

| Component                  | Role                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppLayout`                | IDE shell with resizable left/center/right panels, collapsible via `paneVisibility` prop with slide animations (`AnimatedPane`); `topBar` prop renders the top bar; separators are conditionally rendered based on pane visibility; panel sizes are persisted to server via `config.set` and restored on load via `groupRef.setLayout()`   |
| `Terminal`                 | ghostty-web terminal emulator with OSC 7 CWD and title tracking                                                                                                                                                                                                                                                                            |
| `CodeEditor`               | CodeMirror 6 editor instance                                                                                                                                                                                                                                                                                                               |
| `EditorPane`               | Extracted editor pane (file loading, save, retry)                                                                                                                                                                                                                                                                                          |
| `ContentPane`              | `forwardRef` tab coordinator — `ContentPaneHandle` for imperative tab management, batch close with dirty-file confirmation                                                                                                                                                                                                                 |
| `SplitPaneContextMenu`     | Context menu for pane operations (renamed from `PaneContextMenu`)                                                                                                                                                                                                                                                                          |
| `WorkspaceSidebar`         | Sidebar listing workspaces with expandable worktree sub-items, DnD sortable via `useDroppable`                                                                                                                                                                                                                                             |
| `WorkspaceItem`            | Individual workspace item with expand/collapse chevron, worktree sub-items, context menu, and sortable via `useSortable`                                                                                                                                                                                                                   |
| `CreateWorkspaceDialog`    | Dialog for creating new workspaces                                                                                                                                                                                                                                                                                                         |
| `FileTree`                 | Directory tree with context menu and inline git status                                                                                                                                                                                                                                                                                     |
| `WorkspaceItemContextMenu` | Context menu for workspace items (rename, color, etc.)                                                                                                                                                                                                                                                                                     |
| `WorktreeItem`             | Worktree sub-item in sidebar — shows branch name and path, sortable via `useSortable`, keyboard accessible with `role='button'`                                                                                                                                                                                                            |
| `WorktreeItemContextMenu`  | Context menu for worktree items (Copy Path, Remove Worktree)                                                                                                                                                                                                                                                                               |
| `CreateWorktreeDialog`     | Modal dialog for creating git worktrees (branch name + optional base ref)                                                                                                                                                                                                                                                                  |
| `RightSidebar`             | Project sidebar with toggleable top pane (FileTree/GitPanel) and bottom git history panel. Uses react-resizable-panels for the vertical split                                                                                                                                                                                              |
| `GitPanel`                 | Multi-repo git changes panel — discovers repos, displays per-repo headers with branch selectors and push/fetch buttons, commit message input (Ctrl+Enter), and collapsible staged/unstaged tree views with context menus for stage/unstage/discard/diff. Props: `workspaceId`, `workspaceCwd`, `onOpenEditor`                              |
| `GitHistoryPanel`          | Virtualized git commit history with SVG lane graph (per-row rendering) and infinite scroll. Uses `@tanstack/react-virtual` for virtualization and `react-intersection-observer` for infinite loading                                                                                                                                       |
| `GitRepoHeader`            | Per-repo header with branch selector (`GitBranchSelector`) and push/fetch action buttons                                                                                                                                                                                                                                                   |
| `GitChangesSection`        | Collapsible staged/unstaged changes sections rendered as `GitChangeTree` tree views                                                                                                                                                                                                                                                        |
| `GitBranchSelector`        | Custom dropdown for branch selection, integrating with `git.branches` and `git.checkout`                                                                                                                                                                                                                                                   |
| `GitCommitInput`           | Commit message textarea that submits via Ctrl+Enter, integrating with `git.commit`                                                                                                                                                                                                                                                         |
| `GitChangeTree`            | Recursive tree view for file changes grouped by directory with context menus                                                                                                                                                                                                                                                               |
| `GitChangeContextMenu`     | Context menu for git file change items (stage, unstage, discard, diff)                                                                                                                                                                                                                                                                     |
| `LoginPage`                | Password authentication form                                                                                                                                                                                                                                                                                                               |
| `TabBar`                   | Sortable tab strip — `variant` (content/bottom), context menu, inline rename, accent line, DnD via `useSortable`                                                                                                                                                                                                                           |
| `TabContextMenu`           | Right-click context menu (Close, Close Others, Close to the Right, Rename)                                                                                                                                                                                                                                                                 |
| `BottomPanel`              | `forwardRef` terminal panel — `BottomPanelHandle`, shared `TabBar`, batch close with process-termination confirmation                                                                                                                                                                                                                      |
| `WorkspaceView`            | Top-level workspace view that wraps content in `PaneVisibilityProvider` and composes `TopBar` with `CommandBar` for the top bar; uses inner component pattern (`WorkspaceViewInner`) to consume pane visibility context; `DragDropProvider` for cross-pane terminal tab DnD                                                                |
| `TopBar`                   | Top bar with connection indicator (left), command bar slot (center), pane toggle buttons (right)                                                                                                                                                                                                                                           |
| `WindowControls`           | Extracted Tauri window control buttons (minimize, maximize, close) with hover states; lazily loads `@tauri-apps/api/window`; no-ops when not running in Tauri                                                                                                                                                                              |
| `PaneToggleButtons`        | Extracted pane toggle buttons (workspace/terminal/explorer) with active/hover states; consumed by `TopBar`                                                                                                                                                                                                                                 |
| `Dialog`                   | Generic dialog wrapper with focus trap (Tab cycling), Escape-to-close, backdrop click-to-close, optional form wrapper with Cancel/Submit buttons, and auto-focus first input. Replaces duplicated dialog logic across `CreateWorkspaceDialog`, `CreateWorktreeDialog`, and other modal components                                          |
| `AppContextMenu`           | Generic context menu wrapper built on `@radix-ui/react-context-menu`. Accepts an `items` array of `{ label, action, testId, icon?, destructive?, separatorAfter?, shortcutHint?, content? }` and renders them with consistent styling. Used by all 6 context menus (tab, workspace item, worktree item, git change, file tree, split pane) |
| `CommandBar`               | File search and command palette (activated by click or Ctrl+K, `/` prefix for commands)                                                                                                                                                                                                                                                    |
| `AnimatedPane`             | Slide animation wrapper for collapsible panels                                                                                                                                                                                                                                                                                             |
| `ToastProvider`            | Toast notification system                                                                                                                                                                                                                                                                                                                  |

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

## Accessibility

- Tree nodes have `role="treeitem"`, `tabIndex={0}`, and `aria-expanded` on directories
- Status dots include `aria-label` (e.g. "Git status: modified") and `title` tooltips
- Children containers use `role="group"`
- Keyboard navigation via Enter/Space

### Tab Components

#### Generic Components

Several reusable components were extracted to eliminate duplication across the UI:

- **`Dialog`** — Generic modal wrapper (focus trap, Escape, backdrop click). Accepts `open`, `onClose`, `title`, optional `onSubmit`/`submitLabel`/`submitDisabled`, and `children`. When `onSubmit` is provided, it wraps children in a `<form>` with Cancel/Submit buttons. The `wide` prop expands the card. Used by `CreateWorkspaceDialog`, `CreateWorktreeDialog`, and other dialogs.

- **`AppContextMenu`** — Generic context menu built on Radix. Accepts an `items` array where each item has `label`, `action`, `testId`, plus optional `icon`, `destructive`, `separatorAfter`, `shortcutHint`, `disabled`, and `content` (for custom rendering). Props `minWidth`, `onCloseAutoFocus`, and `extraContent` control menu behavior. Used by all context menus: `TabContextMenu`, `WorkspaceItemContextMenu`, `WorktreeItemContextMenu`, `GitChangeContextMenu`, `FileTree` context menu, and `SplitPaneContextMenu`.

- **`WindowControls`** — Tauri window buttons (minimize/maximize/close) with hover states. Lazily loads `@tauri-apps/api/window`; renders nothing functional when outside Tauri. Extracted from `TopBar`.

- **`PaneToggleButtons`** — Three toggle buttons for workspace (left), terminal (bottom), and explorer (right) pane visibility. Each button reflects its pane's current visibility via opacity/active styling. Extracted from `TopBar`.

### Tab Components

- `TabBar` uses `role="tablist"`; each tab has `role="tab"` with `aria-selected`
- Keyboard navigation: **Arrow Left/Right** to move focus between tabs, **Enter/Space** to activate
- Close buttons have `aria-label="Close tab"` and a visible focus ring (`:focus-visible` outline)
- Context menu items are keyboard-navigable via `@radix-ui/react-context-menu` (arrow keys, Enter, Escape)
- Tab tooltips expose `cwd` (terminal) or `filePath` (editor) via the `title` attribute
