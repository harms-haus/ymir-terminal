/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, mock, afterEach, beforeEach } from 'bun:test';
import {
  URL_SCHEME_REGEX,
  stripTrailingPunctuation,
  openExternalUrl,
  initUrlOpener,
} from './url-opener';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Saved original `window.open` so we can restore after each test. */
let originalWindowOpen: typeof window.open;

beforeEach(() => {
  originalWindowOpen = window.open;
});

afterEach(() => {
  window.open = originalWindowOpen;
  // Clean up any Tauri internals that tests may have set
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).__TAURI_INTERNALS__;
});

// ---------------------------------------------------------------------------
// URL_SCHEME_REGEX
// ---------------------------------------------------------------------------

describe('URL_SCHEME_REGEX', () => {
  test('matches http and https URLs', () => {
    const matches = 'Visit https://example.com/path?q=1 now'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['https://example.com/path?q=1']);
  });

  test('matches ftp URLs', () => {
    const matches = 'Download ftp://files.example.com/pub/file.txt'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['ftp://files.example.com/pub/file.txt']);
  });

  test('matches ssh URLs', () => {
    const matches = 'ssh://user@host.example.com:22'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['ssh://user@host.example.com:22']);
  });

  test('matches git URLs', () => {
    const matches = 'git://github.com/user/repo.git'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['git://github.com/user/repo.git']);
  });

  test('matches mailto URLs', () => {
    const matches = 'mailto:user@example.com'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['mailto:user@example.com']);
  });

  test('matches tel URLs', () => {
    const matches = 'tel:+1-555-123-4567'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['tel:+1-555-123-4567']);
  });

  test('matches magnet URLs', () => {
    const matches = 'magnet:?xt=urn:btih:abc123&dn=file'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['magnet:?xt=urn:btih:abc123&dn=file']);
  });

  test('matches gemini URLs', () => {
    const matches = 'gemini://geminiprotocol.net/'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['gemini://geminiprotocol.net/']);
  });

  test('matches gopher URLs', () => {
    const matches = 'gopher://gopher.example.com/1/docs'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['gopher://gopher.example.com/1/docs']);
  });

  test('matches news URLs', () => {
    const matches = 'news:comp.infosystems.www'.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['news:comp.infosystems.www']);
  });

  test('does NOT match plain text without URL schemes', () => {
    const text = 'just some plain text with no urls here';
    const matches = text.match(URL_SCHEME_REGEX);
    expect(matches).toBeNull();
  });

  test('does NOT match unrelated colon patterns', () => {
    const text = 'time is 12:30 and ratio is 3:1';
    const matches = text.match(URL_SCHEME_REGEX);
    expect(matches).toBeNull();
  });

  test('extracts multiple URLs from surrounding text', () => {
    const text = 'Check https://example.com and mailto:foo@bar.com today!';
    const matches = text.match(URL_SCHEME_REGEX);
    expect(matches).toEqual(['https://example.com', 'mailto:foo@bar.com']);
  });
});

// ---------------------------------------------------------------------------
// stripTrailingPunctuation
// ---------------------------------------------------------------------------

describe('stripTrailingPunctuation', () => {
  test('strips trailing period', () => {
    expect(stripTrailingPunctuation('https://example.com.')).toBe('https://example.com');
  });

  test('strips trailing comma', () => {
    expect(stripTrailingPunctuation('https://example.com,')).toBe('https://example.com');
  });

  test('strips trailing semicolon', () => {
    expect(stripTrailingPunctuation('https://example.com;')).toBe('https://example.com');
  });

  test('strips trailing exclamation mark', () => {
    expect(stripTrailingPunctuation('https://example.com!')).toBe('https://example.com');
  });

  test('strips trailing closing parenthesis', () => {
    expect(stripTrailingPunctuation('https://example.com)')).toBe('https://example.com');
  });

  test('strips trailing closing bracket', () => {
    expect(stripTrailingPunctuation('https://example.com]')).toBe('https://example.com');
  });

  test('strips multiple trailing punctuation characters', () => {
    expect(stripTrailingPunctuation('https://example.com).;,')).toBe('https://example.com');
  });

  test('does not strip if no trailing punctuation', () => {
    expect(stripTrailingPunctuation('https://example.com/path')).toBe('https://example.com/path');
  });
});

// ---------------------------------------------------------------------------
// openExternalUrl — browser mode
// ---------------------------------------------------------------------------

describe('openExternalUrl — browser mode', () => {
  test('calls window.open with correct arguments', async () => {
    // Ensure NOT in Tauri mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;

    const mockOpen = mock(() => null as unknown as Window | null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.open = mockOpen as any;

    await openExternalUrl('https://example.com');

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });
});

// ---------------------------------------------------------------------------
// openExternalUrl — Tauri mode
// ---------------------------------------------------------------------------

describe('openExternalUrl — Tauri mode', () => {
  test('calls openUrl from the plugin when in Tauri', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {};

    const mockOpenUrl = mock((_url: string) => Promise.resolve());
    mock.module('@tauri-apps/plugin-opener', () => ({
      openUrl: mockOpenUrl,
    }));

    // Also spy on window.open to verify it's NOT called
    const mockOpen = mock(() => null as unknown as Window | null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.open = mockOpen as any;

    await openExternalUrl('https://example.com');

    expect(mockOpenUrl).toHaveBeenCalledTimes(1);
    expect(mockOpenUrl).toHaveBeenCalledWith('https://example.com');
    expect(mockOpen).not.toHaveBeenCalled();
  });

  test('falls back to window.open if plugin throws', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {};

    mock.module('@tauri-apps/plugin-opener', () => ({
      openUrl: (_url: string) => Promise.reject(new Error('plugin failure')),
    }));

    const mockOpen = mock(() => null as unknown as Window | null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.open = mockOpen as any;

    await openExternalUrl('https://example.com');

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  test('does not cause infinite recursion when plugin fails after initUrlOpener', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {};

    // Save the real window.open so we can track calls to it
    const realWindowOpen = window.open;
    let callCount = 0;
    const mockRealOpen = mock((_url?: string | URL, ..._rest: unknown[]) => {
      callCount++;
      return null as unknown as Window | null;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.open = mockRealOpen as any;

    // Patch window.open via initUrlOpener — this replaces window.open
    // with a version that calls openExternalUrl for external URLs
    const cleanup = initUrlOpener();

    // Mock the plugin to always fail
    mock.module('@tauri-apps/plugin-opener', () => ({
      openUrl: (_url: string) => Promise.reject(new Error('plugin failure')),
    }));

    // Call the patched window.open with an external URL.
    // Before the fix, the catch block in openExternalUrl would call
    // window.open (the patched version), causing infinite recursion.
    // After the fix, it calls the saved original window.open instead.
    const result = window.open('https://example.com', '_blank', 'noopener,noreferrer');
    expect(result).toBeNull();

    // Wait for the async openExternalUrl + catch fallback to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The original window.open should have been called exactly once
    // (from openExternalUrl's catch block), not recursing
    expect(callCount).toBe(1);
    expect(mockRealOpen).toHaveBeenCalledTimes(1);
    expect(mockRealOpen).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer',
    );

    cleanup();
    window.open = realWindowOpen;
  });
});

// ---------------------------------------------------------------------------
// initUrlOpener
// ---------------------------------------------------------------------------

describe('initUrlOpener', () => {
  test('returns no-op cleanup in browser mode', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;

    const savedOpen = window.open;
    const cleanup = initUrlOpener();

    // window.open should be unchanged
    expect(window.open).toBe(savedOpen);

    // cleanup should not throw
    cleanup();

    expect(window.open).toBe(savedOpen);
  });

  test('overrides window.open in Tauri mode for external URLs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {};

    const savedOpen = window.open;

    // We need openExternalUrl to be callable without actually importing the plugin
    // in this test context. Mock the plugin module.
    const mockOpenUrl = mock((_url: string) => Promise.resolve());
    mock.module('@tauri-apps/plugin-opener', () => ({
      openUrl: mockOpenUrl,
    }));

    const cleanup = initUrlOpener();

    // window.open should have been overridden
    expect(window.open).not.toBe(savedOpen);

    // Call window.open with an external URL
    const result = window.open('https://example.com', '_blank', 'noopener,noreferrer');

    // Should return null and route through openExternalUrl asynchronously
    expect(result).toBeNull();

    // Wait for microtasks to flush so openExternalUrl can complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockOpenUrl).toHaveBeenCalledTimes(1);
    expect(mockOpenUrl).toHaveBeenCalledWith('https://example.com');

    cleanup();
  });

  test('passes through non-external URLs to original window.open', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {};

    const mockOriginalOpen = mock(
      (_url?: string | URL, ..._rest: unknown[]) => null as unknown as Window | null,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.open = mockOriginalOpen as any;

    const cleanup = initUrlOpener();

    // Call with a non-external URL (blob:)
    window.open('blob:some-blob-url', '_blank');

    expect(mockOriginalOpen).toHaveBeenCalledTimes(1);
    expect(mockOriginalOpen).toHaveBeenCalledWith('blob:some-blob-url', '_blank');

    cleanup();
  });

  test('cleanup restores original window.open', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {};

    const savedOpen = window.open;

    const cleanup = initUrlOpener();
    expect(window.open).not.toBe(savedOpen);

    cleanup();
    expect(window.open).toBe(savedOpen);
  });
});
