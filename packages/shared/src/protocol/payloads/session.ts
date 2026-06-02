export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface ConnectionStatusEvent {
  status: ConnectionStatus;
}
