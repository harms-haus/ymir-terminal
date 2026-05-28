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

## Production

Build the client and start the production server:

```bash
bun run build && YMIR_PASSWORD=yourpass bun run start
```

## CLI Usage

Run the server directly with fine-grained control over options:

```bash
bun apps/server/src/index.ts --password=<pass> [--port=3000] [--host=127.0.0.1]
```

| Flag            | Default     | Description                     |
| --------------- | ----------- | ------------------------------- |
| `--password`    | (required)  | Authentication password         |
| `--port`        | `3000`      | Server port                     |
| `--host`        | `127.0.0.1` | Server bind address             |
| `--staticDir`   | auto        | Path to built client static dir |

In production, static files are served from the client build output (`apps/client/dist/`) with SPA fallback routing. Unmatched routes return `index.html`.

## Architecture

- **Client** (`apps/client`) — React + Vite SPA with terminal emulator, code editor, and file tree
- **Server** (`apps/server`) — Bun server handling WebSocket messaging and HTTP static file serving
- **Shared** (`packages/shared`) — Shared types, error codes, and protocol definitions
