import type { FileSearchFileResult, FileSearchMatch, FileSearchSubmatch } from '@ymir/shared';

export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  includePattern?: string;
  maxTotal: number;
  maxPerFile: number;
}

export interface SearchCallbacks {
  onFileResult: (result: FileSearchFileResult) => void;
}

/**
 * Stream search results from ripgrep via NDJSON output.
 *
 * @param cwd         - The directory to search (passed to rg as the search path).
 * @param workspaceRoot - Used to compute relative paths from absolute rg output.
 * @param options     - Search flags and limits.
 * @param callbacks   - Called once per file when all its matches have been collected.
 * @param signal      - Optional AbortSignal to cancel the running process.
 */
export async function streamSearch(
  cwd: string,
  workspaceRoot: string,
  options: SearchOptions,
  callbacks: SearchCallbacks,
  signal?: AbortSignal,
): Promise<{ totalMatches: number; truncated: boolean; fileCount: number }> {
  // ---- Build ripgrep arguments ----
  const args: string[] = ['--json', '--max-count', String(options.maxPerFile)];

  if (!options.useRegex) {
    args.push('-F');
  }
  if (!options.caseSensitive) {
    args.push('-i');
  }
  if (options.wholeWord) {
    args.push('-w');
  }
  if (options.includePattern) {
    args.push('--glob', options.includePattern);
  }

  args.push('-e', options.query);
  args.push(cwd);

  // ---- Spawn ripgrep ----
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  try {
    proc = Bun.spawn(['rg', ...args], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'ripgrep (rg) is required for file search. Install it from https://github.com/BurntSushi/ripgrep',
      );
    }
    throw err;
  }

  // ---- Abort handling ----
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    try {
      proc!.kill();
    } catch {
      /* process may have already exited */
    }
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  // ---- Streaming state ----
  let totalMatches = 0;
  let truncated = false;
  let fileCount = 0;

  let currentFilePath = '';
  let currentMatches: FileSearchMatch[] = [];
  let currentFileTruncated = false;

  const prefix = workspaceRoot + '/';

  function relativePath(absolute: string): string {
    if (absolute.startsWith(prefix)) {
      return absolute.slice(prefix.length);
    }
    return absolute;
  }

  function extractRgText(pathData: unknown): string {
    if (typeof pathData === 'object' && pathData !== null) {
      const obj = pathData as Record<string, unknown>;
      if (typeof obj.text === 'string') return obj.text;
      if (typeof obj.bytes === 'string') return atob(obj.bytes);
    }
    return String(pathData);
  }

  function flushFile(): void {
    if (currentFilePath) {
      fileCount++;
      callbacks.onFileResult({
        path: currentFilePath,
        relativePath: relativePath(currentFilePath),
        matches: currentMatches,
        truncated: currentFileTruncated,
      });
      currentFilePath = '';
      currentMatches = [];
      currentFileTruncated = false;
    }
  }

  // ---- Read stream ----
  const stdout = proc.stdout as ReadableStream<Uint8Array>;
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted || aborted) break;

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on newlines, keeping any incomplete trailing line in buffer
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }

        const type = msg.type as string;
        const data = msg.data as Record<string, unknown> | undefined;
        if (!data) continue;

        switch (type) {
          case 'begin': {
            // Start of a new file — flush previous if any
            flushFile();
            currentFilePath = extractRgText(data.path);
            currentMatches = [];
            currentFileTruncated = false;
            break;
          }

          case 'match': {
            const lineNumber = data.line_number as number;
            const linesObj = data.lines as Record<string, unknown> | undefined;
            let lineText: string =
              typeof linesObj?.text === 'string' ? linesObj.text : String(linesObj?.text ?? '');
            // Strip trailing newline that ripgrep includes
            if (lineText.endsWith('\n')) {
              lineText = lineText.slice(0, -1);
            }

            const rawSubs = (data.submatches as Record<string, unknown>[]) ?? [];
            const submatches: FileSearchSubmatch[] = rawSubs.map(
              (sub: Record<string, unknown>) => ({
                matchText: extractRgText(sub.match),
                start: sub.start as number,
                end: sub.end as number,
              }),
            );

            currentMatches.push({
              lineNumber,
              lineText,
              submatches: submatches as FileSearchSubmatch[],
            });
            totalMatches++;

            // Check global limit
            if (totalMatches >= options.maxTotal) {
              truncated = true;
              currentFileTruncated = true;
              proc.kill();
            }
            break;
          }

          case 'end': {
            flushFile();
            break;
          }

          case 'summary': {
            // Stats from ripgrep; we track our own counts.
            break;
          }
        }

        if (truncated) break;
      }

      if (truncated) break;
    }
  } finally {
    // Flush any remaining file
    flushFile();

    reader.cancel().catch(() => {});
    signal?.removeEventListener('abort', onAbort);

    try {
      proc.kill();
    } catch {
      /* already exited */
    }
  }

  // Check for ripgrep errors — exit code 2 indicates a real error
  // (exit code 1 means no matches found, which is not an error)
  const exitCode = await proc.exited;
  if (exitCode === 2) {
    const stderrText = await new Response(proc.stderr as ReadableStream).text();
    throw new Error(`ripgrep error: ${stderrText.trim() || 'unknown error'}`);
  }

  return { totalMatches, truncated, fileCount };
}
