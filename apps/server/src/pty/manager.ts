import { basename } from 'node:path';
import { existsSync } from 'node:fs';
import { toBase64, fromBase64 } from '@ymir/shared';

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
  private readonly isWindows: boolean;
  private readonly allowedShells: Set<string>;
  private readonly fallbackOrder: string[];

  terminals = new Map<
    string,
    {
      terminal: unknown;
      process: { pid: number; kill: (sig: string) => void; exited: Promise<number> };
      lastCols?: number;
      lastRows?: number;
      exited?: boolean;
    }
  >();

  constructor(platform?: string) {
    this.isWindows = (platform ?? process.platform) === 'win32';
    this.allowedShells = this.isWindows ? WINDOWS_SHELLS : UNIX_SHELLS;
    this.fallbackOrder = this.isWindows ? WINDOWS_FALLBACK : UNIX_FALLBACK;
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

    const terminal = new BunTerminal({
      cols: options.cols,
      rows: options.rows,
      data(_term: unknown, data: Buffer) {
        options.onData(toBase64(data as Uint8Array));
      },
    });

    const requestedShell = this.isWindows
      ? options.shell || basename(process.env.COMSPEC || 'cmd.exe')
      : options.shell || process.env.SHELL || '/bin/bash';
    const shellToValidate = this.isWindows ? basename(requestedShell) : requestedShell;
    if (!this.allowedShells.has(shellToValidate)) {
      throw new Error(`Shell not allowed: ${requestedShell}`);
    }

    let shell = requestedShell;
    if (this.isWindows) {
      // Windows shells are resolved via PATH; no existsSync check needed
    } else if (!existsSync(shell)) {
      const fallback = this.fallbackOrder.find((s) => this.allowedShells.has(s) && existsSync(s));
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

    this.terminals.set(id, {
      terminal,
      process: proc,
      lastCols: options.cols,
      lastRows: options.rows,
    });

    proc.exited
      .then((code: number) => {
        const entry = this.terminals.get(id);
        if (entry) entry.exited = true;
        this.terminals.delete(id);
        options.onExit?.(code);
      })
      .catch(() => {
        const entry = this.terminals.get(id);
        if (entry) entry.exited = true;
        this.terminals.delete(id);
        options.onExit?.(null);
      });

    return id;
  }

  write(id: string, base64Data: string): void {
    const entry = this.terminals.get(id);
    if (!entry) throw new Error(`Terminal ${id} not found`);
    const decoded = fromBase64(base64Data);
    (entry.terminal as { write: (data: Uint8Array | string) => void }).write(decoded);
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.terminals.get(id);
    if (!entry) throw new Error(`Terminal ${id} not found`);
    const safeCols = Math.floor(cols);
    const safeRows = Math.floor(rows);
    if (!Number.isFinite(safeCols) || safeCols < 1 || !Number.isFinite(safeRows) || safeRows < 1)
      return;
    if (safeCols === entry.lastCols && safeRows === entry.lastRows) return;
    try {
      (entry.terminal as { resize: (cols: number, rows: number) => void }).resize(
        safeCols,
        safeRows,
      );
      entry.lastCols = safeCols;
      entry.lastRows = safeRows;

      // Bun.Terminal.resize() does not send SIGWINCH to the child process.
      // Send it manually so the shell redraws its prompt.
      // Guard against TOCTOU: if the process has already exited (but the
      // microtask to delete the Map entry hasn't run yet), skip SIGWINCH to
      // avoid signalling a recycled PID.
      // On Windows, ConPTY handles resize via terminal.resize() directly.
      if (!this.isWindows) {
        if (entry.exited) return;
        try {
          process.kill(entry.process.pid, 'SIGWINCH');
        } catch {
          // Process may have exited; ignore ESRCH
        }
      }
    } catch (err) {
      console.warn(`resize(${id}, ${safeCols}, ${safeRows}) failed:`, err);
    }
  }

  kill(id: string): void {
    const entry = this.terminals.get(id);
    if (!entry) return;
    (entry.terminal as { close: () => void }).close();
    // Note: On Windows, process.kill sends SIGTERM which Bun maps to TerminateProcess
    entry.process.kill('SIGTERM');
    this.terminals.delete(id);
  }

  has(id: string): boolean {
    return this.terminals.has(id);
  }

  killAll(): void {
    for (const id of this.terminals.keys()) {
      this.kill(id);
    }
  }
}
