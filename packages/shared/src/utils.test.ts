import { describe, expect, it } from "bun:test";
import {
  clamp,
  delay,
  expandTilde,
  fromBase64,
  generateId,
  getConfigPath,
  getDbPath,
  toBase64,
} from "./utils";

describe("toBase64 / fromBase64", () => {
  it("roundtrips a string through base64", () => {
    const encoded = toBase64("hello");
    // Verify it's valid base64 by decoding it
    const decoded = fromBase64(encoded);
    const text = new TextDecoder().decode(decoded);
    expect(text).toBe("hello");
  });

  it("handles Uint8Array input", () => {
    const input = new Uint8Array([1, 2, 3]);
    const encoded = toBase64(input);
    const decoded = fromBase64(encoded);
    expect(decoded).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('handles large payloads without stack overflow', () => {
    const largeData = new Uint8Array(200_000).fill(65); // 200KB of 'A'
    const encoded = toBase64(largeData);
    expect(encoded.length).toBeGreaterThan(0);
    const decoded = fromBase64(encoded);
    expect(decoded.length).toBe(200_000);
  });
});

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min when below range", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it("clamps to max when above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("expandTilde", () => {
  it("replaces ~/ with home directory", () => {
    const result = expandTilde("~/foo");
    expect(result.startsWith("/")).toBe(true);
    expect(result.endsWith("/foo")).toBe(true);
    expect(result).not.toContain("~");
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandTilde("/absolute/path")).toBe("/absolute/path");
  });
});

describe("generateId", () => {
  it("returns unique strings on each call", () => {
    const a = generateId();
    const b = generateId();
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe("delay", () => {
  it("resolves after approximately the requested delay", async () => {
    const start = performance.now();
    await delay(50);
    const elapsed = performance.now() - start;
    // Allow some tolerance for timer imprecision
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(200);
  });
});

describe("getConfigPath", () => {
  it("returns a path containing .config/ymir", () => {
    const path = getConfigPath();
    expect(path).toContain(".config/ymir");
  });
});

describe("getDbPath", () => {
  it("returns a path ending with ymir.db", () => {
    const path = getDbPath();
    expect(path.endsWith("ymir.db")).toBe(true);
  });
});
