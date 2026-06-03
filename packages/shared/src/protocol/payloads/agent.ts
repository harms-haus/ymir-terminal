// ---------------------------------------------------------------------------
// Agent-specific protocol types
// ---------------------------------------------------------------------------

/**
 * The operational status of an AI agent process running inside a terminal.
 */
export type AgentStatus = 'working' | 'halted' | 'done';

/**
 * Well-known AI agent identifiers. `string` permits custom/third-party agents.
 */
export type AgentType = 'claude' | 'opencode' | 'pi' | 'aider' | 'codex' | string;

/**
 * Raw OSC-777 escape-sequence event emitted by an agent inside a terminal.
 * See https://github.com/nickolay/agent-proxy/blob/main/protocol.md
 */
export interface OSC777AgentEvent {
  v: number;
  agent: string;
  event: string;
  session_id: string;
  cwd: string;
  project: string;
}

/**
 * Inferred agent status derived from OSC-777 (or other heuristics) for a
 * given terminal. Sent from server → client.
 */
export interface AgentStatusEvent {
  terminalId: string;
  status: AgentStatus;
  agent?: string;
  sessionId?: string;
  cwd?: string;
}

/**
 * Client → server request for the current agent statuses across all terminals
 * in a workspace.
 */
export interface AgentStatusRequest {
  workspaceId: string;
}

/**
 * Server → client response carrying the agent status for every terminal in
 * the requested workspace.
 */
export interface AgentStatusResponse {
  statuses: Array<{
    terminalId: string;
    status: AgentStatus;
    agent?: string;
  }>;
}
