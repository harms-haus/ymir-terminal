import { existsSync } from './fs';
import { toBase64, fromBase64 } from '@ymir/shared';

const ALLOWED_SHELLS = new Set([
  '/bin/bash',
  '/bin/zsh',
  '/bin/sh',
  '/usr/bin/bash',
  '/usr/bin/zsh',
  '/usr/bin/sh',
]);

const FALLBACK_ORDER = [
  '/bin/sh',
  '/bin/bash',
  '/usr/bin/bash',
  '/bin/zsh',
  '/usr/bin/zsh',
  '/usr/bin/sh',
] as const;

export interface PTYOptions {
  shell?: string;
  cwd: string;
  cols: number;
  rows: number;
  onData: (data: string) => void; // base64-encoded output
  onExit?: (code: number | null) => void;
}

export class PTYManager {
  terminals = new Map<string, { terminal: unknown; process: unknown }>();

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

    const requestedShell = options.shell || process.env.SHELL || '/bin/bash';
    if (!ALLOWED_SHELLS.has(requestedShell)) {
      throw new Error(`Shell not allowed: ${requestedShell}`);
    }

    let shell = requestedShell;
    if (!existsSync(shell)) {
      const fallback = FALLBACK_ORDER.find((s) => ALLOWED_SHELLS.has(s) && existsSync(s));
      if (!fallback) {
        throw new Error('No supported shell found on this system');
      }
      shell = fallback;
    }

    const bunSpawn = (Bun as Record<string, unknown>).spawn as
      | ((
          cmd: string[],
          opts: { terminal: unknown; cwd: string; env: Record<string, string | undefined> },
        ) => { kill: () => void; exited: Promise<number> })
      | undefined;
    if (!bunSpawn) throw new Error('Bun.spawn is not available');

    let proc: { kill: () => void; exited: Promise<number> };
    try {
      proc = bunSpawn([shell], {
        terminal,
        cwd: options.cwd,
        env: { ...process.env },
      });
    } catch (err) {
      throw new Error(`Failed to spawn shell: ${shell}`, { cause: err });
    }

    this.terminals.set(id, { terminal, process: proc });

    proc.exited
      .then((code: number) => {
        this.terminals.delete(id);
        options.onExit?.(code);
      })
      .catch(() => {
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
    if (!Number.isFinite(safeCols) || safeCols < 1 || !Number.isFinite(safeRows) || safeRows < 1) return;
    try {
      (entry.terminal as { resize: (cols: number, rows: number) => void }).resize(
        safeCols,
        safeRows,
      );
    } catch (err) {
      console.warn(`resize(${id}, ${safeCols}, ${safeRows}) failed:`, err);
    }
  }

  kill(id: string): void {
    const entry = this.terminals.get(id);
    if (!entry) return;
    (entry.terminal as { close: () => void }).close();
    (entry.process as { kill: () => void }).kill();
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
