# Tab System

The tab system manages terminal and editor tabs across two tab strips: the **content pane** (editors + terminals) and the **bottom panel** (terminals only). Both panes share the same `useTabs` hook internally and the `TabBar` component for rendering.

## Tab Interface

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

## `useTabs` Hook

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

## TabBar Component

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

## Drag-and-Drop Architecture

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

### Workspace Drag-and-Drop

```
WorkspaceView (DragDropProvider)
├── group="workspace-list" → WorkspaceSidebar → WorkspaceItem ×N
│   └── useSortable per item → onDragEnd fires workspace.reorder mutation
├── group="worktree-{wsId}" per workspace → WorktreeItem ×N
│   └── useSortable per worktree → cosmetic-only visual reorder
└── Tab DnD (existing content/bottom groups) unchanged
```

**Workspace reorder:** Dragging workspace items reorders them. The `workspace.reorder` mutation is fired on `onDragEnd` (not during drag) to persist the new order. The `sort_order` column in the workspaces DB table stores the order.

**Worktree sub-item reorder:** Dragging worktree sub-items within a workspace is cosmetic-only — the order is not persisted (worktree list comes from `git worktree list`).

## Imperative Handles

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

## OSC 7 CWD Tracking

Terminal tabs track their current working directory by parsing OSC 7 escape sequences from PTY output:

```
PTY output → Terminal.onOutput callback
           → parseOsc7Cwd(data) extracts path from OSC 7 sequence
           → onCwdChange(cwd) callback
           → updateTabCwd(tabId, cwd)
```

The OSC 7 format is `ESC ] 7 ; file://hostname/path ST`. The parser (`lib/osc-parser.ts`) uses a global regex to find the last match in each data chunk and returns the decoded path. This enables tooltip display of the current directory and preserves CWD when transferring tabs between panes.

## Title Tracking

ghostty-web emits `onTitleChange` events when the terminal title changes (e.g. via shell `PROMPT_COMMAND`). The `Terminal` component forwards these through `onTitleChange` → `updateTabTitle`, keeping the tab strip in sync with the running process.

## Batch Close Behavior

- **ContentPane:** Checks for dirty (unsaved) editor files before closing. Shows a per-file confirmation dialog if any tab has unsaved changes.
- **BottomPanel:** Warns about running processes being terminated. Shows a single confirmation when closing multiple terminals.
- Both send `terminal.close` requests to the server for each closed terminal tab.
