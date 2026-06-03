# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
- AI agent status indicator: animated status dots in terminal tabs and workspace/worktree sidebar items showing the operational state of coding agents (Claude, OpenCode, PI, Aider, Codex)
  - Pulsing blue dot when agent is working, pulsing orange dot when waiting for input, static green dot when done
  - Toast notifications when agent needs user input or finishes a task
  - OSC 777 escape sequence parsing (Warp cli-agent protocol compatible) for agent-self-reported status
  - Server-side process monitor polling for agent process detection with CPU-activity heuristics
  - `agent.status` WebSocket event and `agent.statusQuery` WebSocket request channels

### Changed

- Pane type changed from `'content' | 'bottom'` to dynamic string IDs
- `useTerminalRegistry` refactored from 2-pane to N-pane model
- `usePaneBounds` refactored from fixed containers to dynamic registration
- `TerminalManager` refactored for dynamic pane bounds lookup
- DnD groups changed from hardcoded 'content'/'bottom' to dynamic pane IDs

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
