# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- CLI wrapper with `ymir`, `ymir web`, and `ymir update` commands
- Cross-platform support (Linux + Windows)
- Windows PTY support via ConPTY
- npm package distribution with platform-specific binaries
- From-source install script (`scripts/install.ts`)
- GitHub Actions release workflow with automated npm publishing
- Version synchronization script (`scripts/sync-version.ts`)
- npm publish helper script (`scripts/publish-npm.ts`)
- Cross-platform build scripts replacing bash-only scripts

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
