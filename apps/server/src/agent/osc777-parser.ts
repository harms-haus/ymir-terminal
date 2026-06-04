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
const UTF8_DECODER = new TextDecoder('utf-8');

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

// ---------------------------------------------------------------------------
// Byte-level / raw parser (avoids lossy UTF-8 roundtrip)
// ---------------------------------------------------------------------------

/**
 * Result from {@link parseOSC777Bytes}.
 */
export interface OSC777BytesParseResult {
  /** Parsed agent events found in the data. */
  events: OSC777AgentEvent[];
  /** Original data with all OSC 777 sequences stripped. */
  cleanedData: Uint8Array;
  /**
   * An incomplete OSC 777 sequence at the end of the data that should be
   * prepended to the next chunk.  `null` when nothing is left pending.
   */
  partialTrailing: Uint8Array | null;
}

/**
 * The raw bytes for `\x1b]777` — the unavoidable start of any OSC 777
 * sequence.  Checking this prefix on raw terminal data is a fast pre-filter
 * that avoids full parsing.
 */
export const OSC777_BYTES = new Uint8Array([0x1b, 0x5d, 0x37, 0x37, 0x37]);

/**
 * The full prefix bytes for `\x1b]777;notify;warp://cli-agent;` — the start
 * marker we scan for in raw terminal output.
 */
const OSC777_FULL_PREFIX_BYTES = new TextEncoder().encode('\x1b]777;notify;warp://cli-agent;');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Search for the first occurrence of `needle` in `haystack` starting at
 * `fromIndex`.  Returns the index or -1 if not found.
 */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, fromIndex = 0): number {
  if (needle.length === 0) return fromIndex;
  if (fromIndex + needle.length > haystack.length) return -1;

  for (let i = fromIndex; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

/**
 * Concatenate multiple Uint8Arrays into a single Uint8Array.
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Quick-check optimisation (raw bytes)
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the raw bytes start with the bytes that begin an
 * OSC 777 escape sequence (`\x1b]777`).
 *
 * This is a cheap pre-filter intended to avoid full parsing of every
 * terminal output chunk.  It is **not** a definitive check — a false positive
 * simply means the chunk should be fully inspected with
 * {@link parseOSC777Bytes}.
 */
export function hasOSC777PrefixBytes(data: Uint8Array): boolean {
  if (data.length < OSC777_BYTES.length) return false;
  for (let i = 0; i < OSC777_BYTES.length; i++) {
    if (data[i] !== OSC777_BYTES[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Standalone byte-level parser
// ---------------------------------------------------------------------------

/**
 * Parse a single chunk of raw terminal output bytes for OSC 777 sequences.
 *
 * All complete sequences are extracted and the JSON payload parsed.  The
 * sequences themselves are stripped from the returned `cleanedData`.
 *
 * If the chunk ends with an incomplete sequence (e.g. JSON payload not yet
 * fully received), it is stored in `partialTrailing` so callers can prepend
 * it to the next chunk.
 *
 * This parser operates on raw bytes, only decoding the JSON payload portion
 * as UTF-8.  Non-UTF-8 binary data between sequences passes through unchanged.
 */
export function parseOSC777Bytes(data: Uint8Array): OSC777BytesParseResult {
  const events: OSC777AgentEvent[] = [];
  const cleanedParts: Uint8Array[] = [];
  let currentPos = 0;

  while (currentPos < data.length) {
    // Search for the full prefix starting at currentPos
    const startIdx = indexOfBytes(data, OSC777_FULL_PREFIX_BYTES, currentPos);
    if (startIdx === -1) {
      // No more start markers — remaining data is clean
      break;
    }

    // Add bytes before the start marker to cleaned output
    if (startIdx > currentPos) {
      cleanedParts.push(data.slice(currentPos, startIdx));
    }

    // Search for terminator starting after the prefix
    const payloadStart = startIdx + OSC777_FULL_PREFIX_BYTES.length;
    let termEnd = -1; // index of byte AFTER terminator

    for (let i = payloadStart; i < data.length; i++) {
      if (data[i] === 0x07) {
        // BEL terminator (1 byte)
        termEnd = i + 1;
        break;
      }
      if (data[i] === 0x1b && i + 1 < data.length && data[i + 1] === 0x5c) {
        // ST terminator (2 bytes: ESC \)
        termEnd = i + 2;
        break;
      }
    }

    if (termEnd !== -1) {
      // Complete sequence — extract payload
      const payloadEnd = data[termEnd - 1] === 0x07 ? termEnd - 1 : termEnd - 2;
      const payloadBytes = data.slice(payloadStart, payloadEnd);

      // Decode as UTF-8 and parse JSON
      try {
        const json = UTF8_DECODER.decode(payloadBytes);
        const parsed = JSON.parse(json);
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

      currentPos = termEnd;
    } else {
      // No terminator found — this is a partial sequence at the end of data.
      // Everything from startIdx onwards is stored as partialTrailing.
      // Text before the start marker already added to cleanedParts above.
      return {
        events,
        cleanedData: concatUint8Arrays(cleanedParts),
        partialTrailing: data.slice(startIdx),
      };
    }
  }

  // Add remaining data after the last complete sequence
  if (currentPos < data.length) {
    cleanedParts.push(data.slice(currentPos));
  }

  return {
    events,
    cleanedData: concatUint8Arrays(cleanedParts),
    partialTrailing: null,
  };
}

// ---------------------------------------------------------------------------
// Stateful byte-level stream parser
// ---------------------------------------------------------------------------

/**
 * Stateful parser that handles OSC 777 sequences split across multiple chunks
 * of raw bytes.
 *
 * @example
 *   const parser = new OSC777ByteStreamParser();
 *   const enc = new TextEncoder();
 *   const result1 = parser.feed(enc.encode('some text \x1b]777;notify;warp://cli-agent;{"e'));
 *   // result1.events = []
 *
 *   const result2 = parser.feed(enc.encode('vent":"stop"}\x07 more text'));
 *   // result2.events = [{ event: 'stop', ... }]
 */
export class OSC777ByteStreamParser {
  private partialBuffer = new Uint8Array(0);
  private static readonly MAX_PARTIAL = 65536; // 64 KiB

  /**
   * Feed the next chunk of raw terminal output bytes.
   *
   * Returns parsed events and cleaned data (with sequences stripped).
   * Any trailing partial is stored internally for the next `feed()` call.
   */
  feed(data: Uint8Array): {
    events: OSC777AgentEvent[];
    cleanedData: Uint8Array;
  } {
    // If partial buffer exceeds the limit, discard it
    if (this.partialBuffer.length > OSC777ByteStreamParser.MAX_PARTIAL) {
      this.partialBuffer = new Uint8Array(0);
    }

    const combined =
      this.partialBuffer.length > 0 ? concatUint8Arrays([this.partialBuffer, data]) : data;
    const result = parseOSC777Bytes(combined);
    this.partialBuffer = (result.partialTrailing ?? new Uint8Array(0)) as Uint8Array<ArrayBuffer>;

    return {
      events: result.events,
      cleanedData: result.cleanedData,
    };
  }

  /**
   * Returns `true` when there is a partial sequence buffered from a previous
   * `feed()` call.
   */
  hasPartial(): boolean {
    return this.partialBuffer.length > 0;
  }

  /**
   * Reset the parser state, discarding any buffered partial.
   */
  reset(): void {
    this.partialBuffer = new Uint8Array(0);
  }
}
