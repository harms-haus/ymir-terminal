// ---------------------------------------------------------------------------
// Tests for the OSC 777 agent notification parser
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'bun:test';
import {
  hasOSC777Prefix,
  osc777EventToStatus,
  OSC777StreamParser,
  parseOSC777,
} from './osc777-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a complete OSC 777 sequence terminated with BEL (\x07).
 */
function seqBEL(json: string): string {
  return `\x1b]777;notify;warp://cli-agent;${json}\x07`;
}

/**
 * Build a complete OSC 777 sequence terminated with ST (\x1b\\\\).
 */
function seqST(json: string): string {
  return `\x1b]777;notify;warp://cli-agent;${json}\x1b\\`;
}

const validJson = JSON.stringify({
  v: 1,
  agent: 'claude',
  event: 'stop',
  session_id: 'sess-1',
  cwd: '/home/user',
  project: 'my-project',
});

const validWorkingJson = JSON.stringify({
  v: 1,
  agent: 'pi',
  event: 'session_start',
  session_id: 'sess-2',
  cwd: '/workspace',
  project: 'test',
});

const validHaltedJson = JSON.stringify({
  v: 1,
  agent: 'opencode',
  event: 'permission_request',
  session_id: 'sess-3',
  cwd: '/tmp',
  project: 'foo',
});

// ---------------------------------------------------------------------------
// parseOSC777
// ---------------------------------------------------------------------------

describe('parseOSC777', () => {
  it('extracts event from a valid complete sequence (BEL terminator)', () => {
    const input = seqBEL(validJson);
    const result = parseOSC777(input);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      v: 1,
      agent: 'claude',
      event: 'stop',
      session_id: 'sess-1',
      cwd: '/home/user',
      project: 'my-project',
    });
    // The whole input was the sequence — cleaned should be empty
    expect(result.cleanedData).toBe('');
    expect(result.partialTrailing).toBeNull();
  });

  it('extracts event from a valid complete sequence (ST terminator)', () => {
    const input = seqST(validJson);
    const result = parseOSC777(input);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].event).toBe('stop');
    expect(result.events[0].agent).toBe('claude');
    expect(result.cleanedData).toBe('');
    expect(result.partialTrailing).toBeNull();
  });

  it('extracts multiple sequences in one chunk', () => {
    const input =
      'before ' + seqBEL(validWorkingJson) + ' between ' + seqST(validHaltedJson) + ' after';

    const result = parseOSC777(input);

    expect(result.events).toHaveLength(2);
    expect(result.events[0].event).toBe('session_start');
    expect(result.events[0].agent).toBe('pi');
    expect(result.events[1].event).toBe('permission_request');
    expect(result.events[1].agent).toBe('opencode');
    expect(result.cleanedData).toBe('before  between  after');
    expect(result.partialTrailing).toBeNull();
  });

  it('preserves text sequences when no OSC 777 present', () => {
    const input = 'hello world\nthis is normal terminal output';
    const result = parseOSC777(input);

    expect(result.events).toHaveLength(0);
    expect(result.cleanedData).toBe(input);
    expect(result.partialTrailing).toBeNull();
  });

  it('strips sequence but produces no event when JSON is malformed', () => {
    const input = 'leading ' + seqBEL('{invalid}') + ' trailing';
    const result = parseOSC777(input);

    expect(result.events).toHaveLength(0);
    expect(result.cleanedData).toBe('leading  trailing');
    expect(result.partialTrailing).toBeNull();
  });

  it('strips sequence but produces no event when parsed object lacks event field', () => {
    const input = 'x' + seqBEL('{"foo":"bar"}') + 'y';
    const result = parseOSC777(input);

    expect(result.events).toHaveLength(0);
    expect(result.cleanedData).toBe('xy');
    expect(result.partialTrailing).toBeNull();
  });

  it('handles partial sequence at the end of a chunk', () => {
    // Only the prefix and part of the JSON — no terminator yet
    const partial = '\x1b]777;notify;warp://cli-agent;{"v":1,"agent":"claude","ev';
    const input = 'start ' + partial;
    const result = parseOSC777(input);

    expect(result.events).toHaveLength(0);
    // The partial should be stripped from cleanedData
    expect(result.cleanedData).toBe('start ');
    // And stored as partialTrailing
    expect(result.partialTrailing).toBe(partial);
  });

  it('handles multiple sequences with partial at the end', () => {
    const input = 'a' + seqBEL(validJson) + 'b' + '\x1b]777;notify;warp://cli-agent;{"event":"too';
    const result = parseOSC777(input);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].event).toBe('stop');
    expect(result.cleanedData).toBe('ab');
    expect(result.partialTrailing).toBe('\x1b]777;notify;warp://cli-agent;{"event":"too');
  });

  it('does not treat a non-OSC-777 escape as a partial', () => {
    const input = 'some text \x1b[31mred\x1b[0m';
    const result = parseOSC777(input);

    expect(result.events).toHaveLength(0);
    expect(result.cleanedData).toBe(input);
    expect(result.partialTrailing).toBeNull();
  });

  it('handles empty string', () => {
    const result = parseOSC777('');

    expect(result.events).toHaveLength(0);
    expect(result.cleanedData).toBe('');
    expect(result.partialTrailing).toBeNull();
  });

  it('handles sequence with only required event field in JSON', () => {
    const minimal = JSON.stringify({ event: 'stop' });
    const input = seqBEL(minimal);
    const result = parseOSC777(input);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].event).toBe('stop');
    expect(result.events[0].v).toBe(1); // default
    expect(result.events[0].agent).toBe(''); // default
    expect(result.events[0].session_id).toBe(''); // default
    expect(result.events[0].cwd).toBe(''); // default
    expect(result.events[0].project).toBe(''); // default
  });
});

// ---------------------------------------------------------------------------
// OSC777StreamParser
// ---------------------------------------------------------------------------

describe('OSC777StreamParser', () => {
  it('accumulates across chunks to yield a complete event', () => {
    const parser = new OSC777StreamParser();

    // First chunk ends in the middle of JSON
    const chunk1 = 'leading \x1b]777;notify;warp://cli-agent;{"v":1,"agent":"pi","event":"too';
    const result1 = parser.feed(chunk1);

    expect(result1.events).toHaveLength(0);
    expect(result1.cleanedData).toBe('leading ');
    expect(result1.partialTrailing).not.toBeNull();

    // Second chunk completes the sequence
    const chunk2 = 'l_complete","session_id":"s1","cwd":"/x","project":"p"}\x07 trailing';
    const result2 = parser.feed(chunk2);

    expect(result2.events).toHaveLength(1);
    expect(result2.events[0].event).toBe('tool_complete');
    expect(result2.events[0].agent).toBe('pi');
    expect(result2.cleanedData).toBe(' trailing');
    expect(result2.partialTrailing).toBeNull();
  });

  it('handles three chunks for one sequence', () => {
    const parser = new OSC777StreamParser();

    const r1 = parser.feed('\x1b]777;notify;warp://cli-agent;{"event":');
    expect(r1.events).toHaveLength(0);
    expect(r1.partialTrailing).not.toBeNull();

    const r2 = parser.feed('"session_start","agent":"aide');
    expect(r2.events).toHaveLength(0);
    expect(r2.partialTrailing).not.toBeNull();

    const r3 = parser.feed('r"}\x07 done');
    expect(r3.events).toHaveLength(1);
    expect(r3.events[0].event).toBe('session_start');
    expect(r3.events[0].agent).toBe('aider');
    expect(r3.cleanedData).toBe(' done');
    expect(r3.partialTrailing).toBeNull();
  });

  it('accumulates partial buffer across chunks until terminator arrives', () => {
    const parser = new OSC777StreamParser();

    const r1 = parser.feed('\x1b]777;notify;warp://cli-agent;{"event":"');
    expect(r1.partialTrailing).not.toBeNull();

    // Second chunk looks like unrelated text but the parser cannot know that
    // until the sequence is terminated — it accumulates into the partial buffer.
    const r2 = parser.feed('hello');
    expect(r2.events).toHaveLength(0);

    // Third chunk completes the sequence; "hello" is part of the captured JSON.
    const r3 = parser.feed('stop"}\x07');
    expect(r3.events).toHaveLength(1);
    expect(r3.events[0].event).toBe('hellostop');
  });

  it('reset() clears the partial buffer', () => {
    const parser = new OSC777StreamParser();

    parser.feed('\x1b]777;notify;warp://cli-agent;{"event":"');
    expect(parser.getPartialBuffer()).not.toBe('');

    parser.reset();
    expect(parser.getPartialBuffer()).toBe('');

    // After reset, a new partial can be accumulated
    parser.feed('\x1b]777;notify;warp://cli-agent;{"event":"stop');
    expect(parser.getPartialBuffer()).not.toBe('');
  });

  it('handles empty feed calls', () => {
    const parser = new OSC777StreamParser();

    const r1 = parser.feed('');
    expect(r1.events).toHaveLength(0);
    expect(r1.cleanedData).toBe('');
    expect(r1.partialTrailing).toBeNull();

    const r2 = parser.feed(seqBEL(validJson));
    expect(r2.events).toHaveLength(1);

    const r3 = parser.feed('');
    expect(r3.events).toHaveLength(0);
    expect(r3.cleanedData).toBe('');
    expect(r3.partialTrailing).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// osc777EventToStatus
// ---------------------------------------------------------------------------

describe('osc777EventToStatus', () => {
  it('maps session_start → working', () => {
    expect(osc777EventToStatus('session_start')).toBe('working');
  });

  it('maps prompt_submit → working', () => {
    expect(osc777EventToStatus('prompt_submit')).toBe('working');
  });

  it('maps tool_complete → working', () => {
    expect(osc777EventToStatus('tool_complete')).toBe('working');
  });

  it('maps permission_request → halted', () => {
    expect(osc777EventToStatus('permission_request')).toBe('halted');
  });

  it('maps idle_prompt → halted', () => {
    expect(osc777EventToStatus('idle_prompt')).toBe('halted');
  });

  it('maps stop → done', () => {
    expect(osc777EventToStatus('stop')).toBe('done');
  });

  it('returns null for unknown events', () => {
    expect(osc777EventToStatus('unknown_event')).toBeNull();
    expect(osc777EventToStatus('')).toBeNull();
    expect(osc777EventToStatus('session_end')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasOSC777Prefix
// ---------------------------------------------------------------------------

describe('hasOSC777Prefix', () => {
  it('returns true when base64 data starts with G103Nzc', () => {
    // Base64 of \x1b]777 (5 bytes) is "G103Nzc=" (with padding)
    // The prefix checks the first 7 chars of unpadded base64
    expect(hasOSC777Prefix('G103Nzc=')).toBeTrue();
    expect(hasOSC777Prefix('G103Nzc7')).toBeTrue();
  });

  it('returns false when base64 data does not start with G103Nzc', () => {
    expect(hasOSC777Prefix('')).toBeFalse();
    expect(hasOSC777Prefix('SGVsbG8=')).toBeFalse(); // "Hello"
    expect(hasOSC777Prefix('ABCDEF')).toBeFalse();
    expect(hasOSC777Prefix('G102')).toBeFalse(); // close but not matching
    expect(hasOSC777Prefix('G103xyz')).toBeFalse(); // no longer matches — needs full G103Nzc prefix
  });
});
