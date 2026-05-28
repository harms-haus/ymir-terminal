import { useState, useEffect } from 'react';
import { wsClient, type ConnectionStatus } from '../lib/ws-client';

export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>(wsClient.getStatus());

  useEffect(() => {
    const unsub = wsClient.onStatusChange((newStatus) => setStatus(newStatus));
    return unsub;
  }, []);

  return {
    status,
    isConnected: status === 'connected',
    isReconnecting: status === 'reconnecting',
  };
}
