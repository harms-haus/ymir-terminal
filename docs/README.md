# Ymir — Documentation

> Ymir is a web-based terminal IDE with real-time file management, git integration, and multi-terminal support.

## Documentation Index

| Document                                  | Description                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Architecture](architecture.md)           | Overview, monorepo structure, tech stack, project layout, getting started, testing, configuration, Windows support                                   |
| [WebSocket Protocol](protocol.md)         | JSON envelope format, message flow, full channel reference, authentication flow                                                                      |
| [Components](components.md)               | React component reference, project sidebar, git panels and hooks, inline git status, accessibility notes                                             |
| [Tab System](tab-system.md)               | Tab interface, `useTabs` hook, `TabBar` component, drag-and-drop architecture, imperative handles, OSC 7 CWD tracking, batch close behavior          |
| [Pane Splitting](pane-splitting.md)       | Architecture and API reference for the recursive pane-splitting system (pane tree model, layout hooks, leaf pane components, persistence, data flow) |
| [CLI & Distribution](cli-distribution.md) | CLI commands, binary layout, npm packages, build scripts, version synchronization, release process                                                   |
| [Desktop App](desktop-app.md)             | Tauri sidecar pattern, frameless window, auto-authentication, Tauri file reference, frontend integration files                                       |

## Quick Links

- **Getting started** → see [Architecture → Getting Started](architecture.md#getting-started)
- **WebSocket channels** → see [Protocol → Channel Reference](protocol.md#channel-reference)
- **Component reference** → see [Components → Key Components](components.md#key-components)
- **Tab drag-and-drop** → see [Tab System → Drag-and-Drop Architecture](tab-system.md#drag-and-drop-architecture)
- **Release process** → see [CLI & Distribution → Release Process](cli-distribution.md#release-process)
- **Tauri sidecar** → see [Desktop App → Sidecar Pattern](desktop-app.md#sidecar-pattern)

## Archive

Historical planning documents are stored in [`docs/archive/`](archive/).
