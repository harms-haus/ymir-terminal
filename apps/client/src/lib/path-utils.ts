/**
 * Split a path into segments, handling both / and \ separators.
 */
export function splitPath(path: string): string[] {
  return path.split(/[/\\]/);
}

/**
 * Get the last segment of a path (file/directory name).
 * Works with both / and \ separators.
 */
export function pathBasename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '');
  if (trimmed === '') return '';
  const segments = splitPath(trimmed);
  return segments[segments.length - 1] || '';
}

/**
 * Get the directory portion of a path (everything before the last separator).
 * Works with both / and \ separators.
 */
export function pathDirname(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '');
  if (trimmed === '') return '/';
  const segments = splitPath(trimmed);
  if (segments.length <= 1) return '.';
  segments.pop();
  return segments.join('/');  // Always use forward slash for IPC
}

/**
 * Join path segments, always using forward slashes.
 * The server's safePath normalizes via resolve() so forward slashes work fine.
 */
export function joinPath(...segments: string[]): string {
  return segments.flatMap((s) => splitPath(s)).filter(Boolean).join('/');
}
