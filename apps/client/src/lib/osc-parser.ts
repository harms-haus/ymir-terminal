const OSC7_REGEX = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b]+)[\x07\x1b\\]/g;

/**
 * Parse OSC 7 (Set Working Directory) sequences from terminal output data.
 * OSC 7 format: ESC ] 7 ; file://hostname/path ST
 * Where ST is either BEL (\x07) or ESC \\ (\x1b\\)
 * Returns the decoded path from the last match, or null if no match found.
 */
export function parseOsc7Cwd(data: string): string | null {
  OSC7_REGEX.lastIndex = 0;
  let lastMatch: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = OSC7_REGEX.exec(data)) !== null) {
    lastMatch = match[1];
  }

  if (lastMatch === null) {
    return null;
  }

  return decodeURIComponent(lastMatch);
}
