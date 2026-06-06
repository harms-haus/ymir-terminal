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

  constructor(maxBytes: number = DEFAULT_MAX_BYTES) {
    this.#maxBytes = maxBytes;
  }

  append(chunk: Uint8Array): void {
    if (chunk.byteLength === 0) return;
    if (chunk.byteLength >= this.#maxBytes) {
      // Single chunk is larger than (or equal to) capacity — clear and store just it.
      this.#chunks.length = 0;
      this.#totalBytes = 0;
      this.#chunks.push(chunk);
      this.#totalBytes = chunk.byteLength;
      return;
    }

    // Drop oldest chunks until the new chunk fits within maxBytes.
    while (this.#totalBytes + chunk.byteLength > this.#maxBytes && this.#chunks.length > 0) {
      const dropped = this.#chunks.shift()!;
      this.#totalBytes -= dropped.byteLength;
    }

    this.#chunks.push(chunk);
    this.#totalBytes += chunk.byteLength;
  }

  /**
   * Returns a **copy** (concatenated Uint8Array) of all stored chunks in
   * order. Does NOT drain/clear the buffer.
   */
  snapshot(): Uint8Array {
    if (this.#chunks.length === 0) {
      return new Uint8Array(0);
    }

    const result = new Uint8Array(this.#totalBytes);
    let offset = 0;
    for (const chunk of this.#chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  clear(): void {
    this.#chunks.length = 0;
    this.#totalBytes = 0;
  }

  get size(): number {
    return this.#totalBytes;
  }

  get chunkCount(): number {
    return this.#chunks.length;
  }
}
