/**
 * Shared Monaco link provider and opener registration.
 *
 * Used by `CodeEditor.tsx` and `DiffViewer.tsx` to avoid duplicating
 * URL link detection and opening logic.
 *
 * Imports URL helpers from `url-opener.ts` and wires them into Monaco's
 * link provider / link opener APIs.
 */

import { openExternalUrl, URL_SCHEME_REGEX, stripTrailingPunctuation } from './url-opener';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a Monaco `LinkProvider` and `LinkOpener` that detect and open
 * external URLs inside editor content.
 *
 * Each call registers its own independent provider and opener. Multiple
 * callers may safely call this function; each gets its own registrations
 * that are cleaned up individually via the returned disposable.
 *
 * @param monaco — The Monaco module (`import * as monaco from 'monaco-editor'`).
 * @returns A disposable that cleans up both registrations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupMonacoLinks(monaco: any): { dispose(): void } {
  // ---- Link Provider -----------------------------------------------------

  const linkProviderDisposable = monaco.languages.registerLinkProvider('*', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provideLinks(model: any, token: any): { links: any[] } {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const links: any[] = [];

      const lineCount = model.getLineCount();

      for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
        if (token.isCancellationRequested) {
          return { links };
        }

        const lineContent = model.getLineContent(lineNumber);

        // Create a fresh RegExp per call so lastIndex is always 0.
        const urlRegex = new RegExp(URL_SCHEME_REGEX.source, 'gi');

        let match: RegExpExecArray | null;
        while ((match = urlRegex.exec(lineContent)) !== null) {
          if (token.isCancellationRequested) {
            return { links };
          }

          const rawUrl = match[0];
          const url = stripTrailingPunctuation(rawUrl);
          const startIndex = match.index;

          links.push({
            range: {
              startLineNumber: lineNumber,
              startColumn: startIndex + 1,
              endLineNumber: lineNumber,
              endColumn: startIndex + rawUrl.length + 1,
            },
            url,
            tooltip: 'Ctrl+Click to open',
          });
        }
      }

      return { links };
    },
  });

  // ---- Link Opener -------------------------------------------------------

  const linkOpenerDisposable = monaco.editor.registerLinkOpener({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    open(resource: any): boolean {
      openExternalUrl(resource.toString());
      return true;
    },
  });

  // ---- Combined disposable -----------------------------------------------

  return {
    dispose() {
      linkProviderDisposable.dispose();
      linkOpenerDisposable.dispose();
    },
  };
}
