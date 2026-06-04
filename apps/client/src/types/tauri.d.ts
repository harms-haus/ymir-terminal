/**
 * Type declarations for Tauri runtime APIs used throughout the client.
 *
 * These interfaces describe the subset of the Tauri window and core APIs
 * that the app actually calls, so we can drop `any` / eslint-disable hacks.
 */

// ---------------------------------------------------------------------------
// Window API (from @tauri-apps/api/window)
// ---------------------------------------------------------------------------

export interface TauriWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Core invoke (from @tauri-apps/api/core)
// ---------------------------------------------------------------------------

export type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Global augmentation
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    /** Set by the Tauri runtime when running inside a webview */
    __TAURI_INTERNALS__?: object;
    /** Port injected by the Tauri sidecar launcher */
    __YMIR_SIDECAR_PORT?: number;
  }
}
