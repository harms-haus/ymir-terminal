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

- The `TopBar` and `WindowTitleBar` components have `data-tauri-drag-region` making them draggable
- `WindowTitleBar` is used on pre-auth screens (login and loading), while `TopBar` is used in the authenticated workspace
- Interactive children (buttons, inputs) have `pointerEvents: 'auto'` to remain clickable
- Window controls (minimize, maximize, close) appear right of the panel toggles in `TopBar`, and on the right in `WindowTitleBar`
- Double-click on either drag region toggles maximize via the shared `useTauriMaximize` hook

## Auto-Authentication

In Tauri mode, the `useTauri` hook detects the environment and the `useAuth` hook automatically:

1. Calls `get_tauri_config` Tauri command to get the auto-generated password
2. Stores the sidecar port on `window.__YMIR_SIDECAR_PORT`
3. Calls `login(password)` to authenticate with the sidecar server
4. The JWT token is stored in localStorage for subsequent requests

The WebSocket URL used during login comes from `ConnectionUrlContext` (via `useConnectionUrl()`), **not** constructed directly inside `useAuth`. In Tauri mode, the context is populated from the sidecar port; in browser mode, it falls back to `window.location`.

Auto-login is suppressed when `suppressAutoLogin()` is called — this sets an internal ref that prevents the Tauri auto-login effect from firing. This is used when the user switches to a non-local server (e.g. a remote host), so the app doesn't immediately reconnect to the local sidecar.

#### Sidecar Port Global

The Rust backend injects `window.__YMIR_SIDECAR_PORT` into the webview after the sidecar starts. This global is used by:

- `useAuth` — stores the port for reference during auto-login
- `useConnectionManager` — to provide a "Connect to Local Server" button in the Connection Manager popover

The port value comes from parsing the sidecar's stdout for the pattern `"Ymir server listening on 127.0.0.1:{port}"`.

#### Connect to Local Server

The Connection Manager popover provides a "Connect to Local Server" button (visible only in Tauri mode) that allows users to reconnect to the local sidecar after disconnecting. It reads the sidecar port from `window.__YMIR_SIDECAR_PORT` or falls back to `getTauriConfig()` IPC call.

## Tauri Plugins

Two Tauri plugins are registered in `src-tauri/src/lib.rs`:

| Plugin                | Registration                           | Purpose                                                                                                      |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tauri_plugin_shell`  | `.plugin(tauri_plugin_shell::init())`  | Spawns and manages the sidecar process. Scoped by `shell:allow-spawn` to only permit the ymir-server binary. |
| `tauri_plugin_opener` | `.plugin(tauri_plugin_opener::init())` | Opens URLs in the system's default browser from within the webview.                                          |

The `opener:default` permission in `src-tauri/capabilities/default.json` grants access to open `http`, `https`, `mailto`, and `tel` URLs through the native OS handler.

## URL Opening Strategy

URLs are opened differently depending on whether the app runs in Tauri or browser mode:

### Tauri Mode

`openExternalUrl()` (in `url-opener.ts`) uses `@tauri-apps/plugin-opener`'s `openUrl()` to open URLs in the system browser. If the plugin call fails, it falls back to the saved original `window.open`.

Two contexts produce external URL opens:

- **Terminal links** — ghostty-web's built-in URL detection calls `window.open()` on ctrl+click. `initUrlOpener()` patches `window.open` globally at app startup to intercept these calls and route external URLs through `openExternalUrl()` instead. Non-external URLs (blob, data) pass through to the original `window.open`. The patch returns a cleanup function that restores the original `window.open`.
- **Editor links** — Monaco's `LinkProvider` (registered by `setupMonacoLinks()` in `monaco-links.ts`) scans editor content for URLs using `URL_SCHEME_REGEX`, and the `LinkOpener` calls `openExternalUrl()` to open them.

### Browser Mode

All links open via standard `window.open()` — no patching or plugin is involved.

### Shared URL Helpers

Both terminal and editor link detection share utilities from `url-opener.ts`:

- `URL_SCHEME_PREFIXES` — canonical list of schemes that should open externally (http, https, mailto, ftp, ssh, git, tel, magnet, gemini, gopher, news)
- `URL_SCHEME_REGEX` — regex derived from `URL_SCHEME_PREFIXES` for matching URLs in text
- `stripTrailingPunctuation()` — removes trailing `.,;!?)]` characters that are likely not part of the actual URL

## Tauri Files

| File                                  | Purpose                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src-tauri/src/lib.rs`                | App builder, sidecar startup, window URL configuration                                                |
| `src-tauri/src/sidecar.rs`            | `SidecarManager` — spawn, readiness detection (15s timeout), static dir resolution                    |
| `src-tauri/src/auth.rs`               | Password generation (32-byte hex via getrandom), file persistence with 0600 permissions               |
| `src-tauri/tauri.conf.json`           | Window config (frameless, 1280×800), CSP, sidecar registration, resource bundling                     |
| `src-tauri/capabilities/default.json` | Scoped shell permissions (sidecar only), opener permissions (URL schemes), window control permissions |

## Frontend Files

| File                                                | Purpose                                                                                                                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client/src/hooks/useTauri.ts`                 | Tauri detection (`isTauri`) and config retrieval (`getTauriConfig`)                                                                                                                                              |
| `apps/client/src/hooks/useAuth.ts`                  | Auto-login when `isTauri` is true; reads WebSocket URL from `ConnectionUrlContext`; supports `suppressAutoLogin()` to skip auto-login on server switch                                                           |
| `apps/client/src/components/TopBar.tsx`             | Drag region, ConnectionManagerPopover (left), command bar (center), window controls and pane toggles (right)                                                                                                     |
| `apps/client/src/components/WindowTitleBar.tsx`     | Simplified drag-region title bar for login and loading screens; ConnectionManagerPopover (left), optional children (center), WindowControls (right, Tauri only)                                                  |
| `apps/client/src/components/YmirLogo.tsx`           | Inline SVG logo component with `size` prop (default 120px) and optional `style` prop; used in the branded loading screen and the empty pane state                                                                |
| `apps/client/src/lib/tauri.ts`                      | Shared `useTauriMaximize` hook for double-click-to-maximize on drag regions; used by both `TopBar` and `WindowTitleBar`                                                                                          |
| `apps/client/src/contexts/ConnectionUrlContext.tsx` | Shared context for tracking the active WebSocket connection URL. Used by `AuthProvider` for auto-reconnect and by `WorkspaceView` for remount-on-server-switch                                                   |
| `apps/client/src/lib/theme.ts`                      | Window control theme constants                                                                                                                                                                                   |
| `apps/client/src/lib/url-opener.ts`                 | Shared URL opener utility: `openExternalUrl()` (Tauri plugin or `window.open`), `initUrlOpener()` (`window.open` patch for ghostty-web), `URL_SCHEME_PREFIXES`, `URL_SCHEME_REGEX`, `stripTrailingPunctuation()` |
| `apps/client/src/lib/monaco-links.ts`               | Monaco `LinkProvider` and `LinkOpener` registration for detecting and opening URLs in editor content; uses `openExternalUrl()` from `url-opener.ts`                                                              |
