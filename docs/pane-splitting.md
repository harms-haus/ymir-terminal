# Pane Splitting

The pane-splitting system provides a recursive binary tree layout for the terminal workspace. Users can split any pane horizontally or vertically, close panes, drag tabs between panes, and have their layout persisted per-workspace across sessions.

The architecture is built in three layers:

1. **Data model** (`pane-tree.ts`) — pure functions over an immutable binary tree.
2. **State hook** (`useSplitLayout`) — React state management, focus tracking, and debounced persistence.
3. **Components** (`SplitPaneLayout`, `SplitLeafPane`) — recursive rendering via `react-resizable-panels`, with tab management and content rendering at the leaves.

---

## Data Model (`pane-tree.ts`)

The layout is a binary tree. Leaves are **panes** that hold content; internal nodes are **splits** that divide space.

### Types

```typescript
type SplitDirection = 'horizontal' | 'vertical';

interface PaneNode {
  type: 'pane';
  id: string; // UUID
}

interface SplitNode {
  type: 'split';
  id: string; // UUID
  direction: SplitDirection;
  children: [LayoutNode, LayoutNode]; // exactly two children
  sizes: [string, string]; // e.g. ['50%', '50%']
}

type LayoutNode = PaneNode | SplitNode;
```

- `PaneNode` — a leaf representing a content pane. Identified by a UUID.
- `SplitNode` — an internal node with two children and percentage-based sizes consumed by `react-resizable-panels` v4 `Panel` components.
- `direction: 'horizontal'` means children are side by side (left/right). `'vertical'` means stacked (top/bottom).

### Exported Functions

#### `createDefaultLayout(): PaneNode`

Returns a single-pane layout with a fresh UUID. Used as the initial state when no persisted layout exists.

```typescript
const layout = createDefaultLayout();
// { type: 'pane', id: 'a1b2c3-...' }
```

#### `findNode(root: LayoutNode, id: string): LayoutNode | null`

Recursively searches the tree for a node with the given `id`. Returns the node or `null`.

#### `findParentSplit(root: LayoutNode, childId: string): { parent: SplitNode; index: number } | null`

Finds the `SplitNode` that directly contains `childId` as one of its children. Returns the parent node and the child's index (`0` or `1`). Returns `null` if `childId` is the root or not found.

#### `replaceNode(root: LayoutNode, targetId: string, replacement: LayoutNode): LayoutNode`

Returns a new tree with the node identified by `targetId` replaced by `replacement`. Does **not** mutate the original tree. If `targetId` is the root, returns `replacement` directly.

This is the foundational mutation primitive — all other mutations build on it.

#### `splitPane(root: LayoutNode, paneId: string, direction: SplitDirection): LayoutNode`

Splits the leaf pane identified by `paneId` into a new `SplitNode`:

- `children[0]` — the original pane (preserving its `paneId`).
- `children[1]` — a new empty pane with a fresh UUID.
- `sizes` — `['50%', '50%']`.

Returns a new tree. If `paneId` is not found, returns the original reference unchanged.

```typescript
// Before: single pane { type: 'pane', id: 'A' }
const split = splitPane(layout, 'A', 'horizontal');
// After: { type: 'split', direction: 'horizontal', children: [{ id: 'A' }, { id: 'B' }], sizes: ['50%','50%'] }
```

#### `removePane(root: LayoutNode, paneId: string): { layout: LayoutNode; removedPanes: string[] } | null`

Removes the pane identified by `paneId`:

- If `paneId` is the root `PaneNode` (only pane in the tree), returns `null` — the last pane cannot be removed.
- Otherwise, finds the parent `SplitNode` and replaces it with the sibling subtree.
- `removedPanes` lists all `PaneNode` IDs in the removed subtree (important for terminal cleanup when a subtree is discarded).

```typescript
// Tree: Split[ PaneA, PaneB ]
const result = removePane(layout, 'PaneB');
// result.layout → PaneA (sibling promoted to root)
// result.removedPanes → ['PaneB']
```

#### `collectPaneIds(root: LayoutNode): string[]`

Collects all `PaneNode` IDs in the tree via depth-first traversal. Useful for diffing before/after layout changes.

#### `isOnlyPane(root: LayoutNode, paneId: string): boolean`

Returns `true` if the root is a single `PaneNode` matching `paneId`. Used to disable the "Close Pane" action on the last remaining pane.

#### `serializeLayout(node: LayoutNode): string`

Serializes the layout tree to a JSON string via `JSON.stringify`.

#### `deserializeLayout(json: string): LayoutNode | null`

Deserializes a JSON string back into a `LayoutNode`. Runs the tree through `isValidLayoutNode` validation. Returns `null` for invalid or malformed input.

**Validation rules** (applied recursively):

- `id` must be a non-empty string.
- `type` must be `'pane'` or `'split'`.
- Split nodes must have `direction` of `'horizontal'` or `'vertical'`, exactly 2 children, and a `sizes` tuple of two strings.

---

## Layout Hook (`useSplitLayout`)

```typescript
function useSplitLayout(workspaceId: string | null): UseSplitLayoutResult;
```

### Return Type

| Property           | Type                             | Description                                  |
| ------------------ | -------------------------------- | -------------------------------------------- |
| `layout`           | `LayoutNode`                     | Current layout tree                          |
| `paneIds`          | `string[]`                       | All pane IDs (derived via `collectPaneIds`)  |
| `splitPane`        | `(paneId, direction) => void`    | Split a pane, auto-focus the new pane        |
| `removePane`       | `(paneId) => string[] \| null`   | Remove a pane; returns removed IDs or `null` |
| `setLayout`        | `(layout) => void`               | Directly replace the layout state            |
| `loadLayout`       | `(workspaceId) => Promise<void>` | Load persisted layout or create default      |
| `focusedPaneId`    | `string \| null`                 | Currently focused pane                       |
| `setFocusedPaneId` | `(paneId) => void`               | Change focused pane                          |

### Debounced Persistence

Every layout change triggers a 300ms debounced save via `config.set`:

```typescript
sendRequest('config.set', {
  key: `pane_layout_${workspaceId}`,
  value: serializeLayout(layout),
});
```

The debounce timer resets on each layout change. Save failures are silently ignored. Persistence is skipped entirely when `workspaceId` is `null`.

### Auto-Focus Behavior

- **On split**: The newly created empty pane is automatically focused. This is determined by diffing the old and new `collectPaneIds` results.
- **On remove**: If the removed pane was the focused pane, focus shifts to the first surviving pane. Otherwise, focus is unchanged.

### Workspace Switch

`loadLayout(wsId)` is called when the active workspace changes:

1. If `wsId` is `null`, creates a fresh default layout.
2. Otherwise, fetches the persisted layout via `config.get` with key `pane_layout_{wsId}`.
3. If the persisted data exists and passes `deserializeLayout` validation, uses it.
4. Falls back to a default layout on any error or missing data.
5. Sets focus to the first pane in the resulting layout.

### Stale-Closure Safety

The hook maintains refs (`layoutRef`, `focusedPaneIdRef`, `workspaceIdRef`) that are synchronized on every state change. Callbacks read from these refs to avoid stale closures in `requestAnimationFrame` and `setTimeout` contexts.

---

## Components

### `SplitPaneLayout`

Recursive renderer that turns a `LayoutNode` tree into `react-resizable-panels` components.

```typescript
interface SplitPaneLayoutProps {
  layout: LayoutNode;
  focusedPaneId: string | null;
  workspaceId: string | null;
  // ... event handlers, refs, and file/diff targets
  paneHandleRefs: React.MutableRefObject<Map<string, TerminalPanelHandle>>;
  paneContainerRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onLayoutChanged?: () => void;
}
```

**Rendering strategy:**

- If the root is a `PaneNode`, renders a single `SplitLeafPane` directly (no `Group`/`Panel` wrapper).
- If the root is a `SplitNode`, renders a `<Group orientation={node.direction}>` with two `<Panel>` children separated by a `<Separator>`.
- Recursion: each `Panel` wraps either a `SplitLeafPane` (for `PaneNode` leaves) or another nested `<Group>` (for child `SplitNode`s).

**Ref wiring:**

| Ref map             | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `paneHandleRefs`    | Maps `paneId → TerminalPanelHandle` for tab transfer between panes  |
| `paneContainerRefs` | Maps `paneId → HTMLDivElement` for terminal DOM anchoring (portals) |

Both maps are populated via callback refs in `renderLeafPane`. When a pane unmounts (close/split), the ref is deleted.

**Props pass-through:** Most event handlers (`onSplitRight`, `onSplitDown`, `onClosePane`, `onTerminalRegistered`, `onActiveTabChange`) are adapted from pane-scoped to pane-id-qualified forms before being passed to `SplitLeafPane`. For example:

```typescript
onActiveTabChange={
  onActiveTabChange
    ? (activeTabId) => onActiveTabChange(paneId, activeTabId)
    : undefined
}
```

### `SplitLeafPane`

A leaf pane containing a `TabBar` and a content area. Manages its own set of tabs via `useTerminalPane`.

```typescript
interface SplitLeafPaneProps {
  paneId: string;
  workspaceId: string | null;
  focused?: boolean;
  onFocus?: () => void;
  onSplitRight?: (paneId: string, tabId?: string) => void;
  onSplitDown?: (paneId: string, tabId?: string) => void;
  onClosePane?: (paneId: string) => void;
  isOnlyPane?: boolean;
  // ... file/diff targets, terminal registration callbacks, dirty file tracking
}
```

**Tab types and content rendering:**

| Tab type     | Component    | Condition                                                                                 |
| ------------ | ------------ | ----------------------------------------------------------------------------------------- |
| `editor`     | `EditorPane` | `activeTab.type === 'editor'` and `filePath` + `workspaceId`                              |
| `diff`       | `DiffViewer` | `activeTab.type === 'diff'` and `filePath` + `diffRepoPath`                               |
| `git-tree`   | `GitTreeTab` | `activeTab.type === 'git-tree'` and `repoPath`                                            |
| _(terminal)_ | Portaled     | Terminal instances are portaled into `terminalContainerRef` by `TerminalManager`          |
| _(none)_     | Empty state  | Centered `YmirLogo` (33% width, max 150px). Tab creation via + button dropdown in TabBar. |

**Focus indication:** The outer `div` renders a `1px solid var(--accent-dim)` border when `focused` is `true`, and `transparent` when `false`. Focus is captured on `mousedown` via the `onFocus` callback.

**Tab creation helpers:**

- `handleAddEditor(filePath)` — opens an editor tab, or activates an existing one for the same file (deduplication).
- `handleAddDiff(filePath, repoPath, staged)` — opens a diff tab, deduplicating by `(filePath, diffRef)`.
- `handleAddCommitDiff(sha, parentSha, filePath, repoPath)` — opens a commit diff tab, deduplicating by `(filePath, commitSha)`.

**Agent creation:** `SplitLeafPane` passes `onAddAgent={handleAddAgent}` to `TabBar`. The `handleAddAgent` function sends a `terminal.create` request with `command: 'pi'`, creates an agent tab, and registers the resulting terminal. This powers the + button dropdown in the `TabBar`, which offers both "Terminal" and "Agent" options.

**Context menu integration:** The `TabBar` receives `onSplitRight`, `onSplitDown`, and `onClosePane` callbacks. These are pre-bound with the pane's `paneId` so the tab context menu can trigger split/close operations scoped to this pane.

**External commands:** The pane reacts to prop-driven commands (file opens, diffs, commit highlights) via `useEffect`, calling back via `onFileOpened`/`onDiffOpened`/`onCommitHighlighted` to acknowledge completion.

---

## Data Flow

### Split Operation

```
TabBar context menu ("Split Right/Down")
  → onSplitRight/onSplitDown(paneId, tabId?)
    → WorkspaceView.handleSplitPane(paneId, direction, tabId?)
      → useSplitLayout.splitPane(paneId, direction)
        → pane-tree.splitPane(layout, paneId, direction) — creates new SplitNode
        → Auto-focuses the new pane
        → Debounced config.set fires
      → [if tabId provided] requestAnimationFrame:
        → sourceHandle.transferTabOut(tabId)
        → newHandle.receiveTab(terminalId, title, cwd, customTitle)
        → Update terminalRegistry mapping
```

When a tab is moved during a split, the terminal's PTY is **not** restarted — only the UI mapping changes. The `transferTabOut`/`receiveTab` methods on `TerminalPanelHandle` move the terminal's DOM node from one pane's container to another's.

### Close Operation

```
TabBar context menu ("Close Pane")
  → onClosePane(paneId)
    → WorkspaceView.handleClosePane(paneId)
      → Close all PTYs in the pane via terminal.close
      → useSplitLayout.removePane(paneId)
        → pane-tree.removePane(layout, paneId) — promotes sibling
        → Returns removedPanes[]
      → Clean up terminalRegistry entries for removed panes
      → If focused pane was removed, auto-focus first surviving pane
```

### Focus Tracking

```
mousedown on SplitLeafPane
  → onFocus()
    → SplitPaneLayout.onFocusPane(paneId)
      → WorkspaceView.setFocusedPaneId(paneId)
        → useSplitLayout.focusedPaneId updates
          → SplitLeafPane re-renders with focused={true}
            → Border changes to accent color
```

### Persistence

```
Layout state change (split/remove/drag)
  → useSplitLayout.effect fires
    → 300ms debounce timer starts
      → sendRequest('config.set', { key: `pane_layout_${workspaceId}`, value: serializedLayout })
        → Server stores the JSON blob

Workspace switch:
  → useSplitLayout.loadLayout(workspaceId)
    → sendRequest('config.get', { key: `pane_layout_${workspaceId}` })
    → deserializeLayout(json) → LayoutNode
    → Falls back to createDefaultLayout() on failure
```

---

## Server Integration

### Layout Persistence

Layout persistence is entirely **client-side** via the generic `config.set`/`config.get` RPC. The server stores an opaque JSON string under the key `pane_layout_{workspaceId}`. The server has no knowledge of the layout schema — validation happens in `deserializeLayout` on the client.

### Tab Persistence

Individual tab state is persisted separately through server-backed operations:

| Operation      | RPC           | Description                                               |
| -------------- | ------------- | --------------------------------------------------------- |
| Tab creation   | `tab.create`  | Persists tab metadata (type, title, filePath, pane, etc.) |
| Tab deletion   | `tab.delete`  | Removes persisted tab record                              |
| Tab reordering | `tab.reorder` | Updates persisted tab order                               |
| Tab activation | `tab.update`  | Marks a tab as active (activate event)                    |

Note: Tab title and cwd changes are tracked **locally in the client only** and are never synced to the server. The client does not send `tab.update` with a `title` field. Title and cwd are derived from the terminal process state (e.g., shell prompt, `pwd`) and are ephemeral per session. The `terminal_id` is an exception — it **is** persisted in `persisted_tabs` via `savePersistedTab` and is synced to the server so that live terminals can be reused across sessions (see [Tab Restoration](#tab-restoration)).

### Tab Restoration

When a workspace is loaded, `WorkspaceView` calls `tab.restore` to fetch persisted tabs:

```typescript
const res = await sendRequest<TabRestoreResponse>('tab.restore', { workspaceId });
```

Tabs are grouped by pane ID and loaded into the corresponding `TerminalPanelHandle` via `loadRestoredTabs`. For terminal tabs, the server checks whether the persisted `terminal_id` is still alive in the PTY manager:

- **Live terminal** — If `terminal_id` is present, `ptyManager.has(id)` is true, and `ptyManager.hasExited(id)` is false, the existing PTY is reused. The server re-attaches output/exit callbacks and re-associates the pane with the existing terminal. No new PTY is spawned.
- **Dead or missing terminal** — If the `terminal_id` has exited or was never persisted, a new PTY is created via `ptyManager.create` with the persisted `cwd` (resolved relative to the workspace root). The new terminal ID is then written back into `persisted_tabs` via `savePersistedTab` so future restores reference the live terminal.

Editor tabs are reconstructed from their persisted `filePath`.

Restoration is best-effort — failures are silently caught to avoid blocking workspace load.
