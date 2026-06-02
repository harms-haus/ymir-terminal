# Ymir Implementation Plan

> **@harms-hhaus/ymir** — Web-based terminal workspace manager (herdr clone)

## Overview

Ymir is a browser-based terminal workspace manager built with Bun, TanStack Start, ghostty-web, and SQLite. It provides multiple isolated workspaces with terminal instances, a file tree with git status, and a code editor — all accessible via WebSocket.

---

## Phase 1: Project Scaffolding & Tooling

_Foundational monorepo setup — everything else depends on this._

### 1.1 Initialize monorepo structure with Bun workspaces

- **Files:** `package.json`, `bunfig.toml`, `apps/server/package.json`, `apps/client/package.json`, `packages/shared/package.json`, `tsconfig.json`, `apps/server/tsconfig.json`, `apps/client/tsconfig.json`, `packages/shared/tsconfig.json`, `.gitignore`
- **Prompt:** Create the root `package.json` with `"workspaces": ["apps/*", "packages/*"]` and `"private": true`. Set `"name": "ymir"`. Create empty `package.json` files in each workspace: `apps/server` (name `@ymir/server`), `apps/client` (name `@ymir/client`), `packages/shared` (name `@ymir/shared`). All use `"type": "module"`. Create a root `tsconfig.json` with `"references"` pointing to each workspace. Each workspace `tsconfig.json` extends the root and sets `"composite": true`, `"strict": true`, appropriate `include`/`exclude`, and `"outDir"`. The shared package must set `"main": "src/index.ts"` (Bun resolves directly). Add `.gitignore` with `node_modules`, `dist`, `.output`, `.env`, `*.db`.
- **Verify:** `bun install` completes without errors. `bunx tsc --build` at root compiles all workspaces without errors.
- **Profile:** task-worker-lite
- **Dependencies:** None

### 1.2 Configure TypeScript project references

- **Files:** `tsconfig.json`, `apps/server/tsconfig.json`, `apps/client/tsconfig.json`, `packages/shared/tsconfig.json`
- **Prompt:** The root `tsconfig.json` uses `"files": []`, `"references"` array with paths to each workspace. Each workspace tsconfig sets `"composite": true`, `"declaration": true`, `"declarationMap": true`, `"sourceMap": true`. The `apps/server` and `apps/client` configs add `"references": [{ "path": "../../packages/shared" }]`. All configs set `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"target": "ESNext"`, `"lib": ["ESNext", "DOM"]` (DOM for client only), `"jsx": "react-jsx"` (client only), `"strict": true`, `"esModuleInterop": true`, `"skipLibCheck": true`, `"forceConsistentCasingInFileNames": true`. Set `"types": ["bun-types"]` for server and shared. Ensure path alias `@ymir/shared` resolves to `packages/shared/src` in server and client configs via `"paths"`.
- **Verify:** `bunx tsc --build` at root compiles all workspaces without errors.
- **Profile:** task-worker-lite
- **Dependencies:** 1.1

### 1.3 Set up ESLint flat config

- **Files:** `eslint.config.js`, `apps/server/eslint.config.js`, `apps/client/eslint.config.js`, `packages/shared/eslint.config.js`
- **Prompt:** Install dev dependencies at root: `eslint`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-config-prettier`. Create root `eslint.config.js` using flat config format that exports an array of config objects. Use `typescript-eslint.configs.recommended`. For the client, extend with `eslint-plugin-react` (recommended) and `eslint-plugin-react-hooks` (recommended). Apply `eslint-config-prettier` last to disable conflicting rules. Set `settings.react.version = "detect"`. Ignore patterns: `node_modules`, `dist`, `.output`, `*.js` in root. Each workspace can have its own config that imports and extends the root. Add `"lint": "eslint ."` script to root `package.json`.
- **Verify:** `bun run lint` executes without config errors (may show no-file warnings, that's OK).
- **Profile:** task-worker-lite
- **Dependencies:** 1.1

### 1.4 Set up Prettier

- **Files:** `.prettierrc`, `.prettierignore`
- **Prompt:** Create `.prettierrc` with `{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100, "tabWidth": 2 }`. Create `.prettierignore` with `node_modules`, `dist`, `.output`, `*.min.js`. Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."` scripts to root `package.json`.
- **Verify:** `bun run format:check` exits 0 after running `bun run format`.
- **Profile:** task-worker-lite
- **Dependencies:** 1.1

### 1.5 Set up bun:test infrastructure

- **Files:** `apps/server/test-setup.ts`, `apps/client/test-setup.ts`, `apps/server/bunfig.toml`, `apps/client/bunfig.toml`
- **Prompt:** Add test scripts to each workspace's `package.json`: `"test": "bun test"`, `"test:watch": "bun test --watch"`. For the client workspace, install `@testing-library/react`, `@happy-dom/global-registrator`. Create `apps/client/test-setup.ts` that imports and calls `@happy-dom/global-registrator` to register happy-dom globals. Create a placeholder test in each workspace (`apps/server/__tests__/health.test.ts`, `apps/client/__tests__/render.test.ts`) that verifies the test runner works. The client placeholder test should render a simple React element with `@testing-library/react`'s `render` and assert it appears. Configure `bunfig.toml` in each workspace with `[test]` section — client's sets `preload = ["./test-setup.ts"]`.
- **Verify:** `bun test` in each workspace runs the placeholder tests and passes.
- **Profile:** task-worker-lite
- **Dependencies:** 1.1

### 1.6 Create docs directory structure

- **Files:** `docs/plans/PLAN.md`, `docs/plans/PROGRESS.md`
- **Prompt:** Create the `docs/plans/` directory. `docs/plans/PLAN.md` contains this plan. `docs/plans/PROGRESS.md` contains a markdown template with: title "Ymir Implementation Progress", a table of phases with columns [Phase | Status | Start Date | End Date], and a section for each phase with a checkbox list of tasks. Initialize all phases as `[ ]` (not started).
- **Verify:** Both files exist and contain valid markdown.
- **Profile:** task-worker-lite
- **Dependencies:** None

### 1.7 Create dev script and CLI entry point stub

- **Files:** `apps/server/src/index.ts`, `package.json` (root scripts update)
- **Prompt:** Add root scripts: `"dev": "bun run --filter '@ymir/server' dev"`. In `apps/server/src/index.ts`, create a minimal Bun.serve placeholder that logs "Ymir server starting..." and listens on port 3000 (configurable via `--port` CLI arg). Parse CLI args `--password`, `--port`, `--host` using `process.argv` parsing (no external lib). If `--password` is missing, print usage and exit(1). In `apps/server/package.json`, add `"dev": "bun --watch src/index.ts"`, `"start": "bun src/index.ts"`. Default port is `3000`, default host is `'127.0.0.1'`. These defaults must match the constants in the shared package.
- **Verify:** `bun run dev` starts and logs the message. Running without `--password` prints usage and exits.
- **Profile:** task-worker-lite
- **Dependencies:** 1.1

---

## Phase 2: Shared Package — Types, Protocol & Constants

_All shared types and protocol definitions that both server and client depend on._

### 2.1 Define WebSocket message envelope types

- **Files:** `packages/shared/src/protocol/types.ts`, `packages/shared/src/protocol/types.test.ts`
- **Prompt:** In `types.ts`, define and export: `ProtocolVersion` (const = 1 as const), `MessageType` (union of `'request' | 'response' | 'event'`), `MessageEnvelope<T = unknown>` interface with fields `v: ProtocolVersion`, `type: MessageType`, `id?: string`, `token?: string`, `payload: T`. Define `RequestEnvelope<T>` with `type: 'request'` and required `id` and `payload`. Define `ResponseEnvelope<T>` with `type: 'response'`, `id` (required), `payload: T | ErrorResponse`. Define `EventEnvelope<T>` with `type: 'event'`, `payload: T`. Define `ErrorResponse` interface with `code: string`, `message: string`, `details?: unknown`. Define `ErrorCode` as a const enum with values: `AUTH_REQUIRED`, `AUTH_FAILED`, `INVALID_MESSAGE`, `WORKSPACE_NOT_FOUND`, `TERMINAL_NOT_FOUND`, `FILE_NOT_FOUND`, `PERMISSION_DENIED`, `INTERNAL_ERROR`. Write type guards: `isRequestEnvelope`, `isResponseEnvelope`, `isEventEnvelope`. Write tests that verify type guards work correctly with sample data, ErrorResponse validation, ErrorCode enum values are correct.
- **Verify:** `bun test` in packages/shared passes all tests.
- **Profile:** task-worker
- **Dependencies:** 1.1

### 2.2 Define protocol message payload types and request type constants

- **Files:** `packages/shared/src/protocol/payloads.ts`, `packages/shared/src/protocol/payloads.test.ts`
- **Prompt:** Define all typed payload interfaces organized by domain, AND define the string type constants used for routing:

  **Request type constants** — a `RequestType` const array and union type listing every request channel string:

  ```ts
  export const REQUEST_TYPES = [
    'auth',
    'terminal.create',
    'terminal.input',
    'terminal.resize',
    'terminal.close',
    'workspace.list',
    'workspace.create',
    'workspace.update',
    'workspace.delete',
    'tab.create',
    'tab.close',
    'tab.activate',
    'file.tree',
    'file.read',
    'file.write',
    'file.delete',
    'file.rename',
    'file.create',
    'git.status',
  ] as const;
  export type RequestType = (typeof REQUEST_TYPES)[number];
  ```

  **Event type constants** — an `EventType` const array and union type:

  ```ts
  export const EVENT_TYPES = [
    'terminal.output',
    'terminal.exit',
    'file.change',
    'session.init',
  ] as const;
  export type EventType = (typeof EVENT_TYPES)[number];
  ```

  **Auth:** `AuthRequest { password: string }`, `AuthResponse { token: string; expiresIn: number }`

  **Terminal:** `TerminalCreateRequest { workspaceId: string; cols?: number; rows?: number }`, `TerminalCreateResponse { terminalId: string }`, `TerminalInputRequest { terminalId: string; data: string }` (base64), `TerminalResizeRequest { terminalId: string; cols: number; rows: number }`, `TerminalOutputEvent { terminalId: string; data: string }` (base64), `TerminalCloseRequest { terminalId: string }`, `TerminalExitEvent { terminalId: string; exitCode: number }`

  **Workspace:** `WorkspaceListRequest {}`, `WorkspaceListResponse { workspaces: WorkspaceSummary[] }`, `WorkspaceCreateRequest { name: string; cwd: string; color: string }`, `WorkspaceCreateResponse { workspace: WorkspaceSummary }`, `WorkspaceUpdateRequest { id: string; name?: string; cwd?: string; color?: string }`, `WorkspaceDeleteRequest { id: string }`, `WorkspaceSummary { id: string; name: string; cwd: string; color: string }`

  **Tab:** `TabCreateRequest { workspaceId: string; tabType: 'terminal' | 'editor'; filePath?: string }`, `TabCloseRequest { tabId: string }`, `TabActivateRequest { tabId: string }`, `TabsListResponse { tabs: TabInfo[] }`, `TabInfo { id: string; tabType: string; title: string; active: boolean; order: number }`

  **File:** `FileTreeRequest { workspaceId: string; path?: string }`, `FileTreeResponse { tree: FileNode[] }`, `FileReadRequest { workspaceId: string; path: string }`, `FileReadResponse { content: string; language: string }`, `FileWriteRequest { workspaceId: string; path: string; content: string }`, `FileDeleteRequest { workspaceId: string; path: string }`, `FileRenameRequest { workspaceId: string; oldPath: string; newPath: string }`, `FileCreateRequest { workspaceId: string; path: string; isDirectory: boolean }`, `FileChangeEvent { workspaceId: string; path: string; kind: 'create' | 'delete' | 'rename' | 'modify' }`, `FileNode { name: string; path: string; isDirectory: boolean; children?: FileNode[] }`

  **Git:** `GitStatusRequest { workspaceId: string }`, `GitStatusResponse { branch: string | null; changes: GitFileChange[]; staged: GitFileChange[] }`, `GitFileChange { path: string; status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' }`

  **Session:** `SessionInitEvent { sessionId: string }`, `ConnectionStatusEvent { status: 'connected' | 'reconnecting' | 'disconnected' }`

  Write tests that validate: (1) each payload type can be constructed and serialized to JSON and back, (2) `REQUEST_TYPES` and `EVENT_TYPES` arrays contain all expected values, (3) the type unions are exhaustive (verify no typos in type strings).

- **Verify:** `bun test` in packages/shared passes.
- **Profile:** task-worker
- **Dependencies:** 2.1

### 2.3 Define split pane tree types

- **Files:** `packages/shared/src/protocol/panes.ts`, `packages/shared/src/protocol/panes.test.ts`
- **Prompt:** Define `SplitDirection = 'horizontal' | 'vertical'`. Define `SplitNode` interface: `id: string`, `type: 'split'`, `direction: SplitDirection`, `children: LayoutNode[]`, `sizes?: number[]` (percentages summing to 100). Define `PaneNode` interface: `id: string`, `type: 'pane'`. Define `LayoutNode = SplitNode | PaneNode`. Define type guards `isSplitNode` and `isPaneNode`. Define helpers: `findPaneById(root, id)`, `replacePane(root, paneId, replacement)`, `removePane(root, paneId)`. Write tests for all helpers with 2-level deep split tree structures.
- **Verify:** `bun test` in packages/shared passes.
- **Profile:** task-worker
- **Dependencies:** 1.1

### 2.4 Define shared constants and utility functions

- **Files:** `packages/shared/src/constants.ts`, `packages/shared/src/utils.ts`, `packages/shared/src/utils.test.ts`
- **Prompt:** In `constants.ts`, export: `PROTOCOL_VERSION = 1`, `DEFAULT_COLS = 80`, `DEFAULT_ROWS = 24`, `JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60`, `WS_RECONNECT_ATTEMPTS = 5`, `WS_RECONNECT_BASE_DELAY_MS = 1000`, `WS_RECONNECT_MAX_DELAY_MS = 16000`, `DEFAULT_PORT = 3000`, `DEFAULT_HOST = '127.0.0.1'`, `CONFIG_DIR = '~/.config/ymir'`, `DB_FILE = 'ymir.db'`, `BOTTOM_PANEL_DEFAULT_HEIGHT = 200`, `SIDEBAR_DEFAULT_WIDTH = 250`. In `utils.ts`, export: `generateId()` (crypto.randomUUID()), `toBase64(data: Uint8Array | string): string`, `fromBase64(data: string): Uint8Array`, `delay(ms: number): Promise<void>`, `clamp(value, min, max): number`, `expandTilde(path: string): string`, `getConfigPath(): string`, `getDbPath(): string`. Write tests for toBase64/fromBase64 roundtrip, clamp, expandTilde, generateId uniqueness, delay.
- **Verify:** `bun test` in packages/shared passes.
- **Profile:** task-worker
- **Dependencies:** 1.1

### 2.5 Create shared package entry point and re-exports

- **Files:** `packages/shared/src/index.ts`, `packages/shared/src/protocol/index.ts`
- **Prompt:** Create barrel files. `packages/shared/src/protocol/index.ts` re-exports everything from `types.ts`, `payloads.ts`, `panes.ts`. `packages/shared/src/index.ts` re-exports `./protocol/index`, `./constants`, `./utils`. Ensure all types and values are accessible via `import { ... } from '@ymir/shared'`.
- **Verify:** `bunx tsc --build packages/shared` compiles. A test file can `import { PROTOCOL_VERSION, MessageEnvelope, generateId } from '@ymir/shared'` and use them.
- **Profile:** task-worker-lite
- **Dependencies:** 2.1, 2.2, 2.3, 2.4

---

## Phase 3: Server Foundation — Auth, Database & WebSocket

_Core server infrastructure: authentication, database layer, and WebSocket connection handling._

### 3.1 Implement Argon2id password hashing utilities

- **Files:** `apps/server/src/auth/password.ts`, `apps/server/src/auth/password.test.ts`
- **Prompt:** Write tests FIRST. Test file verifies: (1) `hashPassword(password)` returns a string, (2) `verifyPassword(password, hash)` returns true for correct password, (3) `verifyPassword` returns false for wrong password, (4) different passwords produce different hashes. Then implement: `hashPassword(password: string): Promise<string>` using `Bun.password.hash(password, { algorithm: "argon2id" })` (uses Argon2id defaults — no need to specify memoryCost/timeCost). `verifyPassword(password: string, hash: string): Promise<boolean>` using `Bun.password.verify(password, hash)`. Export both.
- **Verify:** `bun test apps/server/src/auth/password.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 1.1, 2.1

### 3.2 Implement JWT token management

- **Files:** `apps/server/src/auth/jwt.ts`, `apps/server/src/auth/jwt.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `generateToken()` returns a JWT string, (2) `verifyToken(token)` returns valid payload with `sessionId`, (3) `verifyToken` throws on expired token, (4) `verifyToken` throws on invalid token, (5) `generateSigningSecret()` returns a cryptographically random string. Then implement using `jose` library: `generateSigningSecret(): string` using `crypto.randomUUID() + crypto.randomUUID()`. `generateToken(sessionId, secret): Promise<string>` using `jose.SignJWT({ sessionId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(...)`. `verifyToken(token, secret): Promise<{ sessionId: string }>` using `jose.jwtVerify`. Export all three. Create `apps/server/src/auth/index.ts` barrel.
- **Verify:** `bun test apps/server/src/auth/jwt.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 1.1, 2.1

### 3.3 Implement persistent database layer (workspaces)

- **Files:** `apps/server/src/db/persistent.ts`, `apps/server/src/db/persistent.test.ts`, `apps/server/src/db/migrations/001_initial.sql`
- **Prompt:** Write tests FIRST. Tests verify: (1) `initDatabase(dbPath)` creates the workspaces table, (2) `createWorkspace(db, { name, cwd, color })` inserts and returns workspace with generated UUID and timestamps, (3) `listWorkspaces(db)` returns all workspaces ordered by name, (4) `getWorkspace(db, id)` returns single workspace or null, (5) `updateWorkspace(db, id, fields)` updates only provided fields and updates `updated_at`, (6) `deleteWorkspace(db, id)` removes the workspace. Then implement: `initDatabase(dbPath)` creates `~/.config/ymir/` dir if needed, opens SQLite with `new Database(dbPath)`, runs migration SQL. All CRUD functions take db as first arg. Use `import { Database } from 'bun:sqlite'`. Use prepared statements. Export all functions. Migration SQL creates:
  ```sql
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cwd TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#007acc',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
- **Verify:** `bun test apps/server/src/db/persistent.test.ts` passes. Tests use `:memory:` SQLite for isolation.
- **Profile:** task-worker
- **Dependencies:** 1.1, 2.4

### 3.4 Implement in-memory session database

- **Files:** `apps/server/src/db/session.ts`, `apps/server/src/db/session.test.ts`
- **Prompt:** Write tests FIRST. Tests verify for each table: (1) `createSession(db)` inserts into `client_sessions`, (2) `deleteSession(db, sessionId)` cascades deletes, (3) `createTab(db, { sessionId, workspaceId, tabType, order })`, (4) `listTabs(db, sessionId, workspaceId)`, (5) `updateTab(db, tabId, { active, order })`, (6) `deleteTab(db, tabId)`, (7) `createPane(db, { tabId, terminalId })`, (8) `createTerminalInstance(db, { sessionId, workspaceId, paneId, cols, rows })`, (9) `getTerminalInstance(db, terminalId)`, (10) `updateTerminalSize(db, terminalId, cols, rows)`, (11) `deleteTerminalInstance(db, terminalId)`, (12) `createBottomPanelTab(db, { sessionId, workspaceId, order })`, (13) `listBottomPanelTabs(db, sessionId, workspaceId)`. Then implement: `initSessionDb()` returns `new Database(':memory:')` with the following tables created:

  ```sql
  CREATE TABLE client_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE tabs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES client_sessions(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    tab_type TEXT NOT NULL CHECK(tab_type IN ('terminal', 'editor')),
    title TEXT,
    file_path TEXT,
    active INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE panes (
    id TEXT PRIMARY KEY,
    tab_id TEXT NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    terminal_id TEXT,
    layout_json TEXT
  );

  CREATE TABLE terminal_instances (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES client_sessions(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    pane_id TEXT REFERENCES panes(id),
    cols INTEGER NOT NULL DEFAULT 80,
    rows INTEGER NOT NULL DEFAULT 24,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE bottom_panel_tabs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES client_sessions(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    terminal_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```

  Enable `PRAGMA foreign_keys = ON`. Note: WAL mode is not applicable to `:memory:` databases — do not set it. All CRUD with prepared statements. `cleanupSession(db, sessionId)` deletes all related records. Export all.

- **Verify:** `bun test apps/server/src/db/session.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 1.1, 2.4

### 3.5 Implement WebSocket server with Bun.serve

- **Files:** `apps/server/src/ws/server.ts`, `apps/server/src/ws/connection.ts`, `apps/server/src/ws/server.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) WebSocket server starts and accepts connections, (2) connection receives messages and routes them, (3) disconnection is detected, (4) auth is enforced (unauthenticated connections receive error). Then implement: `startWebSocketServer(options)` creates `Bun.serve` with `websocket` handlers: `open`, `message`, `close`. `connection.ts` defines `ClientConnection` class wrapping a `ServerWebSocket`, tracks `sessionId`, `isAuthenticated`, `lastActive`, provides `send(envelope)`, `close()`. Maintain `Map<string, ClientConnection>` of active connections. On `open`, store as unauthenticated. On `message`, parse JSON, if not authenticated only allow `auth` type. On `close`, mark session disconnected but do NOT destroy PTY processes (keep alive for reconnect). Export `startWebSocketServer` and connections map.
- **Verify:** `bun test apps/server/src/ws/server.test.ts` passes. Tests use a test WebSocket client.
- **Profile:** task-worker
- **Dependencies:** 3.2, 3.3, 3.4

### 3.6 Implement message parsing and request/response correlation

- **Files:** `apps/server/src/ws/router.ts`, `apps/server/src/ws/router.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `parseMessage(raw)` returns typed `MessageEnvelope` or throws, (2) `createResponse(request, payload)` creates correct response with matching `id`, (3) `createError(request, code, message)` creates error response, (4) `createEvent(type, payload)` creates event envelope, (5) invalid JSON throws, (6) wrong protocol version throws, (7) missing type throws. Then implement: `parseMessage(raw): MessageEnvelope` JSON.parses, validates `v`, validates `type`. `createResponse`, `createError`, `createEvent` factories. Define `MessageRouter` class with `handle(type: RequestType | string, handler)` and `route(conn, envelope)` dispatching to registered handlers by matching `envelope.payload` discriminator or a `channel` field. The envelope must carry a `channel` field (string from `RequestType`/`EventType`) that the router uses to dispatch. Update `MessageEnvelope` in shared types to include `channel?: string` field. Export all.
- **Verify:** `bun test apps/server/src/ws/router.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 2.1, 2.2

### 3.7 Implement auth message handler

- **Files:** `apps/server/src/ws/handlers/auth.ts`, `apps/server/src/ws/handlers/auth.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) correct password returns `AuthResponse` with token, (2) wrong password returns error with `AUTH_FAILED`, (3) subsequent requests with valid token are accepted, (4) invalid token returns `AUTH_REQUIRED` error. Then implement: `registerAuthHandlers(router, { passwordHash, signingSecret })` registers handler for `'auth'` request type. Handler verifies password, generates JWT, marks connection authenticated, responds. Add `authenticateConnection(conn, token, secret)` helper that verifies JWT. Register as middleware for all non-auth requests. Export `registerAuthHandlers`.
- **Verify:** `bun test apps/server/src/ws/handlers/auth.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 3.1, 3.2, 3.5, 3.6

### 3.8 Wire server entry point with auth and WebSocket

- **Files:** `apps/server/src/index.ts`, `apps/server/src/server.ts`
- **Prompt:** Refactor `index.ts` to CLI entry only (parse args, validate password, call start). Create `server.ts` with `startServer({ password, port, host })`: (1) hash password at startup, (2) generate JWT signing secret, (3) init persistent DB at `~/.config/ymir/ymir.db`, (4) init in-memory session DB, (5) start WebSocket server, (6) register auth handlers, (7) log startup info. Graceful shutdown on SIGINT/SIGTERM: close connections, PTYs, DBs. Export `startServer`.
- **Verify:** Server starts with `bun apps/server/src/index.ts --password=test123`, accepts WebSocket connections, auth flow works end-to-end.
- **Profile:** task-worker
- **Dependencies:** 3.5, 3.6, 3.7

---

## Phase 4: Server Features — PTY, File Operations & Git Status

_Core server-side functionality: terminal management, file system operations, and git integration._

### 4.1 Implement PTY process manager

- **Files:** `apps/server/src/pty/manager.ts`, `apps/server/src/pty/manager.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `spawnTerminal(id, { cols, rows, cwd, shell })` creates PTY and returns `TerminalProcess`, (2) `writeToTerminal(id, data)` sends data to stdin, (3) `resizeTerminal(id, cols, rows)` resizes PTY, (4) `killTerminal(id)` kills process, (5) `getTerminal(id)` returns process or undefined, (6) `listTerminals()` returns all active, (7) PTY output triggers data callback, (8) PTY exit triggers exit callback. Then implement: `TerminalProcess` class wrapping `Bun.spawn` with `terminal` option. Use arrow functions for the data/exit callbacks to correctly capture `this`:

  ```ts
  class TerminalProcess {
    private proc: Subprocess;
    onData?: (data: Uint8Array) => void;
    onExit?: (exitCode: number) => void;

    constructor(id: string, opts: { cols: number; rows: number; cwd: string; shell?: string }) {
      this.proc = Bun.spawn([opts.shell || process.env.SHELL || '/bin/bash'], {
        cwd: opts.cwd,
        terminal: {
          cols: opts.cols,
          rows: opts.rows,
          data: (_terminal, data) => {
            this.onData?.(data);
          },
          exit: (_terminal, exitCode) => {
            this.onExit?.(exitCode);
          },
        },
      });
    }

    write(data: string | Uint8Array) {
      this.proc.terminal!.write(data);
    }
    resize(cols: number, rows: number) {
      this.proc.terminal!.resize(cols, rows);
    }
    kill() {
      this.proc.kill();
    }
    get pid() {
      return this.proc.pid;
    }
    get exited() {
      return this.proc.exited;
    }
  }
  ```

  Note: `proc.stdin`/`stdout`/`stderr` return `null` when `terminal` is set — use `proc.terminal.write()` for input and the `data` callback for output. `PtyManager` class maintains `Map<string, TerminalProcess>`. Events: `onOutput(terminalId, data)`, `onExit(terminalId, exitCode)`. Export `PtyManager`.

- **Verify:** `bun test apps/server/src/pty/manager.test.ts` passes. Tests spawn short-lived processes.
- **Profile:** task-worker
- **Dependencies:** 1.1, 2.4

### 4.2 Implement terminal WebSocket handlers

- **Files:** `apps/server/src/ws/handlers/terminal.ts`, `apps/server/src/ws/handlers/terminal.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `terminal.create` spawns PTY and responds with terminalId, (2) `terminal.input` writes base64-decoded data to PTY, (3) `terminal.resize` resizes PTY, (4) `terminal.close` kills PTY, (5) PTY output events are sent to owning connection, (6) terminal from another session cannot be accessed, (7) terminal IDs tracked in session DB. Then implement: `registerTerminalHandlers(router, ptyManager, sessionDb, connections)` for `terminal.create`, `terminal.input`, `terminal.resize`, `terminal.close`. Each creates/updates/removes terminal_instance in session DB. PTY output events sent as `TerminalOutputEvent` to owning connection. Export `registerTerminalHandlers`.
- **Verify:** `bun test apps/server/src/ws/handlers/terminal.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 3.5, 3.6, 4.1

### 4.3 Implement file tree scanner

- **Files:** `apps/server/src/files/scanner.ts`, `apps/server/src/files/scanner.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `scanDirectory(dirPath)` returns `FileNode[]` sorted (dirs first, then files, alpha), (2) nested directories have children, (3) hidden files included, (4) `node_modules` and `.git` excluded, (5) nonexistent path returns empty. Then implement: `scanDirectory(rootPath, maxDepth=10): FileNode[]` using `readdir`. Exclude: `node_modules`, `.git`, `.DS_Store`. Sort: directories first, then files, alphabetical. Also `getLanguage(path: string): string` mapping extensions to language identifiers (ts→typescript, js→javascript, css→css, html→html, json→json, md→markdown, py→python, rs→rust, go→go, etc).
- **Verify:** `bun test apps/server/src/files/scanner.test.ts` passes. Tests create temp directories.
- **Profile:** task-worker
- **Dependencies:** 1.1, 2.2

### 4.4 Implement file operations (CRUD)

- **Files:** `apps/server/src/files/operations.ts`, `apps/server/src/files/operations.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `readFile(path)` returns content, (2) `writeFile(path, content)` creates/overwrites, (3) `deleteFile(path)` removes file, (4) `deleteDirectory(path)` removes recursively, (5) `renameFile(oldPath, newPath)` moves, (6) `createFile(path)` creates empty file, (7) `createDirectory(path)` creates with parents, (8) path traversal is rejected, (9) nonexistent file read returns error. Then implement each function with `validatePath(workspaceCwd, requestedPath)` that resolves and verifies no traversal. Use `Bun.file()` for reads, `Bun.write()` for writes, `fs.unlink/rm/rename/mkdir` for others. Export all.
- **Verify:** `bun test apps/server/src/files/operations.test.ts` passes. Tests use temp directories.
- **Profile:** task-worker
- **Dependencies:** 1.1, 2.2

### 4.5 Implement file watcher with fs.watch

- **Files:** `apps/server/src/files/watcher.ts`, `apps/server/src/files/watcher.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `startWatching(workspaceId, dirPath, onChange)` returns watcher, (2) file creation triggers `kind: 'create'`, (3) deletion triggers `kind: 'delete'`, (4) modification triggers `kind: 'modify'`, (5) `stopWatching(workspaceId)` stops watcher, (6) multiple workspaces watched independently. Then implement: `FileWatcher` class managing `Map<string, FSWatcher>`. Uses `fs.watch(dirPath, { recursive: true }, callback)`. Debounce 100ms. Filter `.git` and `node_modules`. `stopWatching` and `stopAll` methods. Export `FileWatcher`.
- **Verify:** `bun test apps/server/src/files/watcher.test.ts` passes. Tests create temp files and verify events.
- **Profile:** task-worker
- **Dependencies:** 1.1, 2.2

### 4.6 Implement git status reader

- **Files:** `apps/server/src/git/status.ts`, `apps/server/src/git/status.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `getGitStatus(cwd)` for git repo returns `{ branch, changes, staged }`, (2) non-git dir returns `{ branch: null, changes: [], staged: [] }`, (3) modified files in changes, (4) staged files in staged array, (5) untracked files in changes. Then implement: `getGitStatus(cwd): Promise<GitStatusResponse>` runs `git status --porcelain=v2 --branch`, parses output. Parse `# branch.head` for branch, `1`/`2`/`u` lines for changes. Map XY codes to status. 5s timeout. Export `getGitStatus`.
- **Verify:** `bun test apps/server/src/git/status.test.ts` passes. Tests create temp git repo.
- **Profile:** task-worker
- **Dependencies:** 1.1, 2.2

### 4.7 Implement file and git WebSocket handlers

- **Files:** `apps/server/src/ws/handlers/files.ts`, `apps/server/src/ws/handlers/git.ts`, `apps/server/src/ws/handlers/files.test.ts`, `apps/server/src/ws/handlers/git.test.ts`
- **Prompt:** Write tests FIRST. For files: verify `file.tree`, `file.read`, `file.write`, `file.delete`, `file.rename`, `file.create` all work through WS. For git: verify `git.status` returns parsed status. Then implement: `registerFileHandlers(router, fileOps, scanner, watcher, connections)` for all `file.*` types. Each validates workspaceId, looks up cwd, executes operation. File watcher changes broadcast as `file.change` events to subscribed connections. `registerGitHandlers(router, gitStatus)` registers `git.status`. Export both.
- **Verify:** Both test files pass.
- **Profile:** task-worker
- **Dependencies:** 3.5, 3.6, 4.3, 4.4, 4.5, 4.6

### 4.8 Implement workspace WebSocket handlers

- **Files:** `apps/server/src/ws/handlers/workspaces.ts`, `apps/server/src/ws/handlers/workspaces.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `workspace.list` returns workspaces from DB, (2) `workspace.create` inserts and returns workspace, (3) `workspace.update` modifies provided fields only, (4) `workspace.delete` removes and cleans up session data. Then implement: `registerWorkspaceHandlers(router, persistentDb, sessionDb)` for all `workspace.*` types. Export.
- **Verify:** `bun test apps/server/src/ws/handlers/workspaces.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 3.3, 3.4, 3.5, 3.6

### 4.9 Wire all handlers into server

- **Files:** `apps/server/src/server.ts`
- **Prompt:** Update `startServer` to instantiate `PtyManager`, `FileWatcher`, pass with DBs to all `register*Handlers` calls. Register: auth, terminal, file, git, workspace. On shutdown: `ptyManager.killAll()`, `watcher.stopAll()`, close DBs. Add `broadcastToWorkspace(workspaceId, event)` helper. File watcher onChange broadcasts to workspace connections.
- **Verify:** Full integration: start server, connect WS client, auth, create workspace, create terminal, send input, receive output.
- **Profile:** task-worker
- **Dependencies:** 4.2, 4.7, 4.8

---

## Phase 5: Client Foundation — TanStack Start App, Layout & Auth

_Frontend scaffolding: TanStack Start setup, core layout panels, login page, workspace sidebar._

### 5.1 Initialize TanStack Start client app

- **Files:** `apps/client/vite.config.ts`, `apps/client/package.json` (dependencies), `apps/client/src/router.tsx`, `apps/client/src/routes/__root.tsx`, `apps/client/index.html`
- **Prompt:** Install dependencies: `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`, `vite`, `@vitejs/plugin-react`. Create `vite.config.ts`:

  ```ts
  import { tanstackStart } from '@tanstack/react-start/plugin/vite';
  import { defineConfig } from 'vite';
  import viteReact from '@vitejs/plugin-react';

  export default defineConfig({
    server: { port: 5173 },
    plugins: [tanstackStart({ srcDirectory: 'src' }), viteReact()],
  });
  ```

  Create `src/router.tsx` with `getRouter()` that calls `createRouter({ routeTree })` importing the auto-generated `routeTree` from `./routeTree.gen`. Register router type. Create `src/routes/__root.tsx` using `createRootRoute` from `@tanstack/react-router` — export as `Route` with component that renders `<Outlet />` and `<HeadContent />` in an HTML shell. Create `index.html` with `<div id="root"></div>`. Add scripts: `"dev": "bun --bun vite dev"`, `"build": "bun --bun vite build"`. Note: TanStack Start's `tanstackStart()` plugin auto-generates `routeTree.gen.ts` from route files and handles client/server entry — do NOT create a separate `client.tsx`. App boots and shows blank page with "Ymir" title.

- **Verify:** `bun run --filter '@ymir/client' dev` starts and shows blank page in browser.
- **Profile:** task-worker
- **Dependencies:** 1.1, Phase 2

### 5.2 Implement WebSocket client with reconnection

- **Files:** `apps/client/src/lib/ws-client.ts`, `apps/client/src/lib/ws-client.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `wsClient.connect(url)` establishes connection, (2) `wsClient.send(envelope)` serializes and sends, (3) `wsClient.on('message', handler)` fires for incoming, (4) `wsClient.on('status', handler)` fires for status changes, (5) reconnection follows exponential backoff (1s, 2s, 4s, 8s, 16s), (6) max 5 attempts, (7) `disconnect()` stops reconnection. Then implement: `WsClient` class with `connect()`, `send()`, `on()`, `disconnect()`, `getStatus()`. Reconnect with backoff. Default URL from `import.meta.env.VITE_WS_URL` or `ws://localhost:3000` (must match server DEFAULT_PORT). Singleton export: `export const wsClient = new WsClient()`.
- **Verify:** `bun test apps/client/src/lib/ws-client.test.ts` passes. Use mock WebSocket.
- **Profile:** task-worker
- **Dependencies:** 1.1, Phase 2

### 5.3 Implement auth state management and login page

- **Files:** `apps/client/src/lib/auth.ts`, `apps/client/src/lib/auth.test.ts`, `apps/client/src/routes/login.tsx`, `apps/client/src/components/LoginForm.tsx`, `apps/client/src/components/LoginForm.test.tsx`
- **Prompt:** Write tests FIRST. For `auth.ts`: verify (1) `login(password)` sends auth request, stores token in localStorage, (2) `logout()` clears token, (3) `getToken()` returns token or null, (4) `isAuthenticated()` returns boolean. For `LoginForm.test.tsx`: verify (1) renders password input and submit, (2) shows error on wrong password, (3) calls onLogin on success. Then implement: `auth.ts` manages token in localStorage key `'ymir:token'`. `login()` creates request, sends via wsClient, waits for response with matching `id`, stores token. `LoginForm.tsx`: controlled password input, submit handler, error state, dark styling. `login.tsx` route uses `createFileRoute('/login')({ component: LoginPage })` from TanStack Start convention — export as `Route`. Add auth check to `__root.tsx`: redirect to `/login` if no token. Wrap app in `QueryClientProvider` in `__root.tsx`.
- **Verify:** `bun test` for both test files passes.
- **Profile:** task-worker
- **Dependencies:** 5.1, 5.2

### 5.4 Implement connection status hook

- **Files:** `apps/client/src/hooks/useConnectionStatus.ts`, `apps/client/src/hooks/useConnectionStatus.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) hook returns `'connected'` when wsClient emits connected, (2) `'reconnecting'` during reconnect, (3) `'disconnected'` after max attempts. Then implement: `useConnectionStatus()` subscribes to `wsClient.on('status')`, returns current status. Uses `useState` and `useEffect` with cleanup.
- **Verify:** `bun test apps/client/src/hooks/useConnectionStatus.test.tsx` passes.
- **Profile:** task-worker
- **Dependencies:** 5.2

### 5.5 Implement root layout with resizable panels

- **Files:** `apps/client/src/components/AppLayout.tsx`, `apps/client/src/components/AppLayout.test.tsx`, `apps/client/src/styles/layout.css`, `apps/client/src/routes/__root.tsx` (update)
- **Prompt:** Write tests FIRST. Tests verify AppLayout renders left sidebar, main content, right sidebar, status bar areas. Then implement using `react-resizable-panels`: horizontal PanelGroup [LeftSidebar(250px min/max), MainArea(flex), RightSidebar(250px min/max)]. MainArea is vertical PanelGroup [Content(flex), BottomPanel(0-300px, default 200px, collapsible), StatusBar(fixed 24px)]. `layout.css`: dark theme variables (`--bg-primary: #1e1e1e`, `--bg-secondary: #252526`, `--bg-tertiary: #2d2d2d`, `--text-primary: #cccccc`, `--text-secondary: #858585`, `--border: #3c3c3c`, `--accent: #007acc`), full viewport (100vh/100vw, overflow hidden), 2px resize handles that highlight on hover. Update `__root.tsx` to render AppLayout wrapping `<Outlet />`.
- **Verify:** `bun test apps/client/src/components/AppLayout.test.tsx` passes. Visual: 3-column layout in browser.
- **Profile:** task-worker
- **Dependencies:** 5.1, 5.3

### 5.6 Implement workspace sidebar

- **Files:** `apps/client/src/components/WorkspaceSidebar.tsx`, `apps/client/src/components/WorkspaceSidebar.test.tsx`, `apps/client/src/components/WorkspaceItem.tsx`, `apps/client/src/components/AddWorkspaceModal.tsx`, `apps/client/src/components/AddWorkspaceModal.test.tsx`
- **Prompt:** Write tests FIRST. WorkspaceSidebar: renders workspace list with name, color dot, cwd; "+" button. AddWorkspaceModal: renders form with name/cwd/color, all required, submit sends `workspace.create`. WorkspaceItem: renders name and color dot, right-click shows context menu (rename, set cwd, remove, change color). Then implement using `@radix-ui/react-context-menu` for context menus. AddWorkspaceModal is overlay modal with form. Dark theme styling. WorkspaceSidebar is scrollable list.
- **Verify:** All three component test files pass.
- **Profile:** task-worker
- **Dependencies:** 5.3, 5.5

### 5.7 Implement status bar

- **Files:** `apps/client/src/components/StatusBar.tsx`, `apps/client/src/components/StatusBar.test.tsx`
- **Prompt:** Write tests FIRST. Tests verify: (1) renders connection status dot (green/yellow/red), (2) renders active workspace name, (3) renders status text. Then implement: fixed-height (24px) bar. Left: colored dot (8px) + status text. Center: workspace name. Right: reserved. Uses `useConnectionStatus()`. Styled `--bg-tertiary`, `--text-secondary`, 11px font.
- **Verify:** `bun test apps/client/src/components/StatusBar.test.tsx` passes.
- **Profile:** task-worker
- **Dependencies:** 5.4, 5.5

### 5.8 Implement TanStack Query hooks for workspace data

- **Files:** `apps/client/src/hooks/useWorkspaces.ts`, `apps/client/src/hooks/useWorkspaces.test.ts`, `apps/client/src/lib/query-client.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) `useWorkspaces()` returns workspace list via WS, (2) `useCreateWorkspace()` sends create and invalidates, (3) `useDeleteWorkspace()`, (4) `useUpdateWorkspace()`. Then implement: `query-client.ts` creates `QueryClient` (staleTime 30s, retry 1). Wrap app in `QueryClientProvider` in `__root.tsx`. `useWorkspaces()`: `useQuery` key `['workspaces']`. Mutations: `useMutation` that sends WS request and invalidates `['workspaces']` on success.
- **Verify:** `bun test apps/client/src/hooks/useWorkspaces.test.tsx` passes.
- **Profile:** task-worker
- **Dependencies:** 5.1, 5.2, 5.3

---

## Phase 6: Terminal Client — ghostty-web Integration & Terminal UI

_Terminal rendering, data flow, and tab management on the client side._

### 6.1 Implement ghostty-web terminal component

- **Files:** `apps/client/src/components/TerminalView.tsx`, `apps/client/src/components/TerminalView.test.tsx`
- **Prompt:** Write tests FIRST. Tests verify: (1) renders container div, (2) on mount calls `init()` from ghostty-web, (3) creates Terminal instance, (4) subscribes to `term.onData`, (5) cleanup on unmount. Then implement: `TerminalView` with `useRef` for container and terminal. Props: `terminalId`, `onData`. On mount:

  ```ts
  import { init, Terminal } from 'ghostty-web';

  // Module-level promise for one-time WASM init
  let initPromise: Promise<void> | null = null;
  function ensureInit() {
    if (!initPromise) initPromise = init();
    return initPromise;
  }

  // Inside useEffect:
  await ensureInit();
  const term = new Terminal({
    cols: 80,
    rows: 24,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#ffffff' },
  });
  term.open(containerRef.current!);
  term.onData((data: string) => {
    onData?.(data);
  });
  ```

  Expose via `useImperativeHandle`: `write(data)` calls `term.write(data)`, `resize(cols, rows)` calls `term.resize(cols, rows)`. Unmount: `term.dispose()`. Note: ghostty-web's `Terminal` API is xterm.js-compatible. `term.onData()` subscribes to user input events and returns a disposable. `term.write()` sends data to the terminal renderer. `term.open(parent)` attaches to a DOM element.

- **Verify:** `bun test apps/client/src/components/TerminalView.test.tsx` passes (ghostty-web mocked).
- **Profile:** task-worker
- **Dependencies:** 5.1

### 6.2 Implement terminal data flow hook

- **Files:** `apps/client/src/hooks/useTerminal.ts`, `apps/client/src/hooks/useTerminal.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) sends `terminal.create` on mount, (2) input base64-encoded and sent, (3) output events decoded, (4) resize sends request, (5) close sends request, (6) cleanup on unmount. Then implement: `useTerminal({ terminalId, workspaceId })` creates terminal via WS, subscribes to output events matching terminalId, decodes base64. Returns `{ terminalId, sendInput, resize, close, outputData }`.
- **Verify:** `bun test apps/client/src/hooks/useTerminal.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 5.2, 5.3

### 6.3 Implement tab management system

- **Files:** `apps/client/src/components/TabBar.tsx`, `apps/client/src/components/TabBar.test.tsx`, `apps/client/src/components/TabButton.tsx`, `apps/client/src/hooks/useTabs.ts`, `apps/client/src/hooks/useTabs.test.ts`
- **Prompt:** Write tests FIRST. useTabs: (1) returns tabs for workspace, (2) addTab creates via WS, (3) closeTab closes, (4) activateTab activates, (5) editor tabs for same file focus existing. TabBar: (1) renders tab buttons horizontally, (2) "+" button, (3) clicking activates, (4) close button works, (5) active tab distinct. Then implement: `useTabs(workspaceId)` manages local tab state synced via WS. `addTab(type, filePath?)` — editor type checks for existing. TabBar: horizontal buttons + "+" with dropdown. TabButton: icon, title, close button on hover, active border. Dark theme.
- **Verify:** All tab test files pass.
- **Profile:** task-worker
- **Dependencies:** 5.2, 5.3, 5.5

### 6.4 Implement bottom terminal panel

- **Files:** `apps/client/src/components/BottomPanel.tsx`, `apps/client/src/components/BottomPanel.test.tsx`, `apps/client/src/hooks/useBottomPanel.ts`, `apps/client/src/hooks/useBottomPanel.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) renders with own tab bar, (2) collapsible via toggle, (3) collapsed = 0px, (4) has own terminal tabs. Then implement: BottomPanel contains toggle button, own TabBar (terminal only), TerminalView for active tab. Collapsible via react-resizable-panels. `useBottomPanel` manages tabs per workspace with `isCollapsed` state.
- **Verify:** Both test files pass.
- **Profile:** task-worker
- **Dependencies:** 6.1, 6.2, 6.3

### 6.5 Implement terminal resize handling

- **Files:** `apps/client/src/hooks/useTerminalResize.ts`, `apps/client/src/hooks/useTerminalResize.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) observes container size, (2) calculates cols/rows from pixels, (3) calls onResize only when changed, (4) debounces 150ms. Then implement: `useTerminalResize(containerRef, onResize, { charWidth=8, charHeight=16 })` uses `ResizeObserver`. Debounce. `cols = floor(width/charWidth)`, `rows = floor(height/charHeight)`.
- **Verify:** `bun test apps/client/src/hooks/useTerminalResize.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 1.1

### 6.6 Wire terminal components together in main content area

- **Files:** `apps/client/src/components/ContentPane.tsx`, `apps/client/src/components/ContentPane.test.tsx`
- **Prompt:** Write tests FIRST. Tests verify: (1) renders active tab content, (2) terminal tabs show TerminalView, (3) editor tabs show placeholder, (4) no tabs shows empty state. Then implement: ContentPane receives activeTab from useTabs. No tabs: centered message. Terminal tab: TerminalView with useTerminalResize + useTerminal. Editor tab: placeholder. Data flows: useTerminal manages WS, TerminalView renders, onData → sendInput, outputData → write to view.
- **Verify:** `bun test apps/client/src/components/ContentPane.test.tsx` passes.
- **Profile:** task-worker
- **Dependencies:** 6.1, 6.2, 6.3, 6.5

---

## Phase 7: File Tree & Code Editor

_File tree with icons, context menus, and CodeMirror 6 editor._

### 7.1 Implement file tree component

- **Files:** `apps/client/src/components/FileTree.tsx`, `apps/client/src/components/FileTree.test.tsx`, `apps/client/src/hooks/useFileTree.ts`, `apps/client/src/hooks/useFileTree.test.ts`
- **Prompt:** Write tests FIRST. useFileTree: (1) fetches tree via WS, (2) listens for change events and refreshes, (3) `refresh()` reloads. FileTree: (1) renders tree with expandable dirs, (2) click file emits onFileSelect, (3) shows icons, (4) follows active workspace. Then implement: `useFileTree(workspaceId)` uses `useQuery` key `['fileTree', workspaceId]`, subscribes to `file.change` events for invalidation. `FileTree` uses `react-arborist` Tree with custom Node renderer, `@iconify/react` + `@iconify-json/vscode-icons` for icons. Click on file calls `onFileSelect`.
- **Verify:** Both test files pass.
- **Profile:** task-worker
- **Dependencies:** 5.2, 5.5, 5.8

### 7.2 Implement file tree context menu

- **Files:** `apps/client/src/components/FileTreeContextMenu.tsx`, `apps/client/src/components/FileTreeContextMenu.test.tsx`
- **Prompt:** Write tests FIRST. Tests verify: (1) right-click file: Open in Editor, Rename, Delete, (2) right-click directory: New File, New Folder, Rename, Delete, (3) "Open in Editor" calls onOpenFile, (4) "Delete" shows confirmation, (5) "Rename" shows inline input, (6) "New File" shows inline input. Then implement using `@radix-ui/react-context-menu`. Items trigger WS requests (`file.create`, `file.delete`, `file.rename`). Confirmation dialog for delete. Toast via `sonner`.
- **Verify:** `bun test apps/client/src/components/FileTreeContextMenu.test.tsx` passes.
- **Profile:** task-worker
- **Dependencies:** 7.1

### 7.3 Implement file icon resolver

- **Files:** `apps/client/src/lib/file-icons.ts`, `apps/client/src/lib/file-icons.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) getFileIcon('test.ts') returns correct icon, (2) folder returns folder icon, (3) common extensions mapped: ts, tsx, js, jsx, json, css, html, md, py, rs, go, toml, yaml, sh, Dockerfile, .gitignore, (4) unknown returns default. Then implement: `getFileIcon(filename, isDirectory): string` mapping extensions/filenames to `@iconify-json/vscode-icons` names.
- **Verify:** `bun test apps/client/src/lib/file-icons.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 1.1

### 7.4 Implement CodeMirror editor component

- **Files:** `apps/client/src/components/CodeEditor.tsx`, `apps/client/src/components/CodeEditor.test.tsx`, `apps/client/src/hooks/useCodeEditor.ts`, `apps/client/src/hooks/useCodeEditor.test.ts`
- **Prompt:** Write tests FIRST. useCodeEditor: (1) fetches content via `file.read`, (2) returns content/language/isLoading/save, (3) `save` sends `file.write`, (4) tracks dirty state. CodeEditor: (1) renders CodeMirror, (2) changes update state, (3) Ctrl+S triggers save. Then implement: `useCodeEditor(workspaceId, filePath)` uses `useQuery` key `['file', workspaceId, filePath]`. Local dirty state. `save()` sends write. `CodeEditor` uses `@uiw/react-codemirror` with basicSetup, language extensions (`@codemirror/lang-*`), Ctrl+S/Cmd+S keymap, one-dark theme, 14px monospace font.
- **Verify:** Both test files pass.
- **Profile:** task-worker
- **Dependencies:** 5.2, 5.5

### 7.5 Implement editor tab integration

- **Files:** `apps/client/src/components/ContentPane.tsx` (update), `apps/client/src/lib/editor-tabs.ts`, `apps/client/src/lib/editor-tabs.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) editor tab key is consistent, (2) same file reuses tab, (3) tab title shows filename. Then implement: Update ContentPane for editor tab type → render CodeEditor. `editor-tabs.ts` helpers: `getEditorTabTitle(filePath)` extracts filename, `getEditorTabKey(filePath)` normalizes for dedup. Update TabButton to show file icon. Unsaved changes confirmation on close.
- **Verify:** `bun test apps/client/src/lib/editor-tabs.test.ts` passes. Visual: opening files creates editor tabs.
- **Profile:** task-worker
- **Dependencies:** 6.6, 7.4

### 7.6 Implement git status panel

- **Files:** `apps/client/src/components/GitStatusPanel.tsx`, `apps/client/src/components/GitStatusPanel.test.tsx`, `apps/client/src/hooks/useGitStatus.ts`, `apps/client/src/hooks/useGitStatus.test.ts`
- **Prompt:** Write tests FIRST. useGitStatus: (1) fetches via WS, (2) returns branch/changes/staged, (3) polls every 30s. GitStatusPanel: (1) renders branch name, (2) renders changed files with status indicators (M/A/D/U), (3) renders staged files, (4) clicking file opens editor. Then implement: `useGitStatus(workspaceId)` with `useQuery` key `['gitStatus', workspaceId]`, `refetchInterval: 30_000`. GitStatusPanel: header "Git: {branch}", sections for Changes/Staged, colored badges, clickable entries.
- **Verify:** Both test files pass.
- **Profile:** task-worker
- **Dependencies:** 5.2, 5.5, 5.8

### 7.7 Wire right sidebar with file tree and git status

- **Files:** `apps/client/src/components/RightSidebar.tsx`, `apps/client/src/components/RightSidebar.test.tsx`
- **Prompt:** Write tests FIRST. Tests verify: (1) renders FileTree and GitStatusPanel, (2) clicking file opens editor tab, (3) follows active workspace. Then implement: RightSidebar with header "Explorer", FileTree, divider, GitStatusPanel. Uses useFileTree and useGitStatus. onFileSelect calls addTab('editor', filePath). Context menu wraps FileTree. Update AppLayout to pass workspaceId.
- **Verify:** `bun test apps/client/src/components/RightSidebar.test.tsx` passes.
- **Profile:** task-worker
- **Dependencies:** 7.1, 7.2, 7.6

---

## Phase 8: Split Panes & Theme System

_Split pane layout, workspace accent colors, and toast notifications._

### 8.1 Implement split pane rendering

- **Files:** `apps/client/src/components/SplitPaneLayout.tsx`, `apps/client/src/components/SplitPaneLayout.test.tsx`, `apps/client/src/hooks/useSplitLayout.ts`, `apps/client/src/hooks/useSplitLayout.test.ts`
- **Prompt:** Write tests FIRST. useSplitLayout: (1) returns LayoutNode, (2) splitPane creates new split, (3) closePane removes pane, (4) updateSizes changes ratios. SplitPaneLayout: (1) renders single pane for PaneNode, (2) renders PanelGroup for SplitNode, (3) resize handles visible. Then implement: `useSplitLayout(tabId)` manages LayoutNode tree. Initial = single PaneNode. `splitPane(paneId, direction)` replaces pane with SplitNode (50/50). `closePane` removes pane, simplifies tree. `updateSizes` updates sizes. Persist to server. `SplitPaneLayout` renders recursively: PaneNode → content, SplitNode → PanelGroup with children. onResize updates sizes.
- **Verify:** Both test files pass.
- **Profile:** task-worker
- **Dependencies:** 5.5, 6.6

### 8.2 Implement workspace accent color theming

- **Files:** `apps/client/src/hooks/useTheme.ts`, `apps/client/src/hooks/useTheme.test.ts`, `apps/client/src/styles/theme.css`
- **Prompt:** Write tests FIRST. Tests verify: (1) sets CSS `--accent` to workspace color, (2) cascades to children, (3) switching workspaces changes accent. Then implement: `useTheme(workspace)` sets `document.documentElement.style.setProperty('--accent', color)` in useEffect. Compute `--accent-hover` (lighter) and `--accent-dim` (transparent). Update theme.css to use `var(--accent)` for: active tab border, workspace item, buttons, scrollbars, resize handles, connection dot, context menu highlight.
- **Verify:** `bun test apps/client/src/hooks/useTheme.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** 5.5

### 8.3 Implement toast notification system

- **Files:** `apps/client/src/components/ToastProvider.tsx`, `apps/client/src/lib/toast.ts`
- **Prompt:** Wrapper around `sonner`'s `Toaster`. ToastProvider renders `<Toaster theme="dark" position="bottom-right" richColors />`. `toast.ts` re-exports `toast` from `sonner` with wrappers: `showSuccess`, `showError`, `showInfo`. Add ToastProvider to `__root.tsx`. Use throughout for file ops, workspace CRUD, auth errors.
- **Verify:** Manual: trigger file operation, see toast in bottom-right.
- **Profile:** task-worker-lite
- **Dependencies:** 5.1

### 8.4 Implement pane context menu and split controls

- **Files:** `apps/client/src/components/SplitPaneContextMenu.tsx`, `apps/client/src/components/SplitPaneContextMenu.test.tsx`
- **Prompt:** Write tests FIRST. Tests verify: (1) right-click shows Split Right, Split Down, Close Pane, (2) Split Right calls splitPane(horizontal), (3) Split Down calls splitPane(vertical), (4) Close Pane disabled if only one pane, (5) Close Pane calls closePane. Then implement using `@radix-ui/react-context-menu`. Menu items with icons. Props: paneId, onSplit, onClose, canClose.
- **Verify:** `bun test apps/client/src/components/SplitPaneContextMenu.test.tsx` passes.
- **Profile:** task-worker
- **Dependencies:** 8.1

### 8.5 Wire everything into complete workspace view

- **Files:** `apps/client/src/routes/index.tsx`, `apps/client/src/components/WorkspaceView.tsx`, `apps/client/src/components/WorkspaceView.test.tsx`
- **Prompt:** Write tests FIRST. Tests verify WorkspaceView renders all sections. Then implement: WorkspaceView orchestrates full view. Uses useWorkspaces, useTabs, useTheme. Renders WorkspaceSidebar, RightSidebar, TabBar + SplitPaneLayout (or ContentPane for single pane), BottomPanel, StatusBar. TabBar addTab creates tabs. FileTree onFileSelect creates editor tabs. All data flows through hooks. Route uses `createFileRoute('/')({ component: WorkspaceView })` — export as `Route`. Renders WorkspaceView for authenticated users.
- **Verify:** `bun test apps/client/src/components/WorkspaceView.test.tsx` passes.
- **Profile:** task-worker
- **Dependencies:** 5.6, 5.7, 6.4, 7.5, 7.7, 8.1, 8.2, 8.3

---

## Phase 9: Polish, Integration & Documentation

_Final integration testing, error handling, CLI polish, and documentation._

### 9.1 Implement comprehensive error handling

- **Files:** `apps/client/src/lib/error-handler.ts`, `apps/client/src/lib/error-handler.test.ts`, `apps/server/src/ws/error-handler.ts`, `apps/server/src/ws/error-handler.test.ts`
- **Prompt:** Write tests FIRST. Tests verify: (1) client handler catches WS errors and shows toast, (2) server handler catches handler errors and sends error response, (3) uncaught errors don't crash server, (4) error responses follow ErrorResponse format. Then implement: Client: `handleWsError(error)` — structured errors show specific toast, unknown show generic. Intercept all WS response errors. Server: wrap all handlers in try/catch. Known `AppError` (with code) → structured response. Unknown → log + INTERNAL_ERROR. `AppError` class extends Error with `code: ErrorCode`. Global uncaughtException/unhandledRejection handlers.
- **Verify:** Both test files pass.
- **Profile:** task-worker
- **Dependencies:** Phase 3, Phase 4, Phase 5

### 9.2 Implement dev mode concurrent runner

- **Files:** `package.json` (root scripts), `scripts/dev.ts`
- **Prompt:** Root scripts: `"dev": "bun scripts/dev.ts"`. Create `scripts/dev.ts` that concurrently runs client and server via `Bun.spawn`. Prefix stdout with `[client]`/`[server]`. Handle SIGINT. Server runs on `DEFAULT_PORT` (3000). Client wsClient connects to WS URL from `VITE_WS_URL` env var — **default must be `ws://localhost:3000`** matching the server's default port. Pass `VITE_WS_URL=ws://localhost:3000` as env var when spawning the client Vite process.
- **Verify:** `bun run dev` starts both servers. Client connects to WebSocket on port 3000.
- **Profile:** task-worker-lite
- **Dependencies:** Phase 3, Phase 5

### 9.3 Implement multi-client isolation verification

- **Files:** `apps/server/__tests__/multi-client.test.ts`
- **Prompt:** Integration test: (1) start server, (2) connect two WS clients, (3) both authenticate (different session IDs), (4) each creates different workspaces/tabs/terminals, (5) verify client A cannot access client B's resources, (6) verify terminal output doesn't leak, (7) disconnect A, B unaffected, (8) reconnect A, terminals still running.
- **Verify:** `bun test apps/server/__tests__/multi-client.test.ts` passes.
- **Profile:** task-worker
- **Dependencies:** Phase 4, Phase 5

### 9.4 Implement production server build and CLI

- **Files:** `apps/server/src/index.ts` (update), `apps/server/src/server.ts` (update), `package.json` (root scripts), `apps/server/package.json` (update)
- **Prompt:** Root scripts: `"build": "bun run --filter '@ymir/client' build && bun run --filter '@ymir/server' build"`, `"start": "bun run apps/server/src/index.ts --password=$YMIR_PASSWORD"`. Production server uses `Bun.serve` with BOTH `fetch` (for HTTP static files) AND `websocket` (for WS) on the same port:
  ```ts
  Bun.serve({
    port,
    hostname: host,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname.startsWith('/ws')) {
        // Upgrade to WebSocket
        if (server.upgrade(req)) return;
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
      // Serve static files from built client
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = Bun.file(`./apps/client/.output/public${path}`);
      return new Response(file);
    },
    websocket: {
      /* existing WS handlers */
    },
  });
  ```
  Server build bundles with `bun build`.
- **Verify:** `bun run build && bun run start -- --password=test` serves both static files and WebSocket on port 3000.
- **Profile:** task-worker
- **Dependencies:** 9.2

### 9.5 Write final documentation and update PROGRESS.md

- **Files:** `docs/plans/PROGRESS.md`, `README.md`, `docs/plans/PLAN.md` (finalize)
- **Prompt:** Update PROGRESS.md with actual completion. Create README.md with: description, architecture, setup (`bun install`, `bun run dev`), CLI usage (`ymir --password=xxx [--port=3000] [--host=127.0.0.1]`), tech stack, project structure, development guide (TDD, tests, linting), screenshot placeholder. Update PLAN.md to mark completed items.
- **Verify:** README renders correctly. All commands work.
- **Profile:** task-worker-lite
- **Dependencies:** All previous tasks

---

## Summary

| Phase     | Focus                   | Tasks  | Key Deliverables                                                         |
| --------- | ----------------------- | ------ | ------------------------------------------------------------------------ |
| **1**     | Scaffolding & Tooling   | 7      | Monorepo, TS, ESLint, Prettier, bun:test, docs                           |
| **2**     | Shared Types & Protocol | 5      | Message envelopes, payload types, pane tree, constants                   |
| **3**     | Server Foundation       | 8      | Auth (Argon2id + JWT), DBs, WebSocket server, message router             |
| **4**     | Server Features         | 9      | PTY manager, file ops, git status, file watcher, all WS handlers         |
| **5**     | Client Foundation       | 8      | TanStack Start app, WS client, login, layout panels, sidebar, status bar |
| **6**     | Terminal Client         | 6      | ghostty-web, terminal data flow, tabs, bottom panel, resize              |
| **7**     | File Tree & Editor      | 7      | react-arborist tree, context menu, CodeMirror, git status panel          |
| **8**     | Split Panes & Theme     | 5      | Split pane tree, accent colors, toasts, workspace view assembly          |
| **9**     | Polish & Integration    | 5      | Error handling, dev mode, multi-client test, production build, docs      |
| **Total** |                         | **60** |                                                                          |
