# Tab System

The tab system manages terminal, editor, diff, and git-tree tabs across a **dynamic N-pane split layout**. Each pane (`SplitLeafPane`) owns an independent tab strip. Users can split panes horizontally or vertically to create arbitrary layouts; each resulting pane is a self-contained tab manager.

## Tab Interface

```typescript
interface Tab {
  id: string;
  workspaceId: string; // workspace-scoped; each tab belongs to exactly one workspace
  type: 'terminal' | 'editor' | 'diff' | 'git-tree';
  title: string;
  terminalId?: string;
  filePath?: string;
  cwd?: string; // tracked via OSC 7 for terminal tabs
  customTitle?: string; // set when a user renames a tab
  diffRef?: 'staged' | 'unstaged' | 'commit';
  diffRepoPath?: string;
  repoPath?: string;
  commitSha?: string;
  parentSha?: string;
}
```

**Tab types:**

| Type       | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| `terminal` | A PTY-backed terminal session                                 |
| `editor`   | A file editor backed by the CodeMirror 6-based `EditorPane`   |
| `diff`     | A file diff viewer (`DiffViewer`) for staged/unstaged/commit  |
| `git-tree` | A git history browser (`GitTreeTab`) for a specific repo path |

## Pane Layout Model

The workspace layout is a **binary tree** (`LayoutNode`) defined in `lib/pane-tree.ts`:

- **`PaneNode`** (leaf) — represents an actual pane with a UUID `id`.
- **`SplitNode`** (internal) — divides space between exactly two children, either `horizontal` or `vertical`, with percentage-based `sizes`.

```
LayoutNode = PaneNode | SplitNode

PaneNode  = { type: 'pane', id: string }
SplitNode = { type: 'split', id: string, direction: 'horizontal' | 'vertical',
              children: [LayoutNode, LayoutNode], sizes: [string, string] }
```

The `useSplitLayout` hook manages this tree. Splitting a pane replaces its `PaneNode` with a `SplitNode` whose first child is the original pane and second child is a new empty pane. Removing a pane replaces its parent `SplitNode` with the sibling subtree. The layout is persisted per-workspace via `config.set` with key `pane_layout_{workspaceId}` (debounced 300 ms).

Each `SplitLeafPane` receives its `paneId` (a UUID) and uses it as both its DnD group identifier and the `pane` field sent to the server for tab persistence.

## `useTabs` Hook

Each `SplitLeafPane` (and `BottomPanel`) owns an independent `useTabs` instance:

| Method            | Description                                                                      |
| ----------------- | -------------------------------------------------------------------------------- |
| `createTab`       | Create a tab and activate it                                                     |
| `closeTab`        | Close a tab; activate the previous tab (or the next, or null)                    |
| `activateTab`     | Set a tab as active                                                              |
| `updateTabTitle`  | Update a tab's display title                                                     |
| `updateTabCwd`    | Update a terminal tab's working directory (from OSC 7 parsing)                   |
| `reorderTabs`     | Move a tab from one index to another (used by DnD)                               |
| `closeTabsRight`  | Close all tabs to the right of a given tab                                       |
| `closeOtherTabs`  | Close all tabs except the given one                                              |
| `setDisplayTitle` | Set or clear a tab's `customTitle` (empty string clears it)                      |
| `switchWorkspace` | Set the active scope via `scopeKey`; auto-initializes empty state for new scopes |
| `loadTabs`        | Load tab state from server data for a given scope key                            |
| `cleanupScope`    | Remove a scope key's entry from the internal Map (prevents unbounded growth)     |

`useTabs` stores per-scope state in a `Map` keyed by `scopeKey` (a string of the form `"workspaceId"` or `"workspaceId:/path/to/worktree"`). When `switchWorkspace` is called with a `scopeKey`, the hook swaps to that scope's tab set, creating an empty entry if none exists. The `Tab.workspaceId` field stores the real workspace ID (parsed from the scope key), while the Map key includes the optional worktree path for scope isolation. All new tabs are auto-assigned the current workspace ID.

`closeTab` uses a ref (`activeTabIdRef`) to avoid stale closures when computing which tab to activate next. The `cleanupScope` method removes a scope entry entirely, used when worktrees or workspaces are deleted to prevent unbounded Map growth.

## `useTerminalPane` Hook

`useTerminalPane` wraps `useTabs` and adds server synchronization, dirty-file checking, and pane-specific close logic. Each `SplitLeafPane` creates an instance with `pane` set to its UUID `paneId`.

**Options:**

```typescript
interface UseTerminalPaneOptions {
  workspaceId?: string | null;
  scopeKey?: string | null; // the full scope key (e.g. "workspaceId" or "workspaceId:/path/to/worktree")
  pane?: string; // the paneId UUID (or 'bottom' for BottomPanel)
  dirtyFiles?: Set<string>;
  confirmMultipleText?: string;
  onTerminalRegistered?: (terminalId: string, tabId: string, workspaceId: string) => void;
  onTerminalUnregistered?: (terminalId: string) => void;
}
```

**Server sync:** The hook fires `tab.create`, `tab.delete`, `tab.reorder`, and `tab.update` requests via `onTabChange`. On workspace switch, it calls `tab.list` to load persisted tabs for the current `pane` (skipping if tabs were already restored via `loadRestoredTabs`).

**Additional returned methods:**

| Method              | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| `handleCloseTab`    | Close with dirty-file confirmation (editor) or terminal cleanup        |
| `handleCloseRight`  | Close tabs to the right with batch confirmation                        |
| `handleCloseOthers` | Close all other tabs with batch confirmation                           |
| `handleRenameTab`   | Set `customTitle` via `setDisplayTitle`                                |
| `handleTitleChange` | Forward terminal title changes to `updateTabTitle`                     |
| `handleCwdChange`   | Forward OSC 7 CWD changes to `updateTabCwd`                            |
| `transferTabOut`    | Remove a terminal tab and return its data (for cross-pane transfer)    |
| `receiveTab`        | Create a new terminal tab from transferred data                        |
| `loadRestoredTabs`  | Bulk-load persisted tabs for a workspace (from `tab.restore` response) |
| `getTabs`           | Read current tabs via ref                                              |
| `getActiveTabId`    | Read active tab ID via ref                                             |

> **Note:** `handleTitleChange` and `handleCwdChange` are **internal wiring helpers**, not consumer-facing APIs. They are thin wrappers that forward to `updateTabTitle` / `updateTabCwd` from `useTabs`. In practice, the connection between terminal PTY events and tab state is established through the **stable callback cache** in `useTerminalRegistry` (`callbackCacheRef`), which builds per-tab callbacks that look up the owning pane's imperative handle and call `paneHandle.updateTabTitle()` / `paneHandle.updateTabCwd()` directly. These methods are not called by any component outside of `useTerminalPane` itself — they exist so the hook's public surface includes a self-contained title/CWD forwarding path alongside the registry-driven one.

## `useTabRestore` Hook

`useTabRestore` handles distributing restored tabs to the correct pane handles when the active scope (workspace or worktree) changes. It lives in `WorkspaceView` and runs as a side effect.

```typescript
interface UseTabRestoreParams {
  activeScopeKey: string | null; // e.g. "workspaceId" or "workspaceId:/path/to/worktree"
  paneHandleRefs: MutableRefObject<Map<string, TerminalPanelHandle>>;
}
```

**Behavior:**

1. When `activeScopeKey` changes, the hook fires `tab.restore` with the parsed `workspaceId` and optional `worktreePath`.
2. Each scope is restored **at most once** — a `Set<string>` ref tracks which scope keys have been restored.
3. The response tabs are **grouped by `pane`** into a `Map<string, PersistedTabInfo[]>`.
4. After a `requestAnimationFrame` delay (to allow pane handles to register after layout load), each group is dispatched to the matching pane handle via `handle.loadRestoredTabs(scopeKey, tabs)`.
5. Errors are swallowed — restoration is best-effort.

**Interaction with `useTerminalPane`:** `loadRestoredTabs` on each pane handle creates tabs locally and marks the workspace as already-restored so that subsequent `tab.list` calls during workspace switch are skipped.

## `useTabDragDrop` Hook

`useTabDragDrop` extracts drag-over and drag-end logic from `WorkspaceView` into a dedicated hook. It handles same-pane tab reorder, cross-pane tab transfer, and workspace list reordering.

```typescript
interface UseTabDragDropParams {
  paneHandleRefs: MutableRefObject<Map<string, TerminalPanelHandle>>;
  bottomPanelRef: RefObject<TerminalPanelHandle | null>;
  workspacesRef: MutableRefObject<WorkspaceSummary[] | undefined>;
  reorderWorkspacesMutation: ReturnType<typeof useReorderWorkspaces>;
  terminalRegistry: TerminalRegistryEntry[];
  setTerminalRegistry: React.Dispatch<React.SetStateAction<TerminalRegistryEntry[]>>;
  activeWorkspaceId: string | null;
  bottomVisible: boolean;
  toggleBottom: () => void;
}
```

**Returns:** `{ handleDragOver, handleDragEnd }` — callbacks wired directly to `DragDropProvider`.

**`handleDragOver`** — fires during drag. For sortable tabs (`source.type === 'tab'`):

- If source and target groups differ (cross-pane), calls `event.preventDefault()` to suppress the `OptimisticSortingPlugin` DOM mutation.
- If same group, looks up the owning pane handle and calls `reorderTabs(fromIndex, toIndex)` based on `move()` output.

**`handleDragEnd`** — fires on drop:

- For `source.type === 'workspace'`: computes the final workspace order via `move()` and fires `reorderWorkspacesMutation.mutate`.
- For cross-pane tab transfers: validates the source tab belongs to the active workspace, then calls `sourceHandle.transferTabOut(id)` → `targetHandle.receiveTab(...)` and updates `terminalRegistry` to reflect the new owning pane. Auto-expands the bottom panel if the tab was dragged there while collapsed.

## TabBar Component

`TabBar` renders a sortable, context-menu-equipped tab strip. It supports two visual variants via the `variant` prop:

| Variant   | Used by         | Styling                                                              |
| --------- | --------------- | -------------------------------------------------------------------- |
| `content` | `SplitLeafPane` | Inactive tabs use `COLOR_TAB_INACTIVE` background, 13px font         |
| `bottom`  | `BottomPanel`   | Inactive tabs are transparent, 12px font, accent underline on active |

Each tab is a `SortableTab` (memoized) wired to `@dnd-kit/react`'s `useSortable` with a `group` identifier set to the pane's UUID. This group is used by the `DragDropProvider` in `WorkspaceView` to distinguish same-pane reorders from cross-pane transfers.

**Features:**

- **Context menu** — right-click opens `TabContextMenu` (Close, Close Others, Close to the Right, Rename, Split Right, Split Down, Close Pane)
- **Middle-click close** — `onAuxClick` with `button === 1` closes the tab
- **Inline rename** — triggered from context menu; commits on Enter/blur, cancels on Escape
- **Tooltips** — terminal tabs show `cwd`, editor tabs show `filePath`, diff tabs show `filePath (diff)`, git-tree tabs show `Git History — {repoPath}`
- **Active accent line** — 2px `var(--accent)` top border on the active tab
- **Split actions** — `onSplitRight` and `onSplitDown` split the pane and optionally move the current tab to the new pane
- **Close pane** — `onClosePane` / `canClosePane` allows closing the entire pane (disabled when it's the only pane)

## Drag-and-Drop Architecture

```
WorkspaceView (DragDropProvider)
├── onDragOver → same-group reorder via move() helper
│   └── group = paneId (UUID) or "bottom"
│       └── handle.reorderTabs(fromIndex, toIndex)
└── onDragEnd → cross-group transfer
    ├── sourceHandle.transferTabOut(id) → { terminalId, title, cwd, customTitle }
    └── targetHandle.receiveTab(terminalId, title, cwd, customTitle)
```

**Same-pane reorder:** During drag-over, `@dnd-kit/helpers`' `move()` computes the new index order. The pane's handle (looked up by `sourceGroup` in `paneHandleRefs` or `bottomPanelRef`) calls `reorderTabs(fromIndex, toIndex)`. Cross-pane drag-over events have `event.preventDefault()` called to suppress `OptimisticSortingPlugin` DOM mutations.

**Cross-pane transfer:** On drag-end, if the source and target groups differ, the tab is removed from the source pane and added to the target pane. Only terminal tabs can be transferred (editor tabs are bound to a specific pane). `transferTabOut` returns the terminal's data so the target pane can re-create the tab without spawning a new PTY. The terminal registry is updated to reflect the new owning pane without unmounting the terminal.

**Workspace boundary validation:** Drag-and-drop operations are rejected if the source tab's `workspaceId` does not match the active workspace. This prevents tabs from being transferred across workspace boundaries.

**Bottom panel auto-expand:** When a tab is dragged to the bottom panel while it's collapsed, `toggleBottom()` is called automatically to reveal the panel.

### Workspace Drag-and-Drop

```
WorkspaceView (DragDropProvider)
├── group="workspace-list" → WorkspaceSidebar → WorkspaceItem ×N
│   └── useSortable per item → onDragEnd fires workspace.reorder mutation
├── group="worktree-{wsId}" per workspace → WorktreeItem ×N
│   └── useSortable per worktree → cosmetic-only visual reorder
└── Tab DnD (per-pane groups) unchanged
```

**Workspace reorder:** Dragging workspace items reorders them. The `workspace.reorder` mutation is fired on `onDragEnd` (not during drag) to persist the new order. The `sort_order` column in the workspaces DB table stores the order.

**Worktree sub-item reorder:** Dragging worktree sub-items within a workspace is cosmetic-only — the order is not persisted (worktree list comes from `git worktree list`).

## Imperative Handles

All panes expose a unified `TerminalPanelHandle` via `forwardRef` + `useImperativeHandle` (wired through `useTerminalPanelHandle`):

```typescript
interface TerminalPanelHandle {
  transferTabOut(
    tabId: string,
  ): { terminalId: string; title: string; cwd?: string; customTitle?: string } | null;
  receiveTab(terminalId: string, title: string, cwd?: string, customTitle?: string): string;
  loadRestoredTabs(workspaceId: string, tabs: PersistedTabInfo[]): void;
  reorderTabs(fromIndex: number, toIndex: number): void;
  getTabs(): Tab[];
  getActiveTabId(): string | null;
  updateTabTitle(tabId: string, title: string): void;
  updateTabCwd(tabId: string, cwd: string): void;
}
```

`WorkspaceView` stores handles in a `Map<string, TerminalPanelHandle>` (`paneHandleRefs`) keyed by `paneId`. The bottom panel handle is stored separately in `bottomPanelRef`. These handles enable `WorkspaceView` to orchestrate cross-pane transfers, tab restoration, and DnD reorders without direct knowledge of individual pane internals.

## OSC 7 CWD Tracking

Terminal tabs track their current working directory by parsing OSC 7 escape sequences from PTY output:

```
PTY output → Terminal.onOutput callback
           → parseOsc7Cwd(data) extracts path from OSC 7 sequence
           → onCwdChange(cwd) callback
           → updateTabCwd(tabId, cwd)
```

The OSC 7 format is `ESC ] 7 ; file://hostname/path ST`. The parser (`lib/osc-parser.ts`) uses a global regex to find the last match in each data chunk and returns the decoded path. This enables tooltip display of the current directory and preserves CWD when transferring tabs between panes.

The parsed CWD is also stored on the `TerminalRegistryEntry` as an optional `cwd?: string` field.

## Title Tracking

ghostty-web emits `onTitleChange` events when the terminal title changes (e.g. via shell `PROMPT_COMMAND`). The `Terminal` component forwards these through `onTitleChange` → `updateTabTitle`, keeping the tab strip in sync with the running process.

## Batch Close Behavior

Batch close operations (Close Others, Close to the Right) are handled by `useTerminalPane` callbacks:

- **Dirty file protection:** If any tab being closed is an editor with unsaved changes (`dirtyFiles` set), a per-file confirmation dialog is shown before proceeding.
- **Multiple terminal confirmation:** When closing multiple terminals (e.g. from `BottomPanel`), a single confirmation warns about running processes being terminated.
- **Terminal cleanup:** Each closed terminal tab sends a `terminal.close` request to the server and calls `onTerminalUnregistered` to update the terminal registry.
- **Stale closure protection:** After an async confirmation, the handler checks that the target tab still exists before proceeding.

## Tab Persistence

Tabs are persisted per-workspace and per-pane:

1. **Create/close/reorder/activate** events are synced to the server immediately via `tab.create`, `tab.delete`, `tab.reorder`, and `tab.update` requests.
2. **On workspace switch**, `tab.list` is called with `{ workspaceId, pane }` to load the persisted tab set. Dead terminals (`terminalAlive === false`) are filtered out.
3. **Session restore** uses `tab.restore` which returns all tabs for a workspace grouped by `pane`. `useTabRestore` distributes them to the matching pane handles via `loadRestoredTabs` (see [useTabRestore Hook](#usetabrestore-hook)).
4. The `pane` field in `PersistedTabInfo` stores the pane UUID, allowing tabs to be restored to their original pane after reload.

### `tab.restore` Two-Phase Terminal Restore

When restoring a terminal tab, the `tab.restore` handler uses a **two-phase approach** to prefer reusing a still-running PTY over spawning a new one:

**Phase 1 — Live terminal reuse:**

1. The persisted tab's `terminal_id` column is checked against the live `PTYManager` via `ptyManager.has(id) && !ptyManager.hasExited(id)`.
2. If the terminal is still alive, `ptyManager.setOutputTarget(id, onData, onExit)` re-attaches the output and exit callbacks to the new client connection — no new PTY is created.
3. A `panes` row is created linking the new session tab to the existing `terminal_id`.
4. The reused `terminalId` is written back into `persisted_tabs.terminal_id` so that subsequent restores can also reuse it.

**Phase 2 — New PTY creation (fallback):**

1. If `terminal_id` is absent, or the PTY has exited / been killed, a fresh terminal instance is created via `createTerminalInstance` + `ptyManager.create`.
2. The new PTY is also tracked in the `workspace_terminals` table (see [Workspace Terminals](#workspace-terminals)).
3. The new `terminalId` is saved into `persisted_tabs.terminal_id` for future restore cycles.

After either phase, the persisted tab record is updated with the new session tab ID (and the old record deleted if the ID changed) so that future restores reference the correct entry.

### Workspace Terminals

Newly created PTYs during restore are tracked in the **`workspace_terminals`** table (in the session DB). This table stores `{ id, workspace_id, cwd, cols, rows, shell }` and is **workspace-scoped**, not session-scoped:

- **No foreign key to `client_sessions`** — the `workspace_terminals` table is not cleaned up when a client session is deleted. Terminals survive session teardown.
- **Terminals continue running** when clients disconnect. The underlying PTY process remains alive in the server's `PTYManager`.
- **Only killed on server shutdown** — `PTYManager.killAll()` terminates all PTY processes when the server stops.
- **Deleted on exit** — when a terminal's `onExit` callback fires, `deleteWorkspaceTerminal` removes the row. This also happens for reused terminals via their re-attached `onExit` callback.

This design enables the live-terminal reuse in Phase 1: because PTYs and their `workspace_terminals` records persist across client reconnects, a subsequent `tab.restore` can discover and re-attach to them.

### `tab.restore` Partial Failure

The server's `tab.restore` handler wraps each terminal tab's restore logic in an individual `try/catch`. If a single tab fails, the handler logs the error and continues with the remaining tabs. This means:

- **The response may contain a subset** of the originally persisted tabs — failed terminals are omitted from the `restoredTabs` array.
- **Non-terminal tabs** (editor, diff, git-tree) are always restored since they have no PTY dependency.
- **If PTY creation fails** after the terminal instance is created, the instance is cleaned up (`deleteTerminalInstance`) but the tab is still included in the response without a `terminalId`.
- **CWD resolution fallback**: If a terminal tab's CWD is outside the workspace root, the handler checks whether it matches a known git worktree. If not, it falls back to the workspace root.
- **Live-terminal reuse failure**: If the persisted `terminal_id` references a live PTY but the surrounding logic fails (e.g. CWD validation throws), the error is caught by the per-tab `try/catch` and the tab is skipped entirely — it does **not** fall through to Phase 2 new-PTY creation within the same restore call. The tab will be retried on the next restore cycle.

## Pane Splitting

Users can split any pane via the tab or tab-bar context menu:

- **Split Right** — creates a horizontal split; optionally moves the current tab to the new pane.
- **Split Down** — creates a vertical split; optionally moves the current tab to the new pane.
- **Close Pane** — closes the pane and all its tabs (requires at least 2 panes in the layout). Terminals in the closed pane are terminated.

Splitting is implemented in `WorkspaceView.handleSplitPane`: it calls `useSplitLayout.splitPane` to update the layout tree, then on the next frame transfers the specified tab (if any) from the source pane to the newly created pane. The new pane is auto-focused.
