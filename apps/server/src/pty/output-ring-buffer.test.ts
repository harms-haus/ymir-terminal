import { describe, it, expect } from 'bun:test';
import { OutputRingBuffer } from './output-ring-buffer';

/** Helper: create a Uint8Array filled with sequential bytes starting from `start`. */
function seqBytes(length: number, start = 0): Uint8Array {
  const arr = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    arr[i] = (start + i) & 0xff;
  }
  return arr;
}

describe('OutputRingBuffer', () => {
  // -----------------------------------------------------------------------
  // Basic append & snapshot
  // -----------------------------------------------------------------------

  it('append single chunk, snapshot returns it', () => {
    const buf = new OutputRingBuffer();
    const chunk = new Uint8Array([1, 2, 3, 4, 5]);
    buf.append(chunk);

    expect(buf.chunkCount).toBe(1);
    expect(buf.size).toBe(5);

    const snap = buf.snapshot();
    expect(snap).toEqual(chunk);
  });

  it('append multiple chunks, snapshot concatenates correctly', () => {
    const buf = new OutputRingBuffer();
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const c = new Uint8Array([5, 6, 7]);

    buf.append(a);
    buf.append(b);
    buf.append(c);

    expect(buf.chunkCount).toBe(3);
    expect(buf.size).toBe(7);

    const snap = buf.snapshot();
    expect(snap).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
  });

  // -----------------------------------------------------------------------
  // Empty buffer
  // -----------------------------------------------------------------------

  it('empty buffer snapshot returns empty Uint8Array', () => {
    const buf = new OutputRingBuffer();

    expect(buf.chunkCount).toBe(0);
    expect(buf.size).toBe(0);

    const snap = buf.snapshot();
    expect(snap).toEqual(new Uint8Array(0));
    expect(snap.byteLength).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Overflow: oldest chunks dropped
  // -----------------------------------------------------------------------

  it('overflow drops oldest chunks until new chunk fits', () => {
    // 20-byte capacity — fits exactly two 10-byte chunks
    const buf = new OutputRingBuffer(20);

    const chunkA = seqBytes(10, 0); // bytes 0-9
    const chunkB = seqBytes(10, 10); // bytes 10-19
    const chunkC = seqBytes(10, 20); // bytes 20-29

    buf.append(chunkA);
    buf.append(chunkB);
    expect(buf.chunkCount).toBe(2);
    expect(buf.size).toBe(20);

    // Adding chunkC (10 bytes) exceeds 20 — chunkA should be dropped.
    buf.append(chunkC);
    expect(buf.chunkCount).toBe(2);
    expect(buf.size).toBe(20);

    const snap = buf.snapshot();
    // Should contain chunkB then chunkC (not chunkA)
    const expected = new Uint8Array(20);
    expected.set(chunkB, 0);
    expected.set(chunkC, 10);
    expect(snap).toEqual(expected);
  });

  it('overflow drops multiple oldest chunks as needed', () => {
    // 15-byte capacity
    const buf = new OutputRingBuffer(15);

    // Three 5-byte chunks fill the buffer exactly
    buf.append(seqBytes(5, 0));
    buf.append(seqBytes(5, 5));
    buf.append(seqBytes(5, 10));
    expect(buf.size).toBe(15);

    // A 10-byte chunk requires dropping two oldest chunks (5+5=10 freed)
    // 15 - 10 = 5 remaining + 10 new = 15 ≤ 15 ✓
    const chunkD = seqBytes(10, 20);
    buf.append(chunkD);

    expect(buf.chunkCount).toBe(2); // third 5-byte chunk + 10-byte chunk
    expect(buf.size).toBe(15);

    const snap = buf.snapshot();
    // Last 5-byte chunk (bytes 10-14) followed by 10-byte chunk (bytes 20-29)
    expect(snap.slice(0, 5)).toEqual(seqBytes(5, 10));
    expect(snap.slice(5)).toEqual(chunkD);
  });

  // -----------------------------------------------------------------------
  // Single chunk larger than maxBytes
  // -----------------------------------------------------------------------

  it('single chunk larger than maxBytes clears buffer and stores just that chunk', () => {
    const buf = new OutputRingBuffer(10);

    // Pre-fill with some data
    buf.append(seqBytes(5, 0));
    buf.append(seqBytes(5, 5));
    expect(buf.size).toBe(10);

    // Append a chunk larger than maxBytes
    const huge = seqBytes(50, 100);
    buf.append(huge);

    expect(buf.chunkCount).toBe(1);
    expect(buf.size).toBe(50);
    expect(buf.snapshot()).toEqual(huge);
  });

  it('single chunk equal to maxBytes clears buffer and stores just that chunk', () => {
    const buf = new OutputRingBuffer(10);

    buf.append(seqBytes(5, 0));
    const exact = seqBytes(10, 50);
    buf.append(exact);

    expect(buf.chunkCount).toBe(1);
    expect(buf.size).toBe(10);
    expect(buf.snapshot()).toEqual(exact);
  });

  // -----------------------------------------------------------------------
  // Snapshot is a copy, not a drain
  // -----------------------------------------------------------------------

  it('snapshot returns a copy and does not drain the buffer', () => {
    const buf = new OutputRingBuffer();
    const chunk = new Uint8Array([42, 43, 44]);
    buf.append(chunk);

    const snap1 = buf.snapshot();
    expect(snap1).toEqual(chunk);

    // Buffer should still have the data
    expect(buf.chunkCount).toBe(1);
    expect(buf.size).toBe(3);

    // Snapshot again — should return identical data
    const snap2 = buf.snapshot();
    expect(snap2).toEqual(chunk);

    // The two snapshots should be distinct objects (copies)
    expect(snap1).not.toBe(snap2);
  });

  it('snapshot retains data after multiple appends', () => {
    const buf = new OutputRingBuffer(100);

    buf.append(new Uint8Array([1]));
    buf.append(new Uint8Array([2]));
    const snap1 = buf.snapshot();
    expect(snap1).toEqual(new Uint8Array([1, 2]));

    // Continue appending — previous data must still be present
    buf.append(new Uint8Array([3, 4]));
    const snap2 = buf.snapshot();
    expect(snap2).toEqual(new Uint8Array([1, 2, 3, 4]));

    // Original snapshot should be unaffected
    expect(snap1).toEqual(new Uint8Array([1, 2]));
  });

  // -----------------------------------------------------------------------
  // clear()
  // -----------------------------------------------------------------------

  it('clear removes all chunks', () => {
    const buf = new OutputRingBuffer();
    buf.append(new Uint8Array([1, 2, 3]));
    buf.append(new Uint8Array([4, 5]));
    expect(buf.size).toBe(5);

    buf.clear();

    expect(buf.chunkCount).toBe(0);
    expect(buf.size).toBe(0);
    expect(buf.snapshot()).toEqual(new Uint8Array(0));
  });

  // -----------------------------------------------------------------------
  // Default maxBytes
  // -----------------------------------------------------------------------

  it('uses default maxBytes of ~500KB', () => {
    const buf = new OutputRingBuffer();
    // 500 chunks of 1000 bytes = 500_000 bytes (under 512_000 default)
    for (let i = 0; i < 500; i++) {
      buf.append(new Uint8Array(1000).fill(i & 0xff));
    }
    expect(buf.size).toBe(500_000);
    expect(buf.chunkCount).toBe(500);
  });
});
