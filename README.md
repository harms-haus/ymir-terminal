# Ymir Terminal

A web-based terminal IDE with real-time collaboration, file management, and git integration, powered by Bun and WebSocket.

## Installation

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

## Production

Build the client and start the production server:

```bash
bun run build && YMIR_PASSWORD=yourpass bun run start
```

## CLI Usage

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
