# Desktop App Architecture

## Sidecar Pattern

The desktop app uses a **sidecar pattern**: the Bun server is compiled with `bun build --compile` into a standalone binary that is bundled alongside the Tauri app.

Startup sequence:

1. Tauri app generates or retrieves a persistent password (`{getConfigDir()}/tauri-password`)
2. Resolves the static directory via `SidecarManager::resolve_static_dir()` — checks `YMIR_STATIC_DIR` env var override first, then falls back to dev/resource dir
3. Spawns the sidecar binary (from `YMIR_SERVER_PATH` env var override, or the bundled sidecar) with `--port=0 --host=127.0.0.1 --staticDir=<path>` and password via `YMIR_PASSWORD` env var
4. Awaits the sidecar's stdout for the readiness line (`Ymir server listening on 127.0.0.1:PORT`) with a 15-second timeout
5. Sets the webview URL to `http://127.0.0.1:PORT`
6. The frontend detects Tauri via `window.__TAURI_INTERNALS__` and auto-authenticates

### Environment Variable Overrides

The sidecar manager (`src-tauri/src/sidecar.rs`) supports two env var overrides for non-bundled installations (e.g. installed via `ymir update`):

| Variable           | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `YMIR_STATIC_DIR`  | Override the client static files directory (checked before default) |
| `YMIR_SERVER_PATH` | Override the server binary path (checked before bundled sidecar)    |

Both overrides validate that the path exists before using it, printing a warning and falling back if it doesn't.

## Frameless Window

The window has `decorations: false` — no native title bar. Instead:

- The `TopBar` component has `data-tauri-drag-region` making it draggable
- Interactive children (buttons, inputs) have `pointerEvents: 'auto'` to remain clickable
- Window controls (minimize, maximize, close) appear right of the panel toggles
- Double-click on the drag region toggles maximize

## Auto-Authentication

In Tauri mode, the `useTauri` hook detects the environment and the `useAuth` hook automatically:

1. Calls `get_tauri_config` Tauri command to get the auto-generated password
2. Calls `login(password)` to authenticate with the sidecar server
3. The JWT token is stored in localStorage for subsequent requests

#### Sidecar Port Global

The Rust backend injects `window.__YMIR_SIDECAR_PORT` into the webview after the sidecar starts. This global is used by:

- `useAuth` — to construct the WebSocket URL for auto-login
- `useConnectionManager` — to provide a "Connect to Local Server" button in the Connection Manager popover

The port value comes from parsing the sidecar's stdout for the pattern `"Ymir server listening on 127.0.0.1:{port}"`.

#### Connect to Local Server

The Connection Manager popover provides a "Connect to Local Server" button (visible only in Tauri mode) that allows users to reconnect to the local sidecar after disconnecting. It reads the sidecar port from `window.__YMIR_SIDECAR_PORT` or falls back to `getTauriConfig()` IPC call.

## Tauri Files

| File                                  | Purpose                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `src-tauri/src/lib.rs`                | App builder, sidecar startup, window URL configuration                                  |
| `src-tauri/src/sidecar.rs`            | `SidecarManager` — spawn, readiness detection (15s timeout), static dir resolution      |
| `src-tauri/src/auth.rs`               | Password generation (32-byte hex via getrandom), file persistence with 0600 permissions |
| `src-tauri/tauri.conf.json`           | Window config (frameless, 1280×800), CSP, sidecar registration, resource bundling       |
| `src-tauri/capabilities/default.json` | Scoped shell permissions (sidecar only), window control permissions                     |

## Frontend Files

| File                                    | Purpose                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/client/src/hooks/useTauri.ts`     | Tauri detection (`isTauri`) and config retrieval (`getTauriConfig`)                                          |
| `apps/client/src/hooks/useAuth.ts`      | Auto-login when `isTauri` is true                                                                            |
| `apps/client/src/components/TopBar.tsx` | Drag region, ConnectionManagerPopover (left), command bar (center), window controls and pane toggles (right) |
| `apps/client/src/lib/theme.ts`          | Window control theme constants                                                                               |
