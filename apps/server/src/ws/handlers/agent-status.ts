import { watchFile, unwatchFile, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AgentStatusEvent } from '@ymir/shared';

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'idle',
  'working',
  'done',
  'waiting-for-input',
]);

export interface AgentStatusWatchOptions {
  terminalId: string;
  statusFilePath: string;
  onStatus: (event: AgentStatusEvent) => void;
}

export function startAgentStatusWatcher(opts: AgentStatusWatchOptions): () => void {
  let lastStatus: string | undefined;

  watchFile(opts.statusFilePath, { interval: 250 }, async () => {
    try {
      const content = await readFile(opts.statusFilePath, 'utf-8');
      const parsed = JSON.parse(content) as { status: string; timestamp: number };
      if (
        typeof parsed.status !== 'string' ||
        !VALID_STATUSES.has(parsed.status) ||
        parsed.status === lastStatus
      ) {
        return;
      }
      lastStatus = parsed.status;
      opts.onStatus({
        terminalId: opts.terminalId,
        status: parsed.status as AgentStatusEvent['status'],
        timestamp: parsed.timestamp,
      });
    } catch {
      // File might be mid-write, ignore
    }
  });

  return () => {
    unwatchFile(opts.statusFilePath);
    try {
      rmSync(dirname(opts.statusFilePath), { recursive: true });
    } catch {
      /* ignore */
    }
  };
}
