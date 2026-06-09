export type AgentStatus = 'idle' | 'working' | 'done' | 'waiting-for-input';

export interface AgentStatusEvent {
  terminalId: string;
  status: AgentStatus;
  timestamp: number;
}
