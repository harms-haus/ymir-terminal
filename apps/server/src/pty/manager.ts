import { basename } from 'node:path';
import { existsSync } from 'node:fs';
import { toBase64, fromBase64 } from '@ymir/shared';
import { OutputRingBuffer } from './output-ring-buffer';

const UNIX_SHELLS = new Set([
  '/bin/bash',
  '/bin/zsh',
  '/bin/sh',
  '/usr/bin/bash',
  '/usr/bin/zsh',
  '/usr/bin/sh',
]);
const WINDOWS_SHELLS = new Set(['cmd.exe', 'powershell.exe', 'pwsh.exe']);

const UNIX_FALLBACK = ['/bin/bash', '/bin/zsh', '/bin/sh'];
const WINDOWS_FALLBACK = ['cmd.exe', 'powershell.exe'];

export interface PTYOptions {
  shell?: string;
  cwd: string;
  cols: number;
  rows: number;
  onData: (data: string) => void; // base64-encoded output
  onExit?: (code: number | null) => void;
}

export class PTYManager {
  readonly #isWindows: boolean;
  readonly #allowedShells: Set<string>;
  readonly #fallbackOrder: string[];
  readonly #deps: { existsSync: (path: string) => boolean };

  #terminals = new Map<
    string,
    {
      terminal: unknown;
      process: { pid: number; kill: (sig: string) => void; exited: Promise<number> };
      lastCols?: number;
      lastRows?: number;
      exited?: boolean;
      onData: (data: string) => void;
      onExit?: (code: number | null) => void;
      buffer: OutputRingBuffer;
    }
  >();
  #buffers = new Map<string, OutputRingBuffer>();
  #exitedBuffers = new Map<
    string,
    { buffer: OutputRingBuffer; lastCols?: number; lastRows?: number }
  >();

  constructor(platform?: string, deps?: { existsSync?: (path: string) => boolean }) {
    this.#deps = { existsSync: deps?.existsSync ?? ((p: string) => existsSync(p)) };
    this.#isWindows = (platform ?? process.platform) === 'win32';
    this.#allowedShells = this.#isWindows ? WINDOWS_SHELLS : UNIX_SHELLS;
    this.#fallbackOrder = this.#isWindows ? WINDOWS_FALLBACK : UNIX_FALLBACK;
  }

  create(id: string, options: PTYOptions): string {
    const BunTerminal = (Bun as Record<string, unknown>).Terminal as
      | (new (opts: {
          cols: number;
          rows: number;
          data: (term: unknown, data: Buffer) => void;
        }) => {
          write: (data: string) => void;
          resize: (cols: number, rows: number) => void;
          close: () => void;
        })
      | undefined;
    if (!BunTerminal) throw new Error('Bun.Terminal is not available');

    const buffer = new OutputRingBuffer();

    const entry: {
      terminal: unknown;
      process: { pid: number; kill: (sig: string) => void; exited: Promise<number> };
      lastCols?: number;
      lastRows?: number;
      exited?: boolean;
      onData: (data: string) => void;
      onExit?: (code: number | null) => void;
      buffer: OutputRingBuffer;
    } = {
      terminal: undefined as unknown,
      process: undefined as unknown as {
        pid: number;
        kill: (sig: string) => void;
        exited: Promise<number>;
      },
      lastCols: options.cols,
      lastRows: options.rows,
      exited: false,
      onData: options.onData,
      onExit: options.onExit,
      buffer,
    };

    const terminal = new BunTerminal({
      cols: options.cols,
      rows: options.rows,
      data(_term: unknown, data: Buffer) {
        buffer.append(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        entry.onData(toBase64(data as Uint8Array));
      },
    });

    entry.terminal = terminal;

    const requestedShell = this.#isWindows
      ? options.shell || basename(process.env.COMSPEC || 'cmd.exe')
      : options.shell || process.env.SHELL || '/bin/bash';
    const shellToValidate = this.#isWindows ? basename(requestedShell) : requestedShell;
    if (!this.#allowedShells.has(shellToValidate)) {
      throw new Error(`Shell not allowed: ${requestedShell}`);
    }

    let shell = requestedShell;
    if (this.#isWindows) {
      // Windows shells are resolved via PATH; no existsSync check needed
    } else if (!this.#deps.existsSync(shell)) {
      const fallback = this.#fallbackOrder.find(
        (s) => this.#allowedShells.has(s) && this.#deps.existsSync(s),
      );
      if (!fallback) {
        throw new Error('No supported shell found on this system');
      }
      shell = fallback;
    }

    const bunSpawn = (Bun as Record<string, unknown>).spawn as
      | ((
          cmd: string[],
          opts: { terminal: unknown; cwd: string; env: Record<string, string | undefined> },
        ) => { pid: number; kill: (sig: string) => void; exited: Promise<number> })
      | undefined;
    if (!bunSpawn) throw new Error('Bun.spawn is not available');

    let proc: { pid: number; kill: (sig: string) => void; exited: Promise<number> };
    try {
      proc = bunSpawn([shell], {
        terminal,
        cwd: options.cwd,
        env: { ...process.env },
      });
    } catch (err) {
      (terminal as { close: () => void }).close();
      throw new Error(`Failed to spawn shell: ${shell}`, { cause: err });
    }

    entry.process = proc;
    this.#terminals.set(id, entry);
    this.#buffers.set(id, buffer);

    proc.exited
      .then((code: number) => this.#handleProcessExit(id, code))
      .catch(() => this.#handleProcessExit(id, null));

    return id;
  }

  write(id: string, base64Data: string): void {
    const entry = this.#terminals.get(id);
    if (!entry) throw new Error(`Terminal ${id} not found`);
    if (entry.exited) throw new Error(`Terminal ${id} has exited`);
    const decoded = fromBase64(base64Data);
    (entry.terminal as { write: (data: Uint8Array | string) => void }).write(decoded);
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.#terminals.get(id);
    if (!entry) throw new Error(`Terminal ${id} not found`);
    const safeCols = Math.floor(cols);
    const safeRows = Math.floor(rows);
    if (!Number.isFinite(safeCols) || safeCols < 1 || !Number.isFinite(safeRows) || safeRows < 1) {
      throw new Error(`Invalid terminal dimensions: ${cols}x${rows}`);
    }
    if (safeCols === entry.lastCols && safeRows === entry.lastRows) return;
    try {
      (entry.terminal as { resize: (cols: number, rows: number) => void }).resize(
        safeCols,
        safeRows,
      );
      entry.lastCols = safeCols;
      entry.lastRows = safeRows;

      // Bun.Terminal.resize() does not send SIGWINCH to the child process.
      // We send it to both the shell process directly AND to its process group
      // (negative PID). The process-group signal is critical for foreground
      // processes (like pi-coding-agent) that listen for SIGWINCH via
      // process.stdout 'resize' events. In a native terminal, the kernel
      // delivers SIGWINCH to the entire foreground process group via
      // ioctl(TIOCSWINSZ); here we must do it manually.
      //
      // There is an inherent TOCTOU race: the child may exit between
      // terminal.resize() and process.kill() below, and the OS could recycle
      // the PID.  We cannot fully prevent this without PID file descriptors
      // (pidfd), so we simply catch the error and move on.
      //
      // On Windows, ConPTY handles resize via terminal.resize() directly.
      if (!this.#isWindows) {
        try {
          process.kill(entry.process.pid, 'SIGWINCH');
        } catch {
          // Process may have exited (ESRCH) or PID was recycled; swallow.
        }
        try {
          process.kill(-entry.process.pid, 'SIGWINCH');
        } catch {
          // Process group may not exist or was recycled; swallow.
        }
      }
    } catch (err) {
      console.warn(`resize(${id}, ${safeCols}, ${safeRows}) failed:`, err);
    }
  }

  kill(id: string): void {
    const entry = this.#terminals.get(id);
    if (!entry) return;
    try {
      (entry.terminal as { close: () => void }).close();
    } catch {
      // Terminal may already be closed
    }
    try {
      entry.process.kill('SIGTERM');
    } catch {
      // Process may have already exited
    }
    this.#handleProcessExit(id, null);
  }

  #handleProcessExit(id: string, code: number | null): void {
    const entry = this.#terminals.get(id);
    if (entry) {
      entry.exited = true;
      this.#exitedBuffers.set(id, {
        buffer: entry.buffer,
        lastCols: entry.lastCols,
        lastRows: entry.lastRows,
      });
    }
    this.#terminals.delete(id);
    this.#buffers.delete(id);
    try {
      entry?.onExit?.(code);
    } catch {
      // Swallow errors from user-provided onExit callback
    }
  }

  has(id: string): boolean {
    return this.#terminals.has(id);
  }

  killAll(): void {
    for (const id of [...this.#terminals.keys()]) {
      this.kill(id);
    }
  }

  setOutputTarget(
    id: string,
    onData: (data: string) => void,
    onExit?: (code: number | null) => void,
  ): void {
    const entry = this.#terminals.get(id);
    if (!entry || entry.exited) return;
    entry.onData = onData;
    if (onExit !== undefined) {
      entry.onExit = onExit;
    }
  }

  getBufferSnapshot(id: string): Uint8Array | null {
    const buf = this.#buffers.get(id) ?? this.#exitedBuffers.get(id)?.buffer;
    return buf ? buf.snapshot() : null;
  }

  hasExited(id: string): boolean {
    if (this.#exitedBuffers.has(id)) return true;
    const entry = this.#terminals.get(id);
    if (entry) return !!entry.exited;
    return true;
  }

  getDimensions(id: string): { cols: number; rows: number } | null {
    const entry = this.#terminals.get(id);
    if (entry) {
      return { cols: entry.lastCols ?? 0, rows: entry.lastRows ?? 0 };
    }
    const exited = this.#exitedBuffers.get(id);
    if (exited) {
      return { cols: exited.lastCols ?? 0, rows: exited.lastRows ?? 0 };
    }
    return null;
  }
}
