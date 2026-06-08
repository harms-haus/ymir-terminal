const DEFAULT_MAX_BYTES = 512_000;

/**
 * A ring buffer that stores raw VT byte chunks (Uint8Array).
 *
 * When total bytes would exceed `maxBytes`, oldest chunks are dropped from
 * the front until the new chunk fits. If a single chunk is larger than
 * `maxBytes`, the buffer is cleared and stores just that chunk.
 */
export class OutputRingBuffer {
  readonly #chunks: Uint8Array[] = [];
  readonly #maxBytes: number;
  #totalBytes = 0;
  #head = 0;

  /** Fraction of the array that must be unused before compact(). */
  static readonly #COMPACT_RATIO = 0.5;

  constructor(maxBytes: number = DEFAULT_MAX_BYTES) {
    this.#maxBytes = maxBytes;
  }

  append(chunk: Uint8Array): void {
    if (chunk.byteLength === 0) return;
    if (chunk.byteLength >= this.#maxBytes) {
      // Single chunk is larger than (or equal to) capacity — clear and store just it.
      this.#chunks.length = 0;
      this.#totalBytes = 0;
      this.#head = 0;
      this.#chunks.push(chunk);
      this.#totalBytes = chunk.byteLength;
      return;
    }

    // Evict oldest chunks (O(1) amortised) until the new chunk fits.
    while (
      this.#totalBytes + chunk.byteLength > this.#maxBytes &&
      this.#head < this.#chunks.length
    ) {
      this.#totalBytes -= this.#chunks[this.#head].byteLength;
      this.#head++;
    }

    this.#chunks.push(chunk);
    this.#totalBytes += chunk.byteLength;

    this.#compact();
  }

  /**
   * Returns a **copy** (concatenated Uint8Array) of all stored chunks in
   * order. Does NOT drain/clear the buffer.
   */
  snapshot(): Uint8Array {
    if (this.#head >= this.#chunks.length) {
      return new Uint8Array(0);
    }

    const result = new Uint8Array(this.#totalBytes);
    let offset = 0;
    for (let i = this.#head; i < this.#chunks.length; i++) {
      const chunk = this.#chunks[i];
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  clear(): void {
    this.#chunks.length = 0;
    this.#totalBytes = 0;
    this.#head = 0;
  }

  get size(): number {
    return this.#totalBytes;
  }

  get chunkCount(): number {
    return this.#chunks.length - this.#head;
  }

  /**
   * Reclaims wasted front-of-array space when the discarded prefix grows
   * past the compact ratio. Runs in O(n) but is only triggered
   * periodically so the amortised cost of eviction stays O(1).
   */
  #compact(): void {
    if (this.#head === 0) return;
    if (this.#head >= this.#chunks.length * OutputRingBuffer.#COMPACT_RATIO) {
      this.#chunks.splice(0, this.#head);
      this.#head = 0;
    }
  }
}
