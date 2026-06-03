# Components

## Key Components

| Component                  | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppLayout`                | IDE shell with resizable left/center/right panels, collapsible via `paneVisibility` prop with slide animations (`AnimatedPane`); `topBar` prop renders the top bar; separators are conditionally rendered based on pane visibility; panel sizes are persisted to server via `config.set` and restored on load via `groupRef.setLayout()`                                                                                                                   |
| `Terminal`                 | ghostty-web terminal emulator with OSC 7 CWD and title tracking                                                                                                                                                                                                                                                                                                                                                                                            |
| `CodeEditor`               | CodeMirror 6 editor instance                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `EditorPane`               | Extracted editor pane (file loading, save, retry)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ContentPane`              | **(Legacy)** `forwardRef` tab coordinator — `ContentPaneHandle` for imperative tab management, batch close with dirty-file confirmation; superseded by `SplitLeafPane` in the split-pane architecture                                                                                                                                                                                                                                                      |
| `SplitPaneContextMenu`     | Context menu for pane operations (renamed from `PaneContextMenu`)                                                                                                                                                                                                                                                                                                                                                                                          |
| `WorkspaceSidebar`         | Sidebar listing workspaces with expandable worktree sub-items, DnD sortable via `useDroppable`                                                                                                                                                                                                                                                                                                                                                             |
| `WorkspaceItem`            | Individual workspace item with expand/collapse chevron, worktree sub-items, context menu, and sortable via `useSortable`                                                                                                                                                                                                                                                                                                                                   |
| `CreateWorkspaceDialog`    | Dialog for creating new workspaces                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `FileTree`                 | Directory tree with context menu and inline git status                                                                                                                                                                                                                                                                                                                                                                                                     |
| `WorkspaceItemContextMenu` | Context menu for workspace items (rename, color, etc.)                                                                                                                                                                                                                                                                                                                                                                                                     |
| `WorktreeItem`             | Worktree sub-item in sidebar — shows branch name and path, sortable via `useSortable`, keyboard accessible with `role='button'`                                                                                                                                                                                                                                                                                                                            |
| `WorktreeItemContextMenu`  | Context menu for worktree items (Copy Path, Remove Worktree)                                                                                                                                                                                                                                                                                                                                                                                               |
| `CreateWorktreeDialog`     | Modal dialog for creating git worktrees (branch name + optional base ref)                                                                                                                                                                                                                                                                                                                                                                                  |
| `RightSidebar`             | Project sidebar with toggleable top pane (FileTree/GitPanel) and bottom git history panel. Uses react-resizable-panels for the vertical split; subscribes to push-based `git.statusChange` events via `useGitStatusSubscription` for real-time git status updates                                                                                                                                                                                          |
| `GitPanel`                 | Multi-repo git changes panel — discovers repos, displays per-repo headers with branch selectors and push/fetch buttons, commit message input (Ctrl+Enter), and collapsible staged/unstaged tree views with context menus for stage/unstage/discard/diff. Props: `workspaceId`, `workspaceCwd`, `onOpenEditor`                                                                                                                                              |
| `GitHistoryPanel`          | Virtualized git commit history with SVG lane graph (per-row rendering) and infinite scroll. Uses `@tanstack/react-virtual` for virtualization and `react-intersection-observer` for infinite loading                                                                                                                                                                                                                                                       |
| `GitRepoHeader`            | Per-repo header with collapse toggle, branch selector (`GitBranchSelector`), push/fetch action buttons, git graph button, and `GitRepoMenu` (⋯) for full repository operations                                                                                                                                                                                                                                                                             |
| `GitChangesSection`        | Collapsible staged/unstaged changes sections rendered as `GitChangeTree` tree views                                                                                                                                                                                                                                                                                                                                                                        |
| `GitBranchSelector`        | Custom dropdown for branch selection, integrating with `git.branches` and `git.checkout`                                                                                                                                                                                                                                                                                                                                                                   |
| `GitCommitInput`           | Commit message textarea that submits via Ctrl+Enter, integrating with `git.commit`                                                                                                                                                                                                                                                                                                                                                                         |
| `GitChangeTree`            | Recursive tree view for file changes grouped by directory with context menus                                                                                                                                                                                                                                                                                                                                                                               |
| `GitChangeContextMenu`     | Context menu for git file change items (stage, unstage, discard, diff)                                                                                                                                                                                                                                                                                                                                                                                     |
| `LoginPage`                | Password authentication form                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `TabBar`                   | Sortable tab strip — `variant` (content/bottom), context menu, inline rename, accent line, DnD via `useSortable`; accepts `onSplitRight`, `onSplitDown`, `onClosePane`, `canClosePane` for pane-splitting operations, and `group` for cross-pane DnD identification                                                                                                                                                                                        |
| `TabContextMenu`           | Right-click context menu (Close, Close Others, Close to the Right, Rename)                                                                                                                                                                                                                                                                                                                                                                                 |
| `BottomPanel`              | `forwardRef` terminal panel — `BottomPanelHandle`, shared `TabBar`, batch close with process-termination confirmation                                                                                                                                                                                                                                                                                                                                      |
| `WorkspaceView`            | Top-level workspace view wrapped in `DialogProvider` as the outermost shell, then `ToastProvider`, `PaneVisibilityProvider`, and `FileClipboardProvider`; uses inner component pattern (`WorkspaceViewInner`) to consume pane visibility context; composes `TopBar` with `CommandBar`; `DragDropProvider` for cross-pane terminal tab DnD; orchestrates split-pane layout via `useSplitLayout`, cross-pane tab transfer, and terminal lifecycle management |
| `TopBar`                   | Top bar with connection indicator (left), command bar slot (center), pane toggle buttons (right)                                                                                                                                                                                                                                                                                                                                                           |
| `WindowControls`           | Extracted Tauri window control buttons (minimize, maximize, close) with hover states; lazily loads `@tauri-apps/api/window`; no-ops when not running in Tauri                                                                                                                                                                                                                                                                                              |
| `PaneToggleButtons`        | Extracted pane toggle buttons (workspace/terminal/explorer) with active/hover states; consumed by `TopBar`                                                                                                                                                                                                                                                                                                                                                 |
| `Dialog`                   | Generic dialog shell rendered via `createPortal` at `document.body`, with focus trap (Tab cycling), auto-focus, focus restoration on close, Escape/backdrop-click close, body scroll lock, and optional `role` prop (`'dialog'` \| `'alertdialog'`) for ARIA semantics. Used by `CreateWorkspaceDialog`, `CreateWorktreeDialog`, and `DialogProvider`                                                                                                      |
| `DialogProvider`           | Context provider that manages a queue of confirm/prompt dialogs rendered via portal. Wraps the app at the `WorkspaceView` level; supports concurrent dialogs, each in its own `Dialog` shell                                                                                                                                                                                                                                                               |
| `useConfirm` / `usePrompt` | Promise-based hooks replacing `window.confirm`/`window.prompt`. `useConfirm()` → `Promise<boolean>`, `usePrompt()` → `Promise<string \| null>`. Must be used within `<DialogProvider>`                                                                                                                                                                                                                                                                     |
| `AppDropdownMenu`          | Reusable left-click dropdown menu with submenu support, wrapping `@radix-ui/react-dropdown-menu`. Counterpart to `AppContextMenu` (right-click). Accepts `DropdownMenuItem` and `DropdownMenuSubItem` entries with separators, destructive styling, shortcut hints, disabled states, and custom content rendering. Props: `items`, `minWidth`, `align`, `side`, `onCloseAutoFocus`, `extraContent`                                                         |
| `GenericPicker`            | Reusable searchable item picker dialog with case-insensitive filtering, arrow-key navigation, Enter/Escape handling, and auto-focus. Renders `PickerItem` objects (`id`, `label`, `description?`) inside a `Dialog` shell. Used for branch, stash, and remote selection in git operations                                                                                                                                                                  |
| `GitRepoMenu`              | Full git repository menu with 6 submenus (Commit, Changes, Pull Push, Branch, Remote, Stash) containing 37 commands. Uses `AppDropdownMenu` for rendering and `GenericPicker` for item selection. Integrates `useConfirm`/`usePrompt` for destructive-action confirmation and message input                                                                                                                                                                |
| `AppContextMenu`           | Generic context menu wrapper built on `@radix-ui/react-context-menu`. Accepts an `items` array of `{ label, action, testId, icon?, destructive?, separatorAfter?, shortcutHint?, content? }` and renders them with consistent styling. Used by all 6 context menus (tab, workspace item, worktree item, git change, file tree, split pane)                                                                                                                 |
| `CommandBar`               | File search and command palette (activated by click or Ctrl+K, `/` prefix for commands)                                                                                                                                                                                                                                                                                                                                                                    |
| `AnimatedPane`             | Slide animation wrapper for collapsible panels                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SplitPaneLayout`          | Recursive renderer for pane tree layout using `react-resizable-panels`; renders `PaneNode` leaves as `SplitLeafPane` and `SplitNode` internals as `Group`/`Panel`/`Separator` with configurable direction and resize handles                                                                                                                                                                                                                               |
| `SplitLeafPane`            | Leaf pane component with `TabBar`, terminal/editor/diff/git-tree content areas, and split/close operations; uses `useTerminalPane` for per-pane tab management; exposes `TerminalPanelHandle` via `forwardRef` for imperative cross-pane tab transfer                                                                                                                                                                                                      |
| `ToastProvider`            | Toast notification system                                                                                                                                                                                                                                                                                                                                                                                                                                  |

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

Both `file.tree` and `git.status` are fetched when a workspace is selected. Git status updates are **push-based**: the server emits `git.statusChange` events via WebSocket, and `useGitStatusSubscription` updates status in real time without polling. The `useFileChange` hook subscribes to `file.change` events and refreshes only the file tree on filesystem changes.

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

### `useGitStatusSubscription` Hook

Low-level hook that subscribes to push-based `git.statusChange` WebSocket events for a given workspace.

```tsx
useGitStatusSubscription(
  workspaceId: string | null,
  callback: (repoPath: string, status: GitStatusResponse) => void,
)
```

- **Parameters** — `workspaceId` filters events to a single workspace; `callback` is invoked with the repo path and full `GitStatusResponse` for each update
- **Stable callback** — uses a ref internally so the callback can change between renders without re-subscribing
- **Cleanup** — unsubscribes when `workspaceId` changes or the component unmounts
- **Used by** — `useGitRepos` (updates `repoStatuses` map) and `RightSidebar` (updates its local `gitStatus` state)

## Split-Pane Architecture

The editor area uses a binary tree layout where each leaf is a `SplitLeafPane` and each internal node is a resizable split (`SplitNode`). The tree is managed by `useSplitLayout` and rendered by `SplitPaneLayout`.

```
LayoutNode = PaneNode { type: 'pane', id }
           | SplitNode { type: 'split', id, direction, children: [LayoutNode, LayoutNode], sizes: [string, string] }
```

- **Splitting** — `splitPane()` replaces a `PaneNode` with a `SplitNode` containing the original pane and a new empty pane, both at 50%
- **Removing** — `removePane()` replaces the parent `SplitNode` with the sibling subtree; returns all removed pane IDs
- **Persistence** — layout is serialized to JSON and saved under config key `pane_layout_{workspaceId}` with 300ms debounce
- **Focus** — `focusedPaneId` tracks which pane has focus; panes render a colored border when focused

### `useSplitLayout(workspaceId)`

Manages the pane layout tree state, persistence, and focus tracking.

| Return field       | Description                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `layout`           | Current `LayoutNode` tree                                                                       |
| `paneIds`          | Flat array of all `PaneNode` IDs in the tree                                                    |
| `splitPane`        | Split a pane by ID in a given direction (`'horizontal'` \| `'vertical'`); auto-focuses new pane |
| `removePane`       | Remove a pane by ID; returns `removedPanes` array or `null` if it's the only pane               |
| `setLayout`        | Directly set a new layout tree                                                                  |
| `loadLayout`       | Load persisted layout from server by workspace ID; falls back to single-pane default            |
| `focusedPaneId`    | Currently focused pane ID                                                                       |
| `setFocusedPaneId` | Set the focused pane ID                                                                         |

### `useTerminalPane(options)`

Per-pane tab management hook with server sync. Wraps `useTabs` and adds:

- **Server persistence** — syncs tab create/close/reorder/activate to the server via `tab.create`, `tab.delete`, `tab.reorder`, `tab.update`
- **Tab restoration** — loads tabs from server on workspace switch (`tab.list`), or via `loadRestoredTabs` for session restore
- **Dirty-file protection** — close/close-right/close-others confirm before closing editor tabs with unsaved changes
- **Terminal lifecycle** — sends `terminal.close` on tab close and calls `onTerminalUnregistered`

Options: `{ workspaceId?, pane?, dirtyFiles?, confirmMultipleText?, onTerminalRegistered?, onTerminalUnregistered? }`

### `TerminalPanelHandle`

Unified imperative handle exposed by `SplitLeafPane` (and `BottomPanel`) via `forwardRef`. Wired up by `useTerminalPanelHandle`:

| Method             | Signature                                                              |
| ------------------ | ---------------------------------------------------------------------- |
| `transferTabOut`   | `(tabId: string) => { terminalId, title, cwd?, customTitle? } \| null` |
| `receiveTab`       | `(terminalId, title, cwd?, customTitle?) => string`                    |
| `loadRestoredTabs` | `(workspaceId: string, tabs: PersistedTabInfo[]) => void`              |
| `reorderTabs`      | `(fromIndex: number, toIndex: number) => void`                         |
| `getTabs`          | `() => Tab[]`                                                          |
| `getActiveTabId`   | `() => string \| null`                                                 |
| `updateTabTitle`   | `(tabId: string, title: string) => void`                               |
| `updateTabCwd`     | `(tabId: string, cwd: string) => void`                                 |

### Pane Tree Utilities (`lib/pane-tree.ts`)

| Export                | Purpose                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| `createDefaultLayout` | Returns a single `PaneNode` with a random UUID                                         |
| `collectPaneIds`      | Recursively collects all `PaneNode` IDs from a tree                                    |
| `findNode`            | Finds a node by ID in the tree                                                         |
| `findParentSplit`     | Finds the parent `SplitNode` containing a child by ID                                  |
| `replaceNode`         | Returns a new tree with a target node replaced (immutable)                             |
| `splitPane`           | Splits a pane into a `SplitNode` with original + new pane at 50/50                     |
| `removePane`          | Removes a pane, collapsing its parent split into the sibling; returns removed pane IDs |
| `isOnlyPane`          | Checks if a pane ID is the sole pane in the tree                                       |
| `serializeLayout`     | Serializes the tree to JSON                                                            |
| `deserializeLayout`   | Deserializes JSON to a `LayoutNode` with validation; returns `null` on invalid input   |

## Accessibility

- Tree nodes have `role="treeitem"`, `tabIndex={0}`, and `aria-expanded` on directories
- Status dots include `aria-label` (e.g. "Git status: modified") and `title` tooltips
- Children containers use `role="group"`
- Keyboard navigation via Enter/Space

### Tab Components

#### Generic Components

Several reusable components were extracted to eliminate duplication across the UI:

- **`Dialog`** — Generic dialog shell rendered via `createPortal` to `document.body` (escaping stacking contexts). Props: `open`, `onClose`, `title`, `role?` (`'dialog'` | `'alertdialog'`), `children`, `testId?`, `wide?`. Features: focus trap (Tab cycling), auto-focus first input on open, focus restoration on close, Escape key close, backdrop click close, body scroll lock. Uses `Z_INDEX_DIALOG` (1100) from `theme.ts`. Card is 420px default, expanding to 520px with the `wide` prop. Backdrop is fixed-position `rgba(0, 0, 0, 0.5)` with flex-centered card.

### Dialog System

The dialog system provides promise-based confirm and prompt dialogs, replacing native `window.confirm`/`window.prompt` with styled, themed alternatives.

**`DialogProvider`** wraps the component tree at the `WorkspaceView` level (`DialogProvider` > `ToastProvider` > `PaneVisibilityProvider` > `FileClipboardProvider` > `WorkspaceViewInner`). It maintains an array of active dialogs in state; each call to `showDialog()` pushes a new entry and returns a `Promise<DialogResult>` that resolves when the user interacts with the dialog. Multiple concurrent dialogs are supported — each renders in its own `Dialog` shell via `createPortal`.

**`useConfirm()`** — returns a function that opens a confirm dialog:

```tsx
const confirm = useConfirm();
const confirmed = await confirm({
  title: 'Discard changes?',
  message: 'You have unsaved changes that will be lost.',
  confirmLabel: 'Discard', // optional, defaults to "Confirm"
  danger: true, // optional, styles button as destructive (red)
});
// confirmed: boolean
```

The confirm dialog uses `role="alertdialog"`. When `danger: true`, the confirm button renders with destructive (red) styling.

**`usePrompt()`** — returns a function that opens a prompt dialog with a text input:

```tsx
const prompt = usePrompt();
const name = await prompt({
  title: 'Rename workspace',
  message: 'Enter a new name:',
  defaultValue: currentName, // optional
  placeholder: 'Workspace name', // optional
  submitLabel: 'Rename', // optional, defaults to "Submit"
});
// name: string | null (null if cancelled)
```

The prompt dialog uses `role="dialog"`. Submit is disabled when the input is empty/whitespace. Pressing Enter submits the trimmed value.

Both hooks throw if used outside a `<DialogProvider>`.

The context types live in `contexts/DialogContext.tsx`:

| Type            | Shape                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| `ConfirmConfig` | `{ type: 'confirm', title, message, confirmLabel?, danger? }`                          |
| `PromptConfig`  | `{ type: 'prompt', title, message, defaultValue?, placeholder?, submitLabel? }`        |
| `DialogResult`  | `{ type: 'confirm', confirmed: boolean } \| { type: 'prompt', value: string \| null }` |

- **`AppContextMenu`** — Generic right-click context menu built on `@radix-ui/react-context-menu`. Accepts an `items` array where each item has `label`, `action`, `testId`, plus optional `icon`, `destructive`, `separatorAfter`, `shortcutHint`, `disabled`, and `content` (for custom rendering). Props `minWidth`, `onCloseAutoFocus`, and `extraContent` control menu behavior. Used by all context menus: `TabContextMenu`, `WorkspaceItemContextMenu`, `WorktreeItemContextMenu`, `GitChangeContextMenu`, `FileTree` context menu, and `SplitPaneContextMenu`.

- **`AppDropdownMenu`** — Generic left-click dropdown menu built on `@radix-ui/react-dropdown-menu`. Counterpart to `AppContextMenu`. Supports `DropdownMenuItem` (flat) and `DropdownMenuSubItem` (nested submenu) entry types. Each item supports `label`, `action`, `testId`, plus optional `icon`, `destructive`, `separatorAfter`, `shortcutHint`, `disabled`, `content`, and `style`. Props: `items`, `minWidth`, `align` (`'start'` | `'center'` | `'end'`), `side` (`'top'` | `'bottom'`), `onCloseAutoFocus`, `extraContent`. Used by `GitRepoMenu` for the per-repo actions menu.

- **`GenericPicker`** — Reusable searchable picker dialog built on `Dialog`. Renders a filtered list of `PickerItem` objects (`{ id, label, description? }`) with case-insensitive substring matching on both `label` and `description`. Keyboard navigation via ArrowUp/ArrowDown, Enter to select, Escape to close. Used by `GitRepoMenu` for branch, stash, and remote selection.

- **`WindowControls`** — Tauri window buttons (minimize/maximize/close) with hover states. Lazily loads `@tauri-apps/api/window`; renders nothing functional when outside Tauri. Extracted from `TopBar`.

- **`PaneToggleButtons`** — Three toggle buttons for workspace (left), terminal (bottom), and explorer (right) pane visibility. Each button reflects its pane's current visibility via opacity/active styling. Extracted from `TopBar`.

### Tab Components

- `TabBar` uses `role="tablist"`; each tab has `role="tab"` with `aria-selected`
- Keyboard navigation: **Arrow Left/Right** to move focus between tabs, **Enter/Space** to activate
- Close buttons have `aria-label="Close tab"` and a visible focus ring (`:focus-visible` outline)
- Context menu items are keyboard-navigable via `@radix-ui/react-context-menu` (arrow keys, Enter, Escape)
- Tab tooltips expose `cwd` (terminal) or `filePath` (editor) via the `title` attribute
