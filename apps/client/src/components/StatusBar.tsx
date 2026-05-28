import { useConnectionStatus } from '../hooks/useConnectionStatus';

interface StatusBarProps {
  activeWorkspaceName?: string;
}

export function StatusBar({ activeWorkspaceName }: StatusBarProps) {
  const { isConnected, isReconnecting } = useConnectionStatus();

  const statusColor = isConnected ? '#4caf50' : isReconnecting ? '#ff9800' : '#f44336';
  const statusText = isConnected
    ? 'Connected'
    : isReconnecting
      ? 'Reconnecting...'
      : 'Disconnected';

  return (
    <div
      data-testid="status-bar"
      style={{
        height: '22px',
        background: '#007acc',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        fontSize: '12px',
        gap: '16px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <div
          data-testid="status-indicator"
          style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor }}
        />
        <span>{statusText}</span>
      </div>
      {!isConnected && (
        <span style={{ color: '#e06050', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ⚠ Reconnecting...
        </span>
      )}
      {activeWorkspaceName && <span>{activeWorkspaceName}</span>}
    </div>
  );
}
