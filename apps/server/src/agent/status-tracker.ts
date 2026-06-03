// ---------------------------------------------------------------------------
// Agent status tracker – central authority for per-terminal agent state
// ---------------------------------------------------------------------------

import type { AgentStatus, OSC777AgentEvent } from '@ymir/shared';
import { osc777EventToStatus } from './osc777-parser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * How long (in ms) an OSC-777-derived status is considered "fresh".
 * During this window process-monitor updates are ignored so they cannot
 * override the authoritative source.
 */
const OSC777_FRESHNESS_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The complete tracked state for a single terminal's AI agent.
 */
export interface TerminalAgentState {
  status: AgentStatus;
  agent?: string;
  sessionId?: string;
  cwd?: string;
  source: 'osc777' | 'process-monitor';
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

/**
 * Tracks the inferred status of AI agents running inside terminals.
 *
 * Two data sources feed into the tracker:
 * 1. **OSC-777 escape sequences** – emitted by the agent itself (authoritative).
 * 2. **Process monitor** – heuristic based on whether the agent process is
 *    present and actively using CPU.
 *
 * Process-monitor updates are ignored when a recent (< 30 s) OSC-777 update
 * exists so that the agent's own signalling always takes precedence.
 */
export class AgentStatusTracker {
  private readonly terminals = new Map<string, TerminalAgentState>();
  private readonly listeners = new Set<(terminalId: string, state: TerminalAgentState) => void>();

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Process an OSC-777 agent event for the given terminal.
   *
   * Parses the event payload, looks up or creates internal state, and
   * notifies listeners **only** when the `status` field actually changes.
   *
   * @returns The new status, or `null` if the status did not change.
   */
  updateFromOSC777(terminalId: string, event: OSC777AgentEvent): AgentStatus | null {
    const newStatus = osc777EventToStatus(event.event);
    const now = Date.now();

    // Unknown / uninteresting events are ignored
    if (newStatus === null) {
      return null;
    }

    const existing = this.terminals.get(terminalId);
    if (existing !== undefined && existing.status === newStatus) {
      // Status unchanged – mutate in place to avoid object allocation.
      // Still update cwd/session/agent metadata and refresh lastUpdated
      // to keep the freshness window alive, but do NOT notify listeners.
      existing.agent = event.agent;
      existing.sessionId = event.session_id;
      existing.cwd = event.cwd;
      existing.source = 'osc777';
      existing.lastUpdated = now;
      return null;
    }

    const newState: TerminalAgentState = {
      status: newStatus,
      agent: event.agent,
      sessionId: event.session_id,
      cwd: event.cwd,
      source: 'osc777',
      lastUpdated: now,
    };

    this.terminals.set(terminalId, newState);
    this.notifyListeners(terminalId, newState);
    return newStatus;
  }

  /**
   * Process a heartbeat from the process monitor for the given terminal.
   *
   * **Ignored** when the terminal has a recent (< 30 s) OSC-777 update so
   * that stale process-monitor data cannot override the agent's own status.
   *
   * Heuristic mapping:
   * - present + active  → `'working'`
   * - present + !active → `'halted'`
   * - !present          → `'done'`
   *
   * @returns The new status, or `null` if the status did not change.
   */
  updateFromProcessMonitor(
    terminalId: string,
    present: boolean,
    active: boolean,
    agentName?: string,
  ): AgentStatus | null {
    const now = Date.now();
    const existing = this.terminals.get(terminalId);

    // ---- OSC-777 freshness check ----
    if (
      existing !== undefined &&
      existing.source === 'osc777' &&
      now - existing.lastUpdated < OSC777_FRESHNESS_MS
    ) {
      return null; // Ignore – OSC 777 is still fresh
    }

    // ---- Derive status from process-monitor heuristics ----
    let newStatus: AgentStatus;
    if (!present) {
      newStatus = 'done';
    } else if (active) {
      newStatus = 'working';
    } else {
      newStatus = 'halted';
    }

    // ---- No-change short-circuit ----
    if (existing !== undefined && existing.status === newStatus) {
      return null;
    }

    const newState: TerminalAgentState = {
      status: newStatus,
      agent: agentName,
      source: 'process-monitor',
      lastUpdated: now,
    };

    this.terminals.set(terminalId, newState);
    this.notifyListeners(terminalId, newState);
    return newStatus;
  }

  /**
   * Return the current tracked state for a terminal, or `undefined` if
   * no state has been recorded yet.
   */
  getStatus(terminalId: string): TerminalAgentState | undefined {
    return this.terminals.get(terminalId);
  }

  /**
   * Return a **snapshot** of all tracked terminal states.
   *
   * The returned map is a shallow copy – mutations do not affect the
   * tracker's internal state.
   */
  getAllStatuses(): Map<string, TerminalAgentState> {
    return new Map(this.terminals);
  }

  /**
   * Remove all tracked state for the given terminal.
   */
  clearTerminal(terminalId: string): void {
    this.terminals.delete(terminalId);
  }

  /**
   * Subscribe to status-change notifications.
   *
   * @returns An unsubscribe function that removes the listener.
   */
  onStatusChange(listener: (terminalId: string, state: TerminalAgentState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private notifyListeners(terminalId: string, state: TerminalAgentState): void {
    for (const listener of this.listeners) {
      listener(terminalId, state);
    }
  }
}
