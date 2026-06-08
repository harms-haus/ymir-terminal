# Components

## Key Components

| Component                  | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppLayout`                | IDE shell with resizable left/center/right panels, collapsible via `paneVisibility` prop with slide animations (`AnimatedPane`); `topBar` prop renders the top bar; separators are conditionally rendered based on pane visibility; panel sizes are persisted to server via `config.set` and restored on load via `groupRef.setLayout()`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Terminal`                 | ghostty-web terminal emulator with OSC 7 CWD and title tracking; calls [`restoreState()`](#useterminal-hook) on mount to replay buffered VT output from the server, restoring terminal content on page refresh or reconnection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `CodeEditor`               | Monaco Editor instance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `EditorPane`               | Extracted editor pane (file loading, save, retry)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ContentPane`              | **(Legacy, tests only)** `forwardRef` tab coordinator — `ContentPaneHandle` for imperative tab management; superseded by `SplitLeafPane` in the split-pane architecture. Not imported by any production component; still used in tests. Delegates content rendering to `PaneContent`                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SplitPaneContextMenu`     | Context menu for pane operations (renamed from `PaneContextMenu`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `WorkspaceSidebar`         | Sidebar listing workspaces with expandable worktree sub-items, DnD sortable via `useDroppable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `WorkspaceItem`            | Individual workspace item with expand/collapse chevron, worktree sub-items, context menu, sortable via `useSortable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `CreateWorkspaceDialog`    | Dialog for creating new workspaces with name, path (using [`PathAutocompleteInput`](#pathautocompleteinput) with server-side directory autocomplete), and color picker fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `PathAutocompleteInput`    | Autocomplete text input for directory paths — renders a filtered dropdown of server-fetched directory entries below the input; uses [`usePathAutocomplete`](#usepathautocomplete-hook) for debounced fetching and [`parsePathInput`](#parsepathinput-utility) for query extraction; full ARIA combobox pattern with keyboard navigation (Arrow, Tab/Enter accept, Escape close)                                                                                                                                                                                                                                                                                                                                                            |
| `FileTree`                 | Directory tree with context menu and inline git status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `WorkspaceItemContextMenu` | Context menu for workspace items (rename, color, etc.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `WorktreeItem`             | Worktree sub-item in sidebar — shows branch name and path, sortable via `useSortable`, keyboard accessible with `role='button'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `WorktreeItemContextMenu`  | Context menu for worktree items (Copy Path, Remove Worktree)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `CreateWorktreeDialog`     | Modal dialog for creating git worktrees (branch name + optional base ref)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `RightSidebar`             | Project sidebar with toggleable top pane (FileTree/GitPanel/[`SearchPanel`](#searchpanel)) and bottom git history panel. Three tab buttons switch the top pane between file explorer, source control, and search views. Uses react-resizable-panels for the vertical split; subscribes to push-based `git.statusChange` events via `useGitStatusSubscription` for real-time git status updates                                                                                                                                                                                                                                                                                                                                             |
| `GitPanel`                 | Multi-repo git changes panel — discovers repos, displays per-repo headers with branch selectors and push/fetch buttons, commit message input (Ctrl+Enter), and collapsible staged/unstaged tree views with context menus for stage/unstage/discard/diff. Props: `workspaceId`, `workspaceCwd`, `onOpenEditor`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GitHistoryPanel`          | Virtualized git commit history with SVG lane graph (per-row rendering) and infinite scroll. Uses `@tanstack/react-virtual` for virtualization and `react-intersection-observer` for infinite loading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GitRepoHeader`            | Per-repo header with collapse toggle, branch selector (`GitBranchSelector`), push/fetch action buttons, git graph button, and `GitRepoMenu` (⋯) for full repository operations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GitChangesSection`        | Collapsible staged/unstaged changes sections rendered as `GitChangeTree` tree views                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GitBranchSelector`        | Custom dropdown for branch selection, integrating with `git.branches` and `git.checkout`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GitCommitInput`           | Commit message textarea that submits via Ctrl+Enter, integrating with `git.commit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GitChangeTree`            | Recursive tree view for file changes grouped by directory with context menus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GitChangeContextMenu`     | Context menu for git file change items (stage, unstage, discard, diff)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `LoginPage`                | Password authentication form with title, subtitle, and password input. Rendered inside a flex column wrapper with `WindowTitleBar` above when not authenticated. The `ConnectionManagerPopover` is now in the `WindowTitleBar`, not the login card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `TabBar`                   | Sortable tab strip — `variant` (content/bottom), context menu, inline rename, accent line, DnD via `useSortable`; accepts `onSplitRight`, `onSplitDown`, `onClosePane`, `canClosePane` for pane-splitting operations, `group` for cross-pane DnD identification                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `TabContextMenu`           | Right-click context menu (Close, Close Others, Close to the Right, Rename)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `BottomPanel`              | `forwardRef` terminal panel — `BottomPanelHandle`, shared `TabBar`, batch close with process-termination confirmation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `WorkspaceView`            | Top-level workspace view wrapped in `DialogProvider` as the outermost shell, then `ToastProvider`, `PaneVisibilityProvider`, and `FileClipboardProvider`; reads `connectionUrl` via [`useConnectionUrl()`](#connectionurlcontext) and passes `key={connectionUrl}` to `WorkspaceViewInner`, forcing a full remount when the server URL changes so all state (tabs, terminals, workspaces, git data) is properly reset; composes `TopBar` with `CommandBar`; `DragDropProvider` for cross-pane terminal tab DnD; orchestrates split-pane layout via `useSplitLayout`, cross-pane tab transfer, and terminal lifecycle management; shows a branded loading screen (`WindowTitleBar` + `YmirLogo` + spinner) while pane visibility is loading |
| `TopBar`                   | Top bar with `ConnectionManagerPopover` (left), command bar slot (center), pane toggle buttons (right)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ConnectionManagerPopover` | Radix Popover-based connection manager rendered in the `TopBar` and the `WindowTitleBar`. Container that composes `ConnectionForm` and `ConnectionList` sub-components. Manages trigger button (status dot + host:port), current connection section (save favorite / disconnect), popover open state, and form state. Uses `useConnectionManager` hook and `@radix-ui/react-popover`                                                                                                                                                                                                                                                                                                                                                       |
| `ConnectionForm`           | Host/port input form with a Connect button and an optional "Connect to Local Server" button (Tauri only). Re-exported from `ConnectionManagerPopover.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ConnectionList`           | Scrollable favorites list and recent connections list with connect (→) and delete (×) actions. Re-exported from `ConnectionManagerPopover.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `WindowTitleBar`           | Simplified window decoration bar for login and loading screens. Has drag region (`data-tauri-drag-region="deep"`), `ConnectionManagerPopover` (left), optional children (center), `WindowControls` (right, Tauri only). Requires `ConnectionUrlProvider` and `AuthProvider` ancestors                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `YmirLogo`                 | Inline SVG logo component with configurable `size` prop (default 120px). Renders the Ymir "Y" shape icon as an SVG with `data-testid="ymir-logo"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `WindowControls`           | Extracted Tauri window control buttons (minimize, maximize, close) with hover states; lazily loads `@tauri-apps/api/window`; no-ops when not running in Tauri                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `useTauriMaximize`         | Shared hook (`lib/tauri.ts`) that returns a stable callback to toggle the current window's maximized state via `@tauri-apps/api/window`. No-op outside Tauri. Used by both `TopBar` and `WindowTitleBar` for double-click-to-maximize                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `PaneToggleButtons`        | Extracted pane toggle buttons (workspace/terminal/explorer) with active/hover states; consumed by `TopBar`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Dialog`                   | Generic dialog shell rendered via `createPortal` at `document.body`, with focus trap (Tab cycling), auto-focus, focus restoration on close, Escape/backdrop-click close, body scroll lock, and optional `role` prop (`'dialog'` \| `'alertdialog'`) for ARIA semantics. Focus trap and Escape close respect `defaultPrevented`, allowing nested controls (e.g. [`PathAutocompleteInput`](#pathautocompleteinput)) to handle Tab/Escape first. Used by `CreateWorkspaceDialog`, `CreateWorktreeDialog`, `MergeWorktreeDialog`, `RemoveWorktreeDialog`, `GenericPicker`, and `DialogProvider`                                                                                                                                                |
| `DialogProvider`           | Context provider that manages a queue of confirm/prompt dialogs rendered via portal. Wraps the app at the `WorkspaceView` level; supports concurrent dialogs, each in its own `Dialog` shell                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `useConfirm` / `usePrompt` | Promise-based hooks replacing `window.confirm`/`window.prompt`. `useConfirm()` → `Promise<boolean>`, `usePrompt()` → `Promise<string \| null>`. Must be used within `<DialogProvider>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `AppDropdownMenu`          | Reusable left-click dropdown menu with submenu support, wrapping `@radix-ui/react-dropdown-menu`. Counterpart to `AppContextMenu` (right-click). Accepts `DropdownMenuItem` and `DropdownMenuSubItem` entries with separators, destructive styling, shortcut hints, disabled states, and custom content rendering. Props: `items`, `minWidth`, `align`, `side`, `onCloseAutoFocus`, `extraContent`                                                                                                                                                                                                                                                                                                                                         |
| `GenericPicker`            | Reusable searchable item picker dialog with case-insensitive filtering, arrow-key navigation, Enter/Escape handling, and auto-focus. Renders `PickerItem` objects (`id`, `label`, `description?`) inside a `Dialog` shell. Used for branch, stash, and remote selection in git operations                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GitRepoMenu`              | Full git repository menu with 6 submenus (Commit, Changes, Pull Push, Branch, Remote, Stash) containing 37 commands. Uses `AppDropdownMenu` for rendering and `GenericPicker` for item selection. Integrates `useConfirm`/`usePrompt` for destructive-action confirmation and message input. Sub-menu definitions extracted into `git-menu/` directory (see [Git Menu Directory](#git-menu-directory-git-menu))                                                                                                                                                                                                                                                                                                                            |
| `AppContextMenu`           | Generic context menu wrapper built on `@radix-ui/react-context-menu`. Accepts an `items` array of `{ label, action, testId, icon?, destructive?, separatorAfter?, shortcutHint?, content? }` and renders them with consistent styling. Used by all 6 context menus (tab, workspace item, worktree item, git change, file tree, split pane)                                                                                                                                                                                                                                                                                                                                                                                                 |
| `CommandBar`               | File search and command palette (activated by click or Ctrl+K, `/` prefix for commands)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `AnimatedPane`             | Slide animation wrapper for collapsible panels                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SplitPaneLayout`          | Recursive renderer for pane tree layout using `react-resizable-panels`; renders `PaneNode` leaves as `SplitLeafPane` and `SplitNode` internals as `Group`/`Panel`/`Separator` with configurable direction and resize handles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SplitLeafPane`            | Leaf pane component with `TabBar`, content rendering via `PaneContent`, and split/close operations; uses `useTerminalPane` for per-pane tab management; exposes `TerminalPanelHandle` via `forwardRef` for imperative cross-pane tab transfer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `PaneContent`              | Shared content renderer that displays the active tab's body — delegates to `EditorPane` (editor tabs), `DiffViewer` (diff tabs), `GitTreeTab` (git-tree tabs), or a terminal container div based on `activeTab.type`. Used by both `ContentPane` (legacy) and `SplitLeafPane`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `FileTreeContext`          | React context providing file-tree actions (`onNewFile`, `onNewFolder`, `onRename`, `onDelete`, `onCut`, `onCopy`, `onPaste`) plus `clipboardHasItem` and `workspaceCwd`. Eliminates prop drilling through the file tree hierarchy. Consumed via the `useFileTreeContext()` hook, which throws if used outside a `FileTreeContext.Provider`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `DiffViewerHeader`         | Header bar for `DiffViewer` — displays file name (with commit SHA for commit diffs), additions/deletions counts, a toggle between 'changes only' and 'inline diff' view modes (`DiffViewMode`), and an 'Open in Editor' button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `MergeWorktreeDialog`      | Modal dialog for merging a worktree branch into a target branch. Options: delete worktree after merge (checkbox), and selective file copying (displays configured + untracked files from `useWorktreeCopyFiles` as checkboxes). Uses `Dialog` with `wide` prop                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `RemoveWorktreeDialog`     | Confirmation dialog for removing a worktree. Option: force delete (checkbox) to remove even with uncommitted changes. Uses destructive (red) styling for the confirm button via `Dialog`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SearchPanel`              | File content search UI with find/replace inputs, search option toggles (case-sensitive, whole-word, regex, include pattern), and streaming results via [`useFileContentSearch`](#usefilecontentsearch-hook). Supports bulk replace via `file.search.replace` request                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SearchResults`            | Renders search result file groups — status bar (match/file counts), collapsible per-file sections via [`CollapsibleSection`](#collapsiblesection), and clickable result lines that navigate to file:line. Shows truncated-results warning when server caps output                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `SearchResultLine`         | Renders a single result line with highlighted match regions. In find mode, matches are highlighted; in replace mode, the original text is struck through and the replacement text is shown inline. Long lines are center-truncated around the first match via [`truncateLine`](#truncateline-utility)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `CollapsibleSection`       | Reusable collapsible section with toggle chevron, title content, optional count badge, and optional action buttons. Used by `SearchResults` for per-file groups and by `GitChangesSection` for staged/unstaged change groups                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `useFileContentSearch`     | Hook managing streaming file content search — sends `file.search` request, subscribes to `file.search.progress` WebSocket events for incremental results, and provides `search`, `clearResults`, and `abort` controls. See [useFileContentSearch Hook](#usefilecontentsearch-hook)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ToastProvider`            | Toast notification system                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Project Sidebar

The right sidebar (`RightSidebar`) is a vertically resizable panel layout with a header labeled "Project" containing three toggle buttons:

- **📁 (File Explorer)** — shows the file tree in the top pane
- **⎇ (Source Control)** — shows staged/unstaged git changes (`GitPanel`) in the top pane
- **🔍 (Search)** — shows file content search ([`SearchPanel`](#searchpanel)) in the top pane

```
┌─────────────────────────────────────┐
│  Project          [📁] [⎇] [🔍]    │  ← header with toggle buttons
├─────────────────────────────────────┤
│                                     │
│  Top Pane (60%)                     │  ← FileTree OR GitPanel OR SearchPanel
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

`workspaceCwd` flows from `WorkspaceView` → `RightSidebar` → `FileTree`/`SearchPanel` and is used to compute relative paths for git status lookups and search queries.

**Props:**

| Prop                  | Type                                     | Description                                                                                 |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `workspaceId`         | `string \| null`                         | Active workspace ID                                                                         |
| `workspaceCwd`        | `string`                                 | Workspace root path                                                                         |
| `onFileSelect`        | `(path: string) => void`                 | Callback to open a file in the editor                                                       |
| `onOpenDiff`          | `(filePath, repoPath, staged) => void`   | Callback to open a diff view                                                                |
| `onOpenGitTree`       | `(repoPath) => void`                     | Callback to open git-tree tab                                                               |
| `onCommitClick`       | `(commitSha) => void`                    | Callback when a commit in history is clicked                                                |
| `onSearchResultClick` | `(filePath: string, lineNumber) => void` | Callback when a search result line is clicked; falls back to `onFileSelect` if not provided |

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

| Field / Method   | Description                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `repos`          | Discovered repository list with paths and relative paths; populated progressively as repos are discovered during BFS traversal      |
| `repoStatuses`   | Map of repo path → `GitStatusResponse` (including `hasRemote`, `ahead`, `behind`); updated incrementally as each repo is discovered |
| `repoBranches`   | Map of repo path → branch list; updated incrementally alongside repo statuses                                                       |
| `loading`        | Whether repo discovery is in progress; repos appear incrementally while `true` rather than all at once after completion             |
| `error`          | Error message string if the last operation failed, or `null`                                                                        |
| `stageFiles`     | Stage files in a repo (`git.stage`)                                                                                                 |
| `unstageFiles`   | Unstage files in a repo (`git.unstage`)                                                                                             |
| `discardChanges` | Discard unstaged changes (`git.discard`)                                                                                            |
| `commit`         | Commit staged changes (`git.commit`); returns commit hash                                                                           |
| `checkout`       | Switch or create a branch (`git.checkout`)                                                                                          |
| `push`           | Push to remote (`git.push`)                                                                                                         |
| `fetch`          | Fetch from remote (`git.fetch`)                                                                                                     |
| `refresh`        | Re-discover repos and refresh all status/branch data                                                                                |
| `refreshRepo`    | Refresh status (and optionally branches) for a single repo                                                                          |
| `pushLoading`    | Map of repo path → boolean push-in-progress state                                                                                   |
| `fetchLoading`   | Map of repo path → boolean fetch-in-progress state                                                                                  |

#### Progressive Repo Discovery

Repos are not loaded in a single batch. Instead, discovery uses a two-phase approach:

1. **Progressive loading via `git.repoDiscovery.progress` events** — the hook subscribes to these WebSocket events (filtered by channel and `workspaceId`) via `wsClient.onMessage`. As the server's BFS traversal completes each depth level, it emits a progress event containing newly discovered repos. The hook:
   - Appends new repos to the `repos` array immediately (skipping duplicates via an `existingPaths` set)
   - Fetches `git.status` and `git.branches` for each new repo in parallel using the current `AbortController` signal
   - Updates `repoStatuses` and `repoBranches` maps as each response arrives
2. **Reconciliation via `git.repoDiscovery` response** — the final discovery response returns the complete sorted repo list. The hook sets `repos` to this canonical list and fetches status/branches only for repos not already covered by progress events (tracked via `fetchedRepoPathsRef`)

**State protection:** A `generationRef` counter increments on each discovery cycle. All state updates and async responses are guarded against the current generation — stale responses from a previous workspace context are silently discarded. A `discoveryCompleteRef` flag prevents late-arriving progress events from corrupting state after the final reconciliation.

**Visual effect:** The `GitPanel` renders repos as they appear in the list, so users see repos populate incrementally while `loading` is `true`. Empty-state messages ("Not a git repository", "Loading…") are only shown when `repos.length === 0`.

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

## File Content Search

The file content search system provides streaming, full-text search across workspace files with optional replace. It is composed of four components and one hook:

```
SearchPanel
  └─ useFileContentSearch (hook)
       ├─ sendRequest('file.search')          → initiates search
       └─ wsClient.onMessage('file.search.progress') → streaming results
  └─ SearchResults
       ├─ StatusBar (match/file counts)
       └─ FileGroup (per file)
            └─ CollapsibleSection
            └─ ResultLine (per match)
                 └─ SearchResultLine (highlighted match text)
                      └─ truncateLine (utility)
```

### `SearchPanel`

Top-level search panel rendered in the [`RightSidebar`](#project-sidebar) top pane when the search tab is active. Manages search query state with 300ms debounce, search option toggles, and optional replace functionality.

**Props:**

| Prop            | Type                                             | Description                                                              |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `workspaceId`   | `string \| null`                                 | Active workspace ID; renders "No workspace selected" when `null`         |
| `workspaceCwd`  | `string`                                         | Workspace root path (passed to search, not currently used for filtering) |
| `onFileSelect`  | `(path: string) => void`                         | Callback when a file name in results is clicked                          |
| `onResultClick` | `(filePath: string, lineNumber: number) => void` | Callback when a specific result line is clicked (navigates to file:line) |

**UI sections (top to bottom):**

1. **Find input row** — search text input with a toggle button to show/hide the replace row (uses `codicon-replace` icon)
2. **Options row** — four toggle controls:
   - **Match Case** (`codicon-case-sensitive`) — case-sensitive search
   - **Match Whole Word** (`codicon-whole-word`) — whole-word matching
   - **Use Regular Expression** (`codicon-regex`) — regex mode
   - **Files to include** — glob pattern input for filtering files
3. **Replace row** (collapsible) — replace text input with a "Replace All" button that sends `file.search.replace` and re-triggers the search
4. **Error banner** — inline error display (red text)
5. **Results area** — [`SearchResults`](#searchresults) component in a scrollable container

**Debounce logic:** The query is debounced at 300ms (instant clear when query becomes empty). Search is triggered when the debounced query or any search option (`caseSensitive`, `wholeWord`, `useRegex`, `includePattern`) changes.

**Replace behavior:** The "Replace All" button sends a `file.search.replace` request with the current query, replacement text, and search options. After success, it re-triggers the search to show updated results. The button is disabled while a replace is in progress or when the query is empty.

### `SearchResults`

Renders the search result list with a status bar and per-file collapsible groups. Receives all search state from [`useFileContentSearch`](#usefilecontentsearch-hook) via `SearchPanel`.

**Props:**

| Prop            | Type                                             | Description                                                               |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `results`       | `FileSearchFileResult[]`                         | Array of file results, each with `path`, `relativePath`, and `matches[]`  |
| `totalMatches`  | `number`                                         | Total match count across all files                                        |
| `fileCount`     | `number`                                         | Number of files with matches                                              |
| `truncated`     | `boolean`                                        | Whether results were capped by the server                                 |
| `isSearching`   | `boolean`                                        | Whether a search is in progress                                           |
| `isComplete`    | `boolean`                                        | Whether the search has finished                                           |
| `replaceText`   | `string \| undefined`                            | When set, result lines render in replace mode (strikethrough + insertion) |
| `onFileClick`   | `(filePath: string) => void`                     | Callback when a file header is clicked                                    |
| `onResultClick` | `(filePath: string, lineNumber: number) => void` | Callback when a result line is clicked (navigates to file:line)           |

**Sub-components (file-private):**

- **`StatusBar`** — displays "Searching..." while in progress, then "{totalMatches} results in {fileCount} files" on completion. Shows a red "(results limited)" warning when `truncated` is true.
- **`FileGroup`** — wraps each file's results in a [`CollapsibleSection`](#collapsiblesection). The title shows a file icon, bold file name (clickable via `onFileClick`), and dim directory path. The count badge shows the number of matches in that file.
- **`ResultLine`** — clickable row for each match, displaying the line number and a [`SearchResultLine`](#searchresultline) with highlighted submatches. Keyboard-accessible (`role="button"`, Enter/Space activation).

**Empty states:** Returns `null` when no results exist and no search is active. Shows "No results found. Try adjusting your search terms or filters." when a search completes with zero results.

### `SearchResultLine`

Renders a single line of search result text with highlighted match regions. Supports two display modes controlled by the `replaceText` prop:

- **Find mode** (`replaceText` undefined) — match regions are rendered with highlighted background/text colors
- **Replace mode** (`replaceText` set) — original match text is struck through with dim color; replacement text is rendered inline with a green-tinted background

**Props:**

| Prop              | Type                   | Description                                            |
| ----------------- | ---------------------- | ------------------------------------------------------ |
| `lineText`        | `string`               | Full line content                                      |
| `submatches`      | `FileSearchSubmatch[]` | Array of `{ matchText, start, end }` match regions     |
| `replaceText`     | `string \| undefined`  | Replacement text; when set, renders in replace mode    |
| `maxDisplayWidth` | `number`               | Maximum character width before truncation (default 80) |

**Rendering:** Walks through `adjustedSubmatches` (produced by [`truncateLine`](#truncateline-utility)) and emits `<span>` segments: plain text in muted color before/between/after matches, then highlighted or struck-through+replacement spans for match regions. Ellipsis indicators (`...`) appear at the start or end when the line is truncated.

#### `truncateLine` Utility

Pure exported function that center-truncates a line around the first match to fit within a display width. Only truncates when `lineText.length > maxDisplayWidth`.

```tsx
truncateLine(lineText: string, submatches: FileSearchSubmatch[], maxDisplayWidth?: number): TruncateResult
```

**Algorithm:**

1. If the line fits within `maxDisplayWidth` (default 80), returns it unchanged
2. Centers a window of `maxDisplayWidth` characters around the midpoint of the first submatch
3. Slides the window left if it hits the right edge before filling
4. Adjusts all submatch `start`/`end` offsets relative to the window start
5. Filters out submatches that fall entirely outside the window

**Return type:**

| Field                | Type                   | Description                                     |
| -------------------- | ---------------------- | ----------------------------------------------- |
| `displayText`        | `string`               | The truncated line text                         |
| `adjustedSubmatches` | `FileSearchSubmatch[]` | Submatch offsets adjusted to the truncated text |
| `prefixEllipsis`     | `boolean`              | Whether text was removed from the start         |
| `suffixEllipsis`     | `boolean`              | Whether text was removed from the end           |

### `CollapsibleSection`

Reusable collapsible container component with a clickable header, chevron indicator, optional count badge, and optional action slot. Used by both search results and git change sections.

**Props:**

| Prop              | Type                    | Description                                                         |
| ----------------- | ----------------------- | ------------------------------------------------------------------- |
| `title`           | `React.ReactNode`       | Header content (supports rich rendering, e.g. clickable file names) |
| `count`           | `number`                | Optional count badge (only shown when > 0)                          |
| `defaultExpanded` | `boolean`               | Initial expanded state (default `true`)                             |
| `renderActions`   | `() => React.ReactNode` | Optional action buttons rendered in the header right slot           |
| `testId`          | `string`                | Optional `data-testid` attribute                                    |
| `children`        | `React.ReactNode`       | Content rendered when expanded                                      |

**Accessibility:** The header has `role="button"`, `tabIndex={0}`, and `aria-expanded`. Keyboard-toggleable via Enter/Space.

**Used by:** `SearchResults` (per-file groups) and `GitChangesSection` (staged/unstaged sections).

### `useFileContentSearch` Hook

Hook (`hooks/useFileContentSearch.ts`) that manages streaming file content search for a workspace. Handles search initiation, real-time result streaming via WebSocket progress events, race-condition protection, and abort/cleanup.

```tsx
const {
  results,
  isSearching,
  isComplete,
  totalMatches,
  fileCount,
  truncated,
  error,
  search,
  clearResults,
  abort,
} = useFileContentSearch(workspaceId);
```

**Parameter:** `workspaceId: string | null` — results are cleared when this changes.

**Returns:**

| Field          | Type                       | Description                                                                        |
| -------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| `results`      | `FileSearchFileResult[]`   | Accumulated file results, appended incrementally as progress events arrive         |
| `isSearching`  | `boolean`                  | Whether a search request is in flight                                              |
| `isComplete`   | `boolean`                  | Whether the search has finished (all progress events received or request resolved) |
| `totalMatches` | `number`                   | Total match count across all files                                                 |
| `fileCount`    | `number`                   | Number of files with at least one match                                            |
| `truncated`    | `boolean`                  | Whether the server capped results                                                  |
| `error`        | `string \| null`           | Error message from a failed search                                                 |
| `search`       | `(query, options) => void` | Initiates a new search (see below)                                                 |
| `clearResults` | `() => void`               | Resets all state to initial values                                                 |
| `abort`        | `() => void`               | Aborts the in-flight search and unsubscribes from progress events                  |

**`search(query, options)`:**

- Aborts any previous in-flight search via `AbortController`
- Increments an epoch counter to discard stale responses
- Resets all result state
- Subscribes to `file.search.progress` WebSocket events (filtered by channel and `workspaceId`)
- Sends `file.search` request with `{ workspaceId, query, ...options }`
- As progress events arrive, appends `fileResult` to `results` and updates `totalMatches`/`fileCount`
- When `done: true` is received in a progress event, marks `isComplete`
- When the `file.search` response resolves, also marks `isComplete` (handles non-streaming fallback)
- Stale responses from a previous epoch are silently discarded

**`SearchOptions`:**

| Field            | Type      | Description                     |
| ---------------- | --------- | ------------------------------- |
| `caseSensitive`  | `boolean` | Case-sensitive matching         |
| `wholeWord`      | `boolean` | Whole-word matching             |
| `useRegex`       | `boolean` | Regular expression mode         |
| `includePattern` | `string`  | Glob pattern for file inclusion |

**Cleanup:** Aborts in-flight requests and unsubscribes from WebSocket events on unmount and when `workspaceId` changes.

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

### `useTerminal` Hook

Low-level hook (`hooks/useTerminal.ts`) that manages terminal I/O for a single terminal instance. Accepts a `terminalId` (or `null`) and provides methods for bidirectional data flow, lifecycle management, and state restoration.

| Method           | Signature                                                             | Description                                                                                                                           |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `sendData`       | `(data: string) => void`                                              | Encodes keystroke/escape-sequence data as base64 and sends it to the server via `terminal.input`                                      |
| `onOutput`       | `(handler: (data: string) => void) => () => void`                     | Registers an output handler; returns an unsubscribe function. Handlers are stored in a ref array and invoked for each VT chunk        |
| `createTerminal` | `(workspaceId: string, cwd?: string) => Promise<string>`              | Creates a new terminal on the server via `terminal.create`; returns the new `terminalId`                                              |
| `closeTerminal`  | `() => Promise<void>`                                                 | Closes the terminal on the server via `terminal.close`                                                                                |
| `resizeTerminal` | `(cols: number, rows: number) => void`                                | Sends `terminal.resize` to the server (fire-and-forget, no request/response)                                                          |
| `requestState`   | `() => Promise<{ data: string; cols: number; rows: number } \| null>` | Requests the current terminal state snapshot from the server via `terminal.state`; returns `null` on error or if `terminalId` is null |
| `restoreState`   | `() => Promise<void>`                                                 | Orchestrates full state restoration with event buffering (see below)                                                                  |

#### State Restoration and Event Buffering

`restoreState()` ensures no terminal output is lost during the window between requesting a state snapshot and receiving it. It uses a two-phase approach gated by `isRestoringRef`:

1. **Buffer phase** — Sets `isRestoringRef.current = true` and clears `pendingEventsRef`. While this flag is set, the `terminal.output` WebSocket handler queues incoming VT data into `pendingEventsRef` instead of dispatching it to output handlers.
2. **Snapshot replay** — Calls `requestState()` to fetch the server's current terminal state snapshot. If the response contains data, it is base64-decoded and replayed through all registered `outputHandlers`.
3. **Queued-event replay** — After the snapshot is written, all events accumulated in `pendingEventsRef` during the buffer phase are replayed through `outputHandlers` in order, catching up on any output that arrived while the snapshot was in flight.
4. **Cleanup** — `isRestoringRef` is reset to `false` and `pendingEventsRef` is cleared in a `finally` block, even if the request fails.

This guarantees correct ordering: the restored snapshot is written first, then any live events that occurred during the request are appended after, producing a seamless terminal restoration experience on page refresh or WebSocket reconnection.

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

## Sub-Directory Modules

Several complex components have been decomposed into dedicated sub-directories for maintainability.

### Git Menu Directory (`git-menu/`)

The `GitRepoMenu` component's 37 commands are organized into 7 files within `components/git-menu/`. Each sub-menu builder is a pure function that accepts a [`MenuContext`](#menucontext) and returns a `DropdownMenuSubItem` ready for `AppDropdownMenu`.

| File                   | Export              | Purpose                                                          |
| ---------------------- | ------------------- | ---------------------------------------------------------------- |
| `types.ts`             | `MenuContext`       | Shared context: `confirm`, `prompt`, `doAction`, `pickItem`      |
|                        | `MenuBuilder`       | Type alias: `(ctx: MenuContext) => DropdownMenuSubItem`          |
| `commitMenuItems.ts`   | `commitMenuItems`   | Commit submenu (commit, amend, reset)                            |
| `changesMenuItems.ts`  | `changesMenuItems`  | Changes submenu (stage all, unstage all, discard all, stash)     |
| `pullPushMenuItems.ts` | `pullPushMenuItems` | Pull/push submenu (pull, push, fetch, force push)                |
| `branchMenuItems.ts`   | `branchMenuItems`   | Branch submenu (checkout, create, rename, delete, merge, rebase) |
| `remoteMenuItems.ts`   | `remoteMenuItems`   | Remote submenu (add, remove, rename, set-url)                    |
| `stashMenuItems.ts`    | `stashMenuItems`    | Stash submenu (push, pop, apply, drop, list, branch)             |

#### `MenuContext`

Shared by all menu builders. Provides:

- **`confirm`** — opens a confirm dialog via `useConfirm`, returns `Promise<boolean>`
- **`prompt`** — opens a prompt dialog via `usePrompt`, returns `Promise<string | null>`
- **`doAction`** — wraps an async action with loading state and error toasting via `sonner`
- **`pickItem`** — opens a `GenericPicker` dialog for branch/stash/remote selection, returns the selected `id` or `null`

### Git Tree Directory (`git-tree/`)

The `GitTreeTab` component is decomposed into 7 files within `components/git-tree/`. A barrel `index.ts` re-exports all public components and types.

| File                  | Export            | Purpose                                                                                          |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| `index.ts`            | (barrel)          | Re-exports all public components and types                                                       |
| `types.ts`            | `CommitDetail`    | Type: `{ body: string, files: GitCommitFileChange[] }` for expanded commit details               |
| `GitTreeTab.tsx`      | `GitTreeTab`      | Top-level tab component — manages filter state, commit expansion, detail fetching, and scrolling |
| `GitCommitList.tsx`   | `GitCommitList`   | Virtualized commit list using `@tanstack/react-virtual`; renders `TreeRow` per commit            |
| `GitCommitDetail.tsx` | `GitCommitDetail` | Expanded commit detail view — commit body, author, file change list (`FileRow` per file)         |
| `GitCommitFilter.tsx` | `GitCommitFilter` | Filter input bar — case-insensitive substring match on commit message and author                 |
| `FileRow.tsx`         | `FileRow`         | Single file change row — status indicator, file path, additions/deletions counts; clickable      |
| `TreeRow.tsx`         | `TreeRow`         | Single commit row — chevron, `CommitGraphRow` SVG, subject, relative time, expandable detail     |

**Data flow:** `GitTreeTab` uses `usePaginatedGitLog` for infinite-scroll commit loading. `GitCommitList` handles virtualization via `@tanstack/react-virtual` and lane graph computation via `computeLanes`/`computeActiveLanes`. Each `TreeRow` renders a `CommitGraphRow` for the SVG lane graph and a `GitCommitDetail` when expanded. `GitCommitDetail` fetches commit details on demand via `git.commitDetails` and caches results in `detailsCache`.

**Scroll-to-highlight:** When `highlightCommitSha` is set, `GitTreeTab` activates the matching commit's tab, expands it, and scrolls the virtualizer to center on it.

### Git Graph Directory (`git-graph/`)

| File                 | Export           | Purpose                                                                                                                                                    |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CommitGraphRow.tsx` | `CommitGraphRow` | Pure `memo`-ized SVG renderer for a single commit-graph row. Draws pass-through vertical lines, cubic bezier merge/split curves, and a commit-node circle. |

`CommitGraphRow` is shared by both `GitHistoryPanel` (right sidebar) and `GitTreeTab` (editor pane). It consumes `LaneInfo` and `ActiveLane` types from `lib/git-graph`, along with `LANE_WIDTH` and `GRAPH_LEFT_PADDING` constants, and reads `GIT_GRAPH_COLORS` from `lib/theme.ts`.

Props: `{ info: LaneInfo, graphWidth: number, activeLanes: ActiveLane[], rowHeight?: number }` (default `rowHeight` = 24px).

## Connection Manager

The `ConnectionManagerPopover` is rendered in two locations: the `TopBar`'s left slot and the `WindowTitleBar`'s left slot (the simplified title bar shown on login and loading screens). It provides a compact status indicator and a popover for managing WebSocket connections.

The popover's content has been decomposed into two sub-components (`ConnectionForm` and `ConnectionList`), both re-exported from `ConnectionManagerPopover.tsx` so consumers can import them from either path.

### Trigger Button

A small button showing a colored **status dot** (green = connected, amber = reconnecting, accent = connecting, grey = disconnected) followed by the current `host:port` (or "Disconnected" text). The trigger uses `aria-label` that reflects the current status and connection details.

### Popover Sections

The popover (`@radix-ui/react-popover`) is divided into sections separated by horizontal rules. The `ConnectionManagerPopover` itself renders the **Current Connection** section and acts as the container; the remaining sections are handled by two extracted sub-components:

1. **Current Connection** (inline in `ConnectionManagerPopover`) — Status label and `host:port` detail. When connected, shows a "★ Save as Favorite" button (hidden if already favorited) and a "Disconnect" button.
2. **Connect to Server** ([`ConnectionForm`](#connectionform)) — Host and port inputs with a "Connect" button. Validates that host matches `/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/` and port is a positive integer. On Tauri, also shows a "Connect to Local Server" button that connects to `127.0.0.1` using the sidecar port from `window.__YMIR_SIDECAR_PORT` or the Tauri config.
3. **Favorites** ([`ConnectionList`](#connectionlist)) — Scrollable list of saved connections (`ConnectionEntry[]`). Each item has a connect button (→) and a delete button (×) with confirmation via `useConfirm`. Section is hidden when empty.
4. **Recent** ([`ConnectionList`](#connectionlist)) — Scrollable list of up to 10 recent connections (`RecentConnection[]`), sorted by `lastConnectedAt` descending. Each item has a connect button (→). A "Clear" button removes all recent entries. Section is hidden when empty.

### `ConnectionForm`

Renders the host/port input row, Connect button, and optional Local Connect button.

**Source:** `components/connection-manager/ConnectionForm.tsx` — re-exported from `ConnectionManagerPopover.tsx`.

**Props (`ConnectionFormProps`):**

| Prop               | Type                      | Description                                                                                 |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------- |
| `host`             | `string`                  | Current host input value (controlled)                                                       |
| `onHostChange`     | `(value: string) => void` | Called when the host input changes                                                          |
| `port`             | `string`                  | Current port input value (controlled)                                                       |
| `onPortChange`     | `(value: string) => void` | Called when the port input changes                                                          |
| `canConnect`       | `boolean`                 | Whether the Connect button should be enabled                                                |
| `onConnect`        | `() => void`              | Called when the Connect button is clicked                                                   |
| `isTauri`          | `boolean`                 | Whether the app is running inside Tauri (controls Local Connect button visibility)          |
| `onConnectToLocal` | `() => void`              | Called when the "Connect to Local Server" button is clicked                                 |
| `localPort`        | `number \| null`          | Sidecar port number displayed next to the Local Connect label; `null` hides the port suffix |

**Test IDs:** `host-input`, `port-input`, `connect-btn`, `connect-local-btn`.

### `ConnectionList`

Renders the favorites and recent connections lists with connect and delete actions.

**Source:** `components/connection-manager/ConnectionList.tsx` — re-exported from `ConnectionManagerPopover.tsx`.

**Props (`ConnectionListProps`):**

| Prop                | Type                                   | Description                                                                   |
| ------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `favorites`         | `ConnectionEntry[]`                    | Saved favorite connections to display                                         |
| `recentConnections` | `RecentConnection[]`                   | Recent connections to display (max 10)                                        |
| `onConnect`         | `(host: string, port: number) => void` | Called when a connect action (→) is clicked on any item                       |
| `onRemoveFavorite`  | `(id: string) => void`                 | Called when a favorite's delete (×) is confirmed                              |
| `onClearRecent`     | `() => void`                           | Called when the "Clear" button is clicked to remove all recent connections    |
| `confirm`           | [`ConfirmFn`](#confirmfn-type)         | Promise-based confirmation dialog (from `useConfirm`) for destructive actions |

**`ConfirmFn` type** (re-exported from `ConnectionList.tsx`):

```ts
type ConfirmFn = (opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) => Promise<boolean>;
```

**Test IDs:** `fav-connect-{id}`, `fav-delete-{id}`, `recent-connect-{id}`, `clear-recent-btn`.

### `useConnectionManager` Hook

Orchestrates the full connection lifecycle. Composes `useConnectionStatus` and `useTauri`.

| Return field        | Description                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `currentUrl`        | Full WebSocket URL (`ws://host:port/ws`) or `null`; sourced from [`ConnectionUrlContext`](#connectionurlcontext) rather than local state                                                                                                                                                   |
| `currentHost`       | Parsed hostname from the current URL                                                                                                                                                                                                                                                       |
| `currentPort`       | Parsed port number from the current URL                                                                                                                                                                                                                                                    |
| `status`            | Current `ConnectionStatus` (`'connected'` \| `'disconnected'` \| `'connecting'` \| `'reconnecting'`)                                                                                                                                                                                       |
| `favorites`         | `ConnectionEntry[]` from localStorage                                                                                                                                                                                                                                                      |
| `recentConnections` | `RecentConnection[]` from localStorage (max 10)                                                                                                                                                                                                                                            |
| `addFavorite`       | `(label, host, port) => void` — deduplicates by host+port                                                                                                                                                                                                                                  |
| `removeFavorite`    | `(id) => void`                                                                                                                                                                                                                                                                             |
| `updateFavorite`    | `(id, updates) => void`                                                                                                                                                                                                                                                                    |
| `clearRecent`       | `() => void`                                                                                                                                                                                                                                                                               |
| `connect`           | `(host, port) => void` — clears React Query cache, clears auth token, suppresses Tauri auto-login for non-local hosts, tears down old connection via `wsClient.disconnectAndRejectPending()`, updates [`ConnectionUrlContext`](#connectionurlcontext), connects to new URL, adds to recent |
| `disconnect`        | `() => void` — clears React Query cache, clears auth token, suppresses Tauri auto-login, disconnects via `wsClient.disconnect()`, clears [`ConnectionUrlContext`](#connectionurlcontext)                                                                                                   |
| `connectToLocal`    | `() => void` — connects to `127.0.0.1` via sidecar port or Tauri config fallback                                                                                                                                                                                                           |
| `isFavorite`        | `(host, port) => boolean`                                                                                                                                                                                                                                                                  |
| `isTauri`           | Whether the app is running inside Tauri                                                                                                                                                                                                                                                    |
| `localPort`         | Sidecar port number from `__YMIR_SIDECAR_PORT`, or `null`                                                                                                                                                                                                                                  |

### `useConnectionStatus` Hook

Low-level hook that subscribes to `wsClient.onStatusChange` events.

```tsx
const { status, isConnected, isReconnecting } = useConnectionStatus();
```

- `status` — current `ConnectionStatus` from `wsClient`
- `isConnected` — `true` when `status === 'connected'`
- `isReconnecting` — `true` when `status === 'reconnecting'`

### `connection-storage.ts`

localStorage-backed utility for managing connection favorites and recent connections.

**Keys:** `ymir-connection-favorites`, `ymir-connection-recent`

| Export                   | Purpose                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `getFavorites`           | Returns `ConnectionEntry[]` from localStorage                                               |
| `saveFavorites`          | Writes `ConnectionEntry[]` to localStorage                                                  |
| `addFavorite`            | Adds a favorite (deduplicates by host+port, updates label if exists)                        |
| `removeFavorite`         | Removes a favorite by ID                                                                    |
| `updateFavorite`         | Updates label/host/port fields on an existing favorite                                      |
| `isFavorite`             | Checks if a host+port combination exists in favorites                                       |
| `getRecentConnections`   | Returns `RecentConnection[]` from localStorage                                              |
| `addRecentConnection`    | Adds or updates a recent connection (deduplicates by host+port), sorts by `lastConnectedAt` |
| `clearRecentConnections` | Removes the entire recent connections key from localStorage                                 |

**Types:**

- `ConnectionEntry` — `{ id, label, host, port, createdAt }`
- `RecentConnection` — extends `ConnectionEntry` with `lastConnectedAt`

### `ConnectionUrlContext`

A React context (`contexts/ConnectionUrlContext.tsx`) that provides the current WebSocket connection URL as shared state across the application. This enables components in different parts of the tree (e.g. `LoginPage` and `WorkspaceView`) to read and react to the same connection URL without prop drilling.

**Sync with `wsClient`:** The `ConnectionUrlProvider` subscribes to `wsClient.onStatusChange` events and updates its internal state in two cases:

- When `status === 'connected'` — sets the URL to `wsClient.getUrl()`
- When `status === 'disconnected'` and `wsClient.getUrl()` is falsy — clears the URL to `null`

This ensures the context stays in sync with the actual WebSocket connection state, even when connections are initiated externally (e.g. Tauri auto-login).

| Export                  | Type                                  | Description                                                                                 |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ConnectionUrlProvider` | Component                             | Context provider; initializes URL from `wsClient.getUrl()`, syncs on status changes         |
| `useConnectionUrl`      | `() => string \| null`                | Returns the current WebSocket URL. Returns `null` when used outside the provider            |
| `useSetConnectionUrl`   | `() => (url: string \| null) => void` | Returns a setter to manually update the URL. Returns a no-op when used outside the provider |

**Key consumers:**

- `useConnectionManager` — reads `currentUrl` via `useConnectionUrl()` and updates it via `useSetConnectionUrl()` on connect/disconnect
- `WorkspaceView` — reads `connectionUrl` via `useConnectionUrl()` and passes it as `key` to `WorkspaceViewInner`, forcing a full remount when the server changes

## Path Autocomplete

### `PathAutocompleteInput`

Autocomplete text input component for directory paths. Renders a filtered dropdown of server-fetched directory entries below the input as the user types. Uses [`usePathAutocomplete`](#usepathautocomplete-hook) for debounced server fetching and [`parsePathInput`](#parsepathinput-utility) for query extraction.

**Props:**

| Prop           | Type                      | Description                               |
| -------------- | ------------------------- | ----------------------------------------- |
| `value`        | `string`                  | Current input value (controlled)          |
| `onChange`     | `(value: string) => void` | Callback when value changes               |
| `disabled?`    | `boolean`                 | Disables the input                        |
| `placeholder?` | `string`                  | Placeholder text                          |
| `id?`          | `string`                  | HTML id attribute (for label association) |

**Keyboard interactions:**

| Key       | Behavior                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------- |
| ArrowDown | Open dropdown (if closed); move highlight down                                                     |
| ArrowUp   | Open dropdown (if closed); move highlight up                                                       |
| Tab       | Accept highlighted entry (or first entry if none highlighted); appends `name/` to the path         |
| Enter     | Accept highlighted entry; appends `name/` to the path                                              |
| Escape    | Close dropdown and clear highlight; calls `preventDefault` to prevent parent `Dialog` from closing |

**ARIA pattern:** The input uses `role="combobox"` with `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` (pointing to the listbox), and `aria-activedescendant` (tracking the highlighted option). The dropdown is a `role="listbox"` with `role="option"` items.

**Accept behavior:** When an entry is accepted (Tab/Enter/click), the component replaces the last path segment with `entry.name + '/'`, producing a valid directory path ready for further traversal.

**Used by:** `CreateWorkspaceDialog` for the path field.

### `usePathAutocomplete` Hook

Hook that fetches directory listings from the server with 300ms debounce and race-condition handling via `AbortController`.

```tsx
const { directories, isLoading } = usePathAutocomplete(
  queryDir: string,
  options?: { enabled?: boolean },
);
```

**Parameters:**

- `queryDir` — the directory path to list (produced by [`parsePathInput`](#parsepathinput-utility))
- `options.enabled` — optional flag to disable fetching; defaults to `true`

**Returns:**

| Field         | Type                           | Description                                                                                                       |
| ------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `directories` | `AutocompleteDirectoryEntry[]` | Filtered directory entries from the server; empty when disconnected, `queryDir` is empty, or `enabled` is `false` |
| `isLoading`   | `boolean`                      | Whether a fetch is in progress                                                                                    |

**Behavior:**

1. **Debounce** — waits 300ms after `queryDir` changes before triggering a fetch; rapid typing cancels the pending timer
2. **Race-condition handling** — each fetch creates a new `AbortController`; previous in-flight requests are aborted before the new one starts
3. **Connection-aware** — returns empty results when disconnected (checked via `useConnectionStatus`); the `enabled` option also gates fetching
4. **Server request** — calls `path.autocomplete` with `{ path: debouncedDir }` and returns the `directories` array from the response

### `parsePathInput` Utility

Pure function that splits a path input string into a parent directory (for server queries) and a prefix filter (for client-side filtering).

```tsx
parsePathInput(input: string): { queryDir: string; prefix: string }
```

Only absolute paths (starting with `/` or `~`) produce a non-empty `queryDir`. Relative paths return an empty `queryDir` so no server fetch is triggered.

**Examples:**

| Input             | `queryDir`     | `prefix`          | Notes                     |
| ----------------- | -------------- | ----------------- | ------------------------- |
| `''`              | `''`           | `''`              | Empty — no query          |
| `~`               | `'~'`          | `''`              | Home dir — query home     |
| `~/Doc`           | `'~'`          | `'Doc'`           | Home prefix filter        |
| `/home/user/proj` | `'/home/user'` | `'proj'`          | Absolute path with prefix |
| `/home/user/`     | `'/home/user'` | `''`              | Absolute path, no prefix  |
| `Documents/sof`   | `''`           | `'Documents/sof'` | Relative — no query       |
| `.hidden`         | `''`           | `'.hidden'`       | Relative — no query       |

**Exported from:** `hooks/usePathAutocomplete.ts` (re-exports from `hooks/parsePathInput.ts`).

## Accessibility

- Tree nodes have `role="treeitem"`, `tabIndex={0}`, and `aria-expanded` on directories
- Status dots include `aria-label` (e.g. "Git status: modified") and `title` tooltips
- Children containers use `role="group"`
- Keyboard navigation via Enter/Space

### Tab Components

#### Generic Components

Several reusable components were extracted to eliminate duplication across the UI:

- **`Dialog`** — Generic dialog shell rendered via `createPortal` to `document.body` (escaping stacking contexts). Props: `open`, `onClose`, `title`, `role?` (`'dialog'` | `'alertdialog'`), `children`, `testId?`, `wide?`. Features: focus trap (Tab cycling) and Escape close both respect `defaultPrevented`, allowing nested interactive controls (like `PathAutocompleteInput`) to intercept these keys first; auto-focus first input on open; focus restoration on close; backdrop click close; body scroll lock. Uses `Z_INDEX_DIALOG` (1100) from `theme.ts`. Card is 420px default, expanding to 520px with the `wide` prop. Backdrop is fixed-position `rgba(0, 0, 0, 0.5)` with flex-centered card. Used by `CreateWorkspaceDialog`, `CreateWorktreeDialog`, `MergeWorktreeDialog`, `RemoveWorktreeDialog`, `GenericPicker`, and `DialogProvider`.

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
