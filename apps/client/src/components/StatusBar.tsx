import { useConnectionStatus } from '../hooks/useConnectionStatus';
import {
  COLOR_ACCENT,
  COLOR_ERROR,
  COLOR_STATUS_CONNECTED,
  COLOR_STATUS_DISCONNECTED,
  COLOR_STATUS_RECONNECTING,
  COLOR_TEXT_BRIGHT,
} from '../lib/theme';

interface StatusBarProps {
  activeWorkspaceName?: string;
}

export function StatusBar({ activeWorkspaceName }: StatusBarProps) {
  const { isConnected, isReconnecting } = useConnectionStatus();

  const statusColor = isConnected
    ? COLOR_STATUS_CONNECTED
    : isReconnecting
      ? COLOR_STATUS_RECONNECTING
      : COLOR_STATUS_DISCONNECTED;
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
        background: COLOR_ACCENT,
        color: COLOR_TEXT_BRIGHT,
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
        <span style={{ color: COLOR_ERROR, display: 'flex', alignItems: 'center', gap: '4px' }}>
          ⚠ Reconnecting...
        </span>
      )}
      {activeWorkspaceName && <span>{activeWorkspaceName}</span>}
    </div>
  );
}
