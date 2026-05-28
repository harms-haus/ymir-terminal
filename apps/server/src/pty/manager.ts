import { toBase64, fromBase64 } from "@ymir/shared";

export interface PTYOptions {
  shell?: string;
  cwd: string;
  cols: number;
  rows: number;
  onData: (data: string) => void; // base64-encoded output
}

export class PTYManager {
  private terminals = new Map<string, { terminal: any; process: any }>();

  create(id: string, options: PTYOptions): string {
    const terminal = new (Bun as any).Terminal({
      cols: options.cols,
      rows: options.rows,
      data(_term: any, data: Buffer) {
        options.onData(toBase64(data));
      },
    });

    const shell = options.shell || process.env.SHELL || "/bin/bash";
    const proc = (Bun as any).spawn([shell], {
      terminal,
      cwd: options.cwd,
      env: { ...process.env },
    });

    this.terminals.set(id, { terminal, process: proc });
    return id;
  }

  write(id: string, base64Data: string): void {
    const entry = this.terminals.get(id);
    if (!entry) throw new Error(`Terminal ${id} not found`);
    const decoded = fromBase64(base64Data);
    entry.terminal.write(decoded);
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.terminals.get(id);
    if (!entry) throw new Error(`Terminal ${id} not found`);
    entry.terminal.resize({ cols, rows });
  }

  kill(id: string): void {
    const entry = this.terminals.get(id);
    if (!entry) return;
    entry.terminal.close();
    entry.process.kill();
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

export const ptyManager = new PTYManager();
