// ---------------------------------------------------------------------------
// Process monitor – detects AI agent processes running as descendants of
// terminal shells
// ---------------------------------------------------------------------------

import { readFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AGENT_PATTERNS: Array<{ comm: RegExp; args?: RegExp }> = [
  { comm: /^claude$/ },
  { comm: /^opencode$/ },
  { comm: /^pi$/ },
  { comm: /^aider$/ },
  { comm: /^codex$/ },
  { comm: /^(node|bun)$/, args: /claude|opencode|pi-coding-agent|aider|codex/ },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessEntry {
  pid: number;
  ppid: number;
  comm: string;
  args: string;
}

// ---------------------------------------------------------------------------
// Process snapshot
// ---------------------------------------------------------------------------

/**
 * Run `ps` and parse the output into a map of PID → ProcessEntry.
 *
 * A single shared call is used for efficiency across all tracked terminals.
 */
export async function getProcessSnapshot(): Promise<Map<number, ProcessEntry>> {
  const proc = Bun.spawn(['ps', '-eo', 'pid=,ppid=,comm=,args='], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;

  const map = new Map<number, ProcessEntry>();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Parse: "  PID  PPID COMM ARGS"
    const parts = trimmed.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (parts) {
      const pid = parseInt(parts[1], 10);
      const ppid = parseInt(parts[2], 10);
      const comm = parts[3];
      const args = parts[4];
      map.set(pid, { pid, ppid, comm, args });
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Tree traversal
// ---------------------------------------------------------------------------

/**
 * BFS from `rootPid` through `childrenOf`, collecting all processes whose
 * `ppid` matches any discovered process.
 *
 * @param childrenOf – Pre-built parent→children index (avoids rebuilding it
 *   for every tracked terminal in the same poll cycle).
 */
export function getDescendants(
  rootPid: number,
  childrenOf: Map<number, ProcessEntry[]>,
): ProcessEntry[] {
  // BFS with index-based queue (no Array.shift())
  const result: ProcessEntry[] = [];
  const queue = [rootPid];
  const visited = new Set<number>();
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    if (visited.has(current)) continue;
    visited.add(current);

    const children = childrenOf.get(current);
    if (children) {
      for (const child of children) {
        if (!visited.has(child.pid)) {
          result.push(child);
          queue.push(child.pid);
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Agent detection
// ---------------------------------------------------------------------------

/**
 * Check a ProcessEntry against AGENT_PATTERNS.
 *
 * Returns the matched agent name (e.g. `'claude'`, `'opencode'`) or `null`
 * if the process is not a recognised AI agent.
 */
export function isAgent(entry: ProcessEntry): string | null {
  for (const pattern of AGENT_PATTERNS) {
    if (pattern.comm.test(entry.comm)) {
      if (!pattern.args) {
        return entry.comm;
      }
      const argsMatch = entry.args.match(pattern.args);
      if (argsMatch) {
        return argsMatch[0];
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// ProcessMonitor
// ---------------------------------------------------------------------------

/**
 * Polls the process table for each tracked terminal to detect AI agent
 * processes running as descendants of the terminal's shell.
 *
 * Uses CPU-time deltas from /proc/[pid]/stat to distinguish active from
 * idle agents. Falls back to assuming active when /proc is not available
 * (e.g. macOS, containers without procfs).
 */
export class ProcessMonitor {
  private trackedTerminals: Map<string, number> = new Map();
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private onAgentStatusChange: (
    terminalId: string,
    agentPresent: boolean,
    agentActive: boolean,
    agentName?: string,
  ) => void;
  private prevCpuTimes: Map<number, number> = new Map();
  private pollIntervalMs: number;

  constructor(
    callback: (
      terminalId: string,
      agentPresent: boolean,
      agentActive: boolean,
      agentName?: string,
    ) => void,
    pollIntervalMs: number = 2000,
  ) {
    this.onAgentStatusChange = callback;
    this.pollIntervalMs = pollIntervalMs;
  }

  // -----------------------------------------------------------------------
  // Terminal tracking
  // -----------------------------------------------------------------------

  /** Start tracking a terminal by its shell PID. */
  trackTerminal(terminalId: string, shellPid: number): void {
    this.trackedTerminals.set(terminalId, shellPid);
  }

  /** Stop tracking a terminal. */
  untrackTerminal(terminalId: string): void {
    this.trackedTerminals.delete(terminalId);
  }

  // -----------------------------------------------------------------------
  // Polling lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the polling loop. No-op if already started.
   *
   * Uses recursive setTimeout to ensure the next poll only starts after the
   * current one completes, avoiding concurrent poll() invocations.
   */
  start(): void {
    if (this.intervalId !== null) return;
    this.pollLoop();
  }

  /** Stop the polling loop and clear all tracked state. */
  stop(): void {
    if (this.intervalId !== null) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    this.trackedTerminals.clear();
    this.prevCpuTimes.clear();
  }

  /**
   * Schedule the next poll cycle. Only called from start() / pollLoop().
   */
  private pollLoop(): void {
    this.intervalId = setTimeout(async () => {
      try {
        await this.poll();
      } catch (err) {
        console.error('ProcessMonitor poll error:', err);
      }
      if (this.intervalId !== null) {
        this.pollLoop();
      }
    }, this.pollIntervalMs);
  }

  // -----------------------------------------------------------------------
  // Poll cycle
  // -----------------------------------------------------------------------

  /**
   * Single poll cycle – public for testing.
   *
   * 1. Takes a process snapshot.
   * 2. Builds a parent→children index once.
   * 3. For each tracked terminal, BFS from its shell PID to find descendant
   *    processes.
   * 4. Checks each descendant against AGENT_PATTERNS.
   * 5. If an agent is found, reads /proc/[pid]/stat to determine CPU
   *    activity and calls the callback with presence + activity flags.
   * 6. If no agent is found, calls the callback with present=false.
   */
  async poll(): Promise<void> {
    const snapshot = await getProcessSnapshot();

    // Prune stale CPU time entries for PIDs that no longer exist
    for (const pid of this.prevCpuTimes.keys()) {
      if (!snapshot.has(pid)) this.prevCpuTimes.delete(pid);
    }

    // Build parent→children index once (O(N)), shared across all terminals
    const childrenOf = new Map<number, ProcessEntry[]>();
    for (const entry of snapshot.values()) {
      const siblings = childrenOf.get(entry.ppid);
      if (siblings) siblings.push(entry);
      else childrenOf.set(entry.ppid, [entry]);
    }

    for (const [terminalId, shellPid] of this.trackedTerminals) {
      const descendants = getDescendants(shellPid, childrenOf);
      let agentFound: { name: string; pid: number } | null = null;

      for (const entry of descendants) {
        const agentName = isAgent(entry);
        if (agentName !== null) {
          agentFound = { name: agentName, pid: entry.pid };
          break;
        }
      }

      if (agentFound) {
        let active = true; // fallback when /proc is unavailable
        try {
          const statContent = await readFile(`/proc/${agentFound.pid}/stat`, 'utf8');
          const fields = statContent.split(' ');
          const utime = parseInt(fields[13], 10) || 0; // field 14 (0-indexed 13)
          const stime = parseInt(fields[14], 10) || 0; // field 15 (0-indexed 14)
          const totalJiffies = utime + stime;
          const prevJiffies = this.prevCpuTimes.get(agentFound.pid) ?? totalJiffies;
          this.prevCpuTimes.set(agentFound.pid, totalJiffies);
          active = totalJiffies > prevJiffies;
        } catch {
          // /proc not available – assume active
          active = true;
        }

        this.onAgentStatusChange(terminalId, true, active, agentFound.name);
      } else {
        this.onAgentStatusChange(terminalId, false, false, undefined);
      }
    }
  }
}
