/**
 * Shared URL opener utility for the Ymir terminal client.
 *
 * Provides:
 * - `URL_SCHEME_REGEX` — regex matching common URL schemes (mirrors ghostty-web).
 * - `stripTrailingPunctuation()` — strips trailing punctuation from URLs.
 * - `openExternalUrl()` — opens a URL in the system browser (Tauri or web).
 * - `initUrlOpener()` — patches `window.open` in Tauri mode so ghostty-web
 *   link clicks are routed through the native opener plugin.
 */

// ---------------------------------------------------------------------------
// URL detection helpers
// ---------------------------------------------------------------------------

/**
 * Single source of truth for the URL schemes that should be opened externally.
 *
 * Used to derive both `URL_SCHEME_REGEX` (for inline detection in terminal
 * text) and the synchronous prefix check in `initUrlOpener`.
 */
export const URL_SCHEME_PREFIXES = [
  'https://',
  'http://',
  'mailto:',
  'ftp://',
  'ssh://',
  'git://',
  'tel:',
  'magnet:',
  'gemini://',
  'gopher://',
  'news:',
] as const;

/**
 * Regex matching URL schemes that should be opened externally.
 *
 * Derived from `URL_SCHEME_PREFIXES` to stay in sync with the synchronous
 * prefix check used by `initUrlOpener`.
 */
export const URL_SCHEME_REGEX = new RegExp(
  '(?:' +
    URL_SCHEME_PREFIXES.map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|') +
    ')[\\w\\-.~:\\/\\?#@!$&*+,;=%]+',
  'gi',
);

/**
 * Strips trailing punctuation characters from a URL.
 *
 * Ghostty-web's `TRAILING_PUNCTUATION` regex `/[.,;!?)\]]+$/` strips
 * characters that are likely not part of the actual URL but were captured
 * by the surrounding text.
 */
export function stripTrailingPunctuation(url: string): string {
  return url.replace(/[.,;!?)\]]+$/, '');
}

// ---------------------------------------------------------------------------
// External URL opener
// ---------------------------------------------------------------------------

/**
 * Returns `true` when running inside a Tauri desktop shell.
 */
function isTauri(): boolean {
  return !!window.__TAURI_INTERNALS__;
}

/**
 * Module-level reference to the original `window.open` before patching.
 *
 * Stored so that `openExternalUrl`'s catch block can call the real
 * `window.open` instead of the patched version, avoiding infinite recursion
 * when `initUrlOpener` has overridden `window.open`.
 */
let _originalWindowOpen: typeof window.open | null = null;

/**
 * Synchronously check whether a URL string starts with a known external
 * scheme. Used by the `window.open` override so we can decide without
 * an async regex whether to route through the native opener.
 */
function isExternalUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return URL_SCHEME_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Open a URL in the system's default browser.
 *
 * In Tauri mode the URL is opened via `@tauri-apps/plugin-opener`. If the
 * plugin call fails we fall back to `window.open`.
 *
 * In plain browser mode we simply call `window.open`.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      // Use the saved original window.open to avoid infinite recursion
      // when initUrlOpener() has patched window.open to call this function.
      if (_originalWindowOpen) {
        _originalWindowOpen.call(window, url, '_blank', 'noopener,noreferrer');
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ---------------------------------------------------------------------------
// Global window.open override for Tauri
// ---------------------------------------------------------------------------

/**
 * Install a `window.open` override for Tauri mode.
 *
 * Ghostty-web's built-in terminal link detection calls `window.open` when
 * the user clicks a URL. In Tauri this would open a new webview window
 * instead of the system browser. By patching `window.open` we intercept
 * those calls and route external URLs through `openExternalUrl` which uses
 * the native opener plugin.
 *
 * @returns A cleanup function that restores the original `window.open`.
 */
export function initUrlOpener(): () => void {
  if (!isTauri()) {
    return () => {};
  }

  _originalWindowOpen = window.open;
  const originalWindowOpen = window.open;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.open = function (url?: string | URL, ...rest: any[]) {
    if (typeof url === 'string' && isExternalUrl(url)) {
      // Fire-and-forget: open in system browser via native plugin
      openExternalUrl(url);
      return null;
    }
    // Passthrough for non-external URLs (e.g. blob URLs, data URLs)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalWindowOpen as any).apply(this, [url, ...rest] as any);
  };

  // Return cleanup function that restores original window.open
  return () => {
    window.open = originalWindowOpen;
    _originalWindowOpen = null;
  };
}
