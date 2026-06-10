# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ConnectionUrlContext` — shared React context for tracking active connection URL across the app
- `clearToken()` and `suppressAutoLogin()` to AuthProvider — enables proper auth state management during server switches
- `disconnectAndRejectPending()` to WSClient — rejects in-flight requests when switching servers
- Stale request rejection in `sendRequest()` — uses epoch counter to detect connection resets
- Connection manager popover on login page — users can switch servers before authenticating
- Pane splitting: recursive binary tree layout with dynamic left/right and top/bottom splits
- `SplitPaneLayout` and `SplitLeafPane` components for recursive pane rendering
- `useSplitLayout` hook with debounced layout persistence per workspace
- `useTerminalPane` hook for per-pane tab management with server sync
- Unified `TerminalPanelHandle` imperative handle (replaces ContentPaneHandle/BottomPanelHandle)
- Right-click context menus on tab bar for split/close operations
- Cross-pane drag-and-drop for terminal tabs between any panes
- Focused pane visual indicator with accent color border
- `tab.restore` server channel for tab restoration after restart
- `persisted_tabs` server database table for tab persistence
- Layout persistence via config key `pane_layout_{workspaceId}`
- CLI wrapper with `ymir`, `ymir web`, and `ymir update` commands
- Cross-platform support (Linux + Windows)
- Windows PTY support via ConPTY
- npm package distribution with platform-specific binaries
- From-source install script (`scripts/install.ts`)
- GitHub Actions release workflow with automated npm publishing
- Version synchronization script (`scripts/sync-version.ts`)
- npm publish helper script (`scripts/publish-npm.ts`)
- Cross-platform build scripts replacing bash-only scripts
- BFS git repo discovery: progressive async repo discovery with per-depth WebSocket progress events (`git.repoDiscovery.progress`)
- `GitRepoDiscoveryProgressEvent` protocol type for incremental discovery results
- Progressive git watcher startup: watchers start per BFS depth rather than after full discovery completes
- Client-side progressive repo loading: `useGitRepos` subscribes to discovery progress events to show repos incrementally as they're found
- Path autocomplete in workspace creation dialog (`PathAutocompleteInput`) with server-side directory listing, debounced fetch, keyboard navigation (Tab/Enter to accept, ArrowUp/Down to navigate, Escape to dismiss), and ARIA combobox semantics
- `path.autocomplete` WebSocket channel for listing directories (1-level deep, sorted, max 256 entries, tilde expansion)
- `listDirectories()` server utility for async directory scanning
- `usePathAutocomplete` client hook with 300ms debounce and AbortController race-condition handling
- `parsePathInput` pure utility for splitting path strings into query directory and filter prefix
- File content search tab in the project sidebar with find and find/replace modes
- Streaming search results via ripgrep (`file.search` and `file.search.progress` WebSocket channels)
- Find-and-replace across files (`file.search.replace` WebSocket channel)
- Search options: case sensitive, whole word, regex, file include pattern
- Collapsible file-grouped search results with highlighted match text
- Replace preview: original text shown crossed-out in red, replacement shown in green
- `useFileContentSearch` React hook with streaming results and abort support
- Shared `CollapsibleSection` component (extracted from GitChangesSection)
- 10 search color theme constants
- 3 icon tab header for project sidebar (File Explorer, Source Control, Search)
- Clickable URLs in editor, diff viewer, and terminal — Ctrl+click (Cmd+click on macOS) any URL to open it in the system browser
- `lib/url-opener.ts` — shared utility for opening external URLs via Tauri opener plugin or `window.open`
- `lib/monaco-links.ts` — shared Monaco link provider and opener registration for URL detection in editor content
- `@tauri-apps/plugin-opener` npm package for native URL opening in Tauri desktop mode
- `tauri-plugin-opener` Rust crate registered in Tauri builder
- `opener:default` capability permission added for URL opening
- `window.open` monkey-patch in Tauri mode routes ghostty-web terminal link clicks through native opener
- TabBar `+` button dropdown with 'Terminal' and 'Agent' options when `onAddAgent` prop is provided
- `YmirLogo` component now accepts an optional `style: React.CSSProperties` prop

### Changed

- WorkspaceViewInner remounts on server switch via `key={connectionUrl}` — ensures all state is properly reset
- useConnectionManager now clears React Query cache and auth state when connecting to a new server
- AuthProvider uses ConnectionUrlContext instead of page origin for WebSocket URL resolution
- Pane type changed from `'content' | 'bottom'` to dynamic string IDs
- `useTerminalRegistry` refactored from 2-pane to N-pane model
- `usePaneBounds` refactored from fixed containers to dynamic registration
- `TerminalManager` refactored for dynamic pane bounds lookup
- DnD groups changed from hardcoded 'content'/'bottom' to dynamic pane IDs
- Replace `computeLanes()` lane-assignment algorithm with topological-sort-based algorithm adapted from DoltHub `commit-graph` (Apache 2.0, vendored inline in `commit-graph-position.ts`); public API unchanged — no consumer code modified
- Optimize `computeActiveLanes()` from O(n²) to O(n+E) using a sweep-line approach
- `CreateWorkspaceDialog` path input now uses `PathAutocompleteInput` with directory autocomplete dropdown
- RightSidebar header redesigned with 3 codicon icon tabs (was 2 toggle buttons)
- GitChangesSection refactored to use shared CollapsibleSection
- `Dialog` focus trap now respects `defaultPrevented` on Tab and Escape events, allowing nested controls (like comboboxes) to handle these keys themselves
- Empty tab state now renders a centered `YmirLogo` (33% width, max 150px) instead of 'No tabs open' text and action buttons
- `SplitLeafPane` now passes `onAddAgent` to `TabBar` for agent tab creation via the `+` dropdown
- Agent creation moved from `PaneContent` `onOpenAgent` prop to `TabBar` `+` dropdown

### Refactoring

- Split `useGitRepos` monolith into 5 domain hooks: `useGitDiscovery`, `useGitStatus`, `useGitOperations`, `useGitBranches`, `useGitStash` (`hooks/git/`)
- Split `GitTreeTab` monolith into sub-components: `GitCommitList`, `GitCommitDetail`, `GitCommitFilter`, `FileRow`, `TreeRow` (`components/git-tree/`)
- Split `GitRepoMenu` monolith into submenu configs: `commitMenuItems`, `branchMenuItems`, `changesMenuItems`, `stashMenuItems`, `pullPushMenuItems`, `remoteMenuItems` (`components/git-menu/`)
- Extract shared `CommitGraphRow` from `GitHistoryPanel` and `GitTreeTab` (`components/git-graph/`)
- Extract shared `PaneContent` base component for `ContentPane` and `SplitLeafPane`
- Create `FileTreeContext` to eliminate prop drilling in file tree
- Extract `useTabDragDrop`, `useTabRestore`, `usePaneCallbacks` hooks from `WorkspaceView`
- Deduplicate test helpers across server and client test files

### Bug Fixes

- Fix PTY Manager unhandled rejection in `onExit` callbacks
- Fix `GitStatusWatcher` cache invalidation race condition
- Fix PTY resize SIGWINCH TOCTOU and silent return on invalid dimensions
- Fix WS close handler race condition
- Fix status watcher error swallowing and safety-poll races
- Fix file handler error propagation
- Fix `stopAllWatchers` Map mutation during iteration
- Fix auth session leak on reconnect
- Fix server switching not properly re-initializing application state like a fresh start
- Fix `useCreateTerminalTab` stale `tabs.length` closure
- Fix hardcoded `isRebaseInProgress` and merge target
- Fix `FileTree` listener churn and `useTheme` memo
- Fix `useGitRepos` discovery race and serial fetching
- Fix `Terminal.tsx` missing resize deps
- Fix CLI update archive extraction and macOS support
- Fix CLI web signal forwarding
- Fix Rust mutex poisoning in `log.rs` and sidecar cleanup
- Fix Rust sidecar `target_triple` and `build.rs` safeguards

### Security

- Add branch name validation to git push and sync operations
- Replace `execSync` with `execFileSync` in CLI update (command injection fix)
- Add `file.write` size limit (50MB) and config value validation
- Add IP-based rate limiting for authentication
- Restrict `addRemote` URL validation to prevent SSRF
- Sanitize error messages to prevent path leakage
- Use `WeakMap` for WS connection storage

### Accessibility

- Add React `ErrorBoundary` to app root
- Fix invisible focus indicators on `FileTree` and `GitCommitFilter`
- Add arrow-key navigation to `FileTree`
- Make `TabBar` context menu keyboard accessible
- Expand `Dialog` focus trap to include `select`/`textarea`/`a[href]`

### Removed

- `getWsUrl()` function from useAuth (replaced by ConnectionUrlContext)
- `PaneContent` `onOpenAgent` prop — agent creation is now via the TabBar `+` dropdown

### Dead Code Removal

- Remove unused server exports and wire `deletePersistedTabsByWorkspace`
- Move `chokidar` to server package, remove from root
- Inline `RightSidebar.css`
- Remove unused `commit` function from `useGitRepos`
- Remove unused `GitFileChangeStatus` `'?'` variant
- Remove unused constants and duplicated imports

### Tests

- Add `AppContextMenu` component tests
- Add `CreateWorktreeDialog` and `MergeWorktreeDialog` tests
- Add `GitChangesSection` component tests
- Fix flaky timing tests with configurable debounce
- Fix tautological tests and strengthen weak assertions
- Fix `mock.module` contamination and test isolation

## [0.1.0] - 2026-05-31

### Added

- Web-based terminal IDE with PTY management
- File browser and editor with syntax highlighting
- Git integration (status, staging, committing, branching, push/pull)
- Workspace management with multi-root support
- Tab system with drag-and-drop reordering
- Tauri v2 desktop app with sidecar server architecture
- WebSocket-based client-server architecture
- JWT authentication with Argon2id password hashing
- Terminal split panes and bottom panel
- Worktree support for Git worktrees
