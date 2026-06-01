# Ymir Terminal

A web-based terminal IDE with real-time collaboration, file management, and git integration, powered by Bun and WebSocket.

## Prerequisites

- **Bun** ≥ 1.x — runtime and package manager
- **Rust toolchain** (rustc ≥ 1.77.2, cargo) — required for building the desktop app
- **Tauri system dependencies**:
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libssl-dev`, `build-essential`
  - **macOS**: Xcode Command Line Tools

## Installation

### npm (recommended)
```bash
npm install -g ymir
```

### From source (requires Bun + Rust)
```bash
bun run https://raw.githubusercontent.com/harms-haus/ymir-terminal/main/scripts/install.ts
```

### Manual download
Download the latest release from [GitHub Releases](https://github.com/harms-haus/ymir-terminal/releases).

### Development
```bash
bun install
```

## Development

Start both the client dev server (Vite) and the backend server with hot reload:

```bash
bun run dev
```

## Scripts

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `bun run dev`          | Start concurrent server + client dev |
| `bun run build`        | Build client for production          |
| `bun run start`        | Start production server              |
| `bun run test`         | Run all tests                        |
| `bun run lint`         | Run ESLint                           |
| `bun run lint:fix`     | Run ESLint with auto-fix             |
| `bun run format`       | Format code with Prettier            |
| `bun run format:check` | Check formatting with Prettier       |
| `bun run typecheck`    | Run TypeScript type checking         |
| `bun run build:sidecar` | Compile Bun server into standalone binary for Tauri sidecar |
| `bun run build:client` | Build the client SPA (alias for `bun run --cwd apps/client build`) |
| `bun run build:tauri`  | Full production desktop build (sidecar + client + Tauri bundle) |
| `bun run dev:tauri`    | Run the desktop app in development mode with hot reload |

## Production

Build the client and start the production server:

```bash
bun run build && YMIR_PASSWORD=yourpass bun run start
```

## Server CLI

Run the server directly with fine-grained control over options:

```bash
# Recommended — password is not visible in process listings
YMIR_PASSWORD=secret bun apps/server/src/index.ts [--port=3000] [--host=127.0.0.1]

# Alternatively, use --password (note: visible in process listings)
bun apps/server/src/index.ts --password=<pass> [--port=3000] [--host=127.0.0.1]
```

| Flag          | Default      | Description                     |
| ------------- | ------------ | ------------------------------- |
| `--password`  | (required)\* | Authentication password         |
| `--port`      | `3000`       | Server port                     |
| `--host`      | `127.0.0.1`  | Server bind address             |
| `--staticDir` | auto         | Path to built client static dir |

\* Or set the `YMIR_PASSWORD` environment variable.

In production, static files are served from the client build output (`apps/client/dist/`) with SPA fallback routing. Unmatched routes return `index.html`.

## Security

- **Argon2id password hashing** — passwords are hashed at startup using Bun's built-in Argon2id implementation
- **JWT authentication** — HS256-signed tokens (via `jose`) with 7-day expiry; validated on every request
- **Rate limiting** — 5 authentication attempts per minute per WebSocket connection before lockout
- **Path traversal protection** — all file operations resolve paths against the workspace CWD; requests escaping the workspace are rejected
- **Session isolation** — each client receives a unique session ID; sessions are tracked independently in the server
- **Password max length** — passwords exceeding 128 characters are rejected before hashing

## Known Limitations

- **Recursive file watching on Linux** — `fs.watch` with `recursive: true` is only reliable on macOS and Windows. On Linux, changes in nested (deeply nested) directories may not be detected. A future update should replace this with manual recursive watching or a library like `chokidar`.

## Architecture

- **Client** (`apps/client`) — React + Vite SPA with terminal emulator, code editor, and file tree
- **Server** (`apps/server`) — Bun server handling WebSocket messaging and HTTP static file serving
- **Shared** (`packages/shared`) — Shared types, error codes, and protocol definitions

## Desktop App

Ymir can run as a native desktop application using Tauri 2.x. The desktop app:

- Starts the Bun server automatically as a sidecar process
- Auto-generates and manages authentication (no password configuration needed)
- Runs as a frameless window with a custom title bar
- Supports Wayland with automatic X11 fallback on Linux

### Development

```bash
bun run dev:tauri
```

This starts the Tauri development build which compiles the Rust backend, builds the sidecar, and launches the desktop app with hot reload.

### Production Build

```bash
bun run build:tauri
```

This produces a platform-specific installer (`.deb`, `.AppImage`, `.dmg`, `.exe`) in `src-tauri/target/release/bundle/`.

### Architecture

- **Sidecar**: The Bun server is compiled into a standalone binary (`ymir-server-{target-triple}`) and bundled with the Tauri app
- **Auto-auth**: A random password is generated on first launch and stored in `~/.config/ymir/tauri-password`
- **Frameless window**: The native title bar is hidden; the app's command bar doubles as the drag region with custom window controls

## CLI Usage

```bash
ymir                        # Launch the desktop app
ymir web --password <pw>    # Start web server (opens browser)
ymir update                 # Update to latest version
ymir --version              # Show version
ymir --help                 # Show help
```

### Web Mode Options

```
ymir web --password <pw> [--host <addr>] [--port <port>] [--no-open]

Options:
  --password, -p <pw>   Password for authentication (required)
  --host <addr>         Host to bind to (default: 127.0.0.1)
  --port <port>         Port to listen on (default: 3000)
  --no-open             Don't open browser automatically
```

### Release Process

See the [Release Checklist template](.github/ISSUE_TEMPLATE/release-checklist.md) for the release workflow.
