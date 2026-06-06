import { useCallback } from 'react';

/**
 * Returns a memoized callback that toggles the current window's maximized
 * state when running inside a Tauri shell.  In browser mode it is a no-op.
 */
export function useTauriMaximize() {
  return useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__TAURI_INTERNALS__) {
      import('@tauri-apps/api/window').then((mod) => mod.getCurrentWindow().toggleMaximize());
    }
  }, []);
}
