/**
 * Configuration returned by the Tauri backend.
 */
export interface TauriConfig {
  port: number;
  password: string;
}

/**
 * Return type for the useTauri hook.
 */
export interface UseTauriReturn {
  /** Whether the app is running inside a Tauri webview */
  isTauri: boolean;
  /** Get the Tauri configuration (port + password). Returns null if not in Tauri. */
  getTauriConfig: () => Promise<TauriConfig | null>;
}

// Cache the Tauri API imports to avoid repeated dynamic imports
let _invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null | false =
  null;

async function getInvoke() {
  if (_invoke !== null) return _invoke;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(window as any).__TAURI_INTERNALS__) {
    _invoke = false;
    return false;
  }
  try {
    const mod = await import('@tauri-apps/api/core');
    _invoke = mod.invoke;
    return _invoke;
  } catch {
    _invoke = false;
    return false;
  }
}

/**
 * Hook to detect Tauri environment and access Tauri configuration.
 *
 * Uses dynamic imports to avoid errors when @tauri-apps/api is not installed
 * or the app is running in a browser.
 */
export function useTauri(): UseTauriReturn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isTauri = !!(window as any).__TAURI_INTERNALS__;

  const getTauriConfig = async (): Promise<TauriConfig | null> => {
    const invoke = await getInvoke();
    if (!invoke) return null;
    try {
      const config = (await invoke('get_tauri_config', {})) as TauriConfig;
      return config;
    } catch (err) {
      console.error('[useTauri] Failed to get Tauri config:', err);
      return null;
    }
  };

  return { isTauri, getTauriConfig };
}
