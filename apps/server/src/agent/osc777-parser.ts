// ---------------------------------------------------------------------------
// OSC 777 agent notification parser
//
// Parses \x1b]777;notify;warp://cli-agent;<JSON>\x07 (BEL) or
// \x1b]777;notify;warp://cli-agent;<JSON>\x1b\ (ST) escape sequences
// emitted by AI agents inside terminal emulators.
//
// See https://github.com/nickolay/agent-proxy/blob/main/protocol.md
// ---------------------------------------------------------------------------

import type { AgentStatus, OSC777AgentEvent } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OSC777ParseResult {
  /** Parsed agent events found in the data. */
  events: OSC777AgentEvent[];
  /** Original data with all OSC 777 sequences stripped. */
  cleanedData: string;
  /**
   * An incomplete OSC 777 sequence at the end of the data that should be
   * prepended to the next chunk.  `null` when nothing is left pending.
   */
  partialTrailing: string | null;
}

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

/**
 * Matches a complete OSC 777 sequence:
 *
 *   \x1b]777;notify;warp://cli-agent;<JSON>\x07
 *   \x1b]777;notify;warp://cli-agent;<JSON>\x1b\
 *
 * Captures the JSON payload (group 1).
 */
const OSC777_REGEX = /\x1b\]777;notify;warp:\/\/cli-agent;([^\x07\x1b]+)(?:\x07|\x1b\\)/g;

/**
 * The fixed prefix that starts every OSC 777 sequence (without JSON).
 */
const OSC777_START = '\x1b]777;notify;warp://cli-agent;';

// ---------------------------------------------------------------------------
// Standalone parser
// ---------------------------------------------------------------------------

/**
 * Parse a single chunk of terminal output for OSC 777 sequences.
 *
 * All complete sequences are extracted and the JSON payload parsed.  The
 * sequences themselves are stripped from the returned `cleanedData`.
 *
 * If the chunk ends with an incomplete sequence (e.g. JSON payload not yet
 * fully received), it is stored in `partialTrailing` so callers can prepend
 * it to the next chunk.
 */
export function parseOSC777(data: string): OSC777ParseResult {
  const events: OSC777AgentEvent[] = [];
  let lastIndex = 0;
  const cleanedParts: string[] = [];

  let match: RegExpExecArray | null;

  // Reset regex state (important when called multiple times)
  OSC777_REGEX.lastIndex = 0;

  while ((match = OSC777_REGEX.exec(data)) !== null) {
    // Add text before this match to cleaned output
    cleanedParts.push(data.slice(lastIndex, match.index));

    const rawJson = match[1];
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed !== null && typeof parsed === 'object' && typeof parsed.event === 'string') {
        events.push({
          v: typeof parsed.v === 'number' ? parsed.v : 1,
          agent: typeof parsed.agent === 'string' ? parsed.agent : '',
          event: parsed.event,
          session_id: typeof parsed.session_id === 'string' ? parsed.session_id : '',
          cwd: typeof parsed.cwd === 'string' ? parsed.cwd : '',
          project: typeof parsed.project === 'string' ? parsed.project : '',
        });
      }
      // If parsed result doesn't have event field, silently skip (malformed)
    } catch {
      // Malformed JSON — skip this sequence but still strip it
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after the last match
  const remaining = data.slice(lastIndex);
  let partialTrailing: string | null = null;

  // Check whether the remaining text ends with an incomplete OSC 777 sequence
  const lastEsc = remaining.lastIndexOf('\x1b');
  if (lastEsc >= 0) {
    const suffix = remaining.slice(lastEsc);
    if (suffix.startsWith(OSC777_START) && !suffix.includes('\x07') && !suffix.includes('\x1b\\')) {
      // Looks like a partial sequence — hold it for the next chunk
      partialTrailing = suffix;
      cleanedParts.push(remaining.slice(0, lastEsc));
    } else {
      cleanedParts.push(remaining);
    }
  } else {
    cleanedParts.push(remaining);
  }

  return {
    events,
    cleanedData: cleanedParts.join(''),
    partialTrailing,
  };
}

// ---------------------------------------------------------------------------
// Stateful stream parser
// ---------------------------------------------------------------------------

/**
 * Stateful parser that handles OSC 777 sequences split across multiple chunks.
 *
 * @example
 *   const parser = new OSC777StreamParser();
 *   const result1 = parser.feed('some text \x1b]777;notify;warp://cli-agent;{"e');
 *   // result1.events = [], result1.partialTrailing = '{"e'
 *
 *   const result2 = parser.feed('vent":"stop"}\x07 more text');
 *   // result2.events = [{ event: 'stop', ... }]
 */
export class OSC777StreamParser {
  private partialBuffer = '';

  /**
   * Feed the next chunk of terminal output.
   *
   * Returns parsed events, cleaned data (with sequences stripped), and any
   * trailing partial for further buffering.
   */
  feed(data: string): OSC777ParseResult {
    const MAX_PARTIAL = 65536; // 64 KiB - no legitimate OSC 777 payload should be larger

    // If partial buffer exceeds the limit, discard it
    if (this.partialBuffer.length > MAX_PARTIAL) {
      this.partialBuffer = '';
    }

    const combined = this.partialBuffer + data;
    const result = parseOSC777(combined);
    this.partialBuffer = result.partialTrailing ?? '';
    return result;
  }

  /**
   * Returns the currently buffered partial (without consuming it).
   * Useful for debugging or inspection.
   */
  getPartialBuffer(): string {
    return this.partialBuffer;
  }

  /**
   * Reset the parser state, discarding any buffered partial.
   */
  reset(): void {
    this.partialBuffer = '';
  }
}

// ---------------------------------------------------------------------------
// Event → status mapping
// ---------------------------------------------------------------------------

/**
 * Map an OSC 777 event name to an {@link AgentStatus}.
 *
 * Returns `null` for unknown / uninteresting events so callers can ignore
 * them.
 */
export function osc777EventToStatus(event: string): AgentStatus | null {
  switch (event) {
    case 'session_start':
    case 'prompt_submit':
    case 'tool_complete':
      return 'working';
    case 'permission_request':
    case 'idle_prompt':
      return 'halted';
    case 'stop':
      return 'done';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Quick-check optimisation
// ---------------------------------------------------------------------------

/**
 * The first 7 base64 characters of the raw bytes `\x1b]777` — the unavoidable
 * start of any OSC 777 sequence.
 *
 * Base64 of `\x1b]777` (5 bytes) → `G103Nzc` (without padding).  Checking this
 * prefix on base64-encoded terminal data is a fast pre-filter that avoids
 * decoding every output chunk.  Using `\x1b]777` instead of just `\x1b]7`
 * avoids false positives from OSC 7 (working directory) sequences that are
 * emitted by shells on every prompt.
 */
const OSC777_BASE64_PREFIX = 'G103Nzc';

/**
 * Returns `true` when the base64-encoded data starts with the bytes that
 * begin an OSC 777 escape sequence (`\x1b]777`).
 *
 * This is a cheap pre-filter intended to avoid full base64 decoding of every
 * terminal output chunk.  It is **not** a definitive check — a false positive
 * simply means the chunk should be decoded and inspected with
 * {@link parseOSC777}.
 */
export function hasOSC777Prefix(base64Data: string): boolean {
  return base64Data.startsWith(OSC777_BASE64_PREFIX);
}
