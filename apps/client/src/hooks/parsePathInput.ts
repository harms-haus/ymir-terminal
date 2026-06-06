/**
 * Pure utility function that extracts the parent directory and filter prefix
 * from a path input string.
 *
 * Only absolute paths (starting with `/` or `~`) trigger a query.
 * Relative paths return an empty queryDir so no fetch is made.
 */
export function parsePathInput(input: string): { queryDir: string; prefix: string } {
  if (input === '') {
    return { queryDir: '', prefix: '' };
  }

  const lastSlash = input.lastIndexOf('/');
  if (lastSlash === -1) {
    // No slash — treat as a bare name (e.g. "~", ".hidden", "Documents/sof")
    // Only "~" alone is special (lists home dir)
    if (input === '~') {
      return { queryDir: '~', prefix: '' };
    }
    // Everything else is relative — no query
    return { queryDir: '', prefix: input };
  }

  const queryDir = input.slice(0, lastSlash) || (input.startsWith('/') ? '/' : '');
  const prefix = input.slice(lastSlash + 1);

  // Only query if queryDir starts with `/` or `~`
  if (queryDir.startsWith('/') || queryDir.startsWith('~')) {
    return { queryDir, prefix };
  }

  // Relative path — no query
  return { queryDir: '', prefix: input };
}
