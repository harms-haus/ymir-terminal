/**
 * Shared utilities for accessing the Tauri sidecar port.
 *
 * The sidecar launcher injects `window.__YMIR_SIDECAR_PORT` (typed in
 * `types/tauri.d.ts`). These helpers centralise the null-check logic so
 * consumers never need `(window as any)` casts.
 */

/**
 * Return the sidecar port number, or `null` when unavailable / invalid.
 */
export function getSidecarPort(): number | null {
  const port = window.__YMIR_SIDECAR_PORT;
  if (typeof port === 'number' && Number.isFinite(port) && port > 0) {
    return port;
  }
  return null;
}

/**
 * Return the full WebSocket URL pointing at the local sidecar, or `null`
 * when no sidecar port is available.
 */
export function getSidecarUrl(): string | null {
  const port = getSidecarPort();
  return port !== null ? `ws://127.0.0.1:${port}/ws` : null;
}
