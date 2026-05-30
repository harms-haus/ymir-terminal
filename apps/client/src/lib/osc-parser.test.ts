import { describe, expect, it } from 'bun:test';
import { parseOsc7Cwd } from './osc-parser';

describe('parseOsc7Cwd', () => {
  it('returns null for empty string', () => {
    expect(parseOsc7Cwd('')).toBeNull();
  });

  it('returns null for string without OSC 7', () => {
    expect(parseOsc7Cwd('just some regular output')).toBeNull();
  });

  it('parses simple OSC 7 with BEL terminator', () => {
    expect(parseOsc7Cwd('\x1b]7;file://localhost/home/user\x07')).toBe('/home/user');
  });

  it('parses OSC 7 with ESC\\ terminator', () => {
    expect(parseOsc7Cwd('\x1b]7;file://myhost/home/user/project\x1b\\')).toBe('/home/user/project');
  });

  it('returns LAST match when multiple OSC 7 sequences present', () => {
    const data =
      '\x1b]7;file://localhost/home/first\x07some output\x1b]7;file://localhost/home/second\x07';
    expect(parseOsc7Cwd(data)).toBe('/home/second');
  });

  it('decodes URL-encoded paths', () => {
    expect(parseOsc7Cwd('\x1b]7;file://host/home/my%20dir\x07')).toBe('/home/my dir');
  });

  it('handles hostname with dots', () => {
    expect(parseOsc7Cwd('\x1b]7;file://my.host.name/home\x07')).toBe('/home');
  });
});
