import { useState, useCallback, useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  useConnectionManager,
  type UseConnectionManagerReturn,
} from '../hooks/useConnectionManager';
import {
  COLOR_CONN_POPOVER_BG,
  COLOR_CONN_POPOVER_BORDER,
  COLOR_CONN_ITEM_HOVER_BG,
  COLOR_CONN_SECTION_HEADER,
  CONN_POPOVER_MIN_WIDTH,
  CONN_POPOVER_MAX_HEIGHT,
  CONN_TRIGGER_MAX_WIDTH,
  COLOR_STATUS_CONNECTED,
  COLOR_STATUS_DISCONNECTED,
  COLOR_STATUS_RECONNECTING,
  COLOR_ACCENT,
  COLOR_TEXT_MUTED,
  COLOR_TEXT,
} from '../lib/theme';
import { buttonRowStyle } from '../lib/dialog-styles';
import { useConfirm } from '../hooks/useDialog';
import { ConnectionForm, ConnectionList } from './connection-manager';

// Re-export sub-components so consumers can import from this file
export { ConnectionForm, ConnectionList } from './connection-manager';
export type { ConnectionFormProps, ConnectionListProps, ConfirmFn } from './connection-manager';

// ---------------------------------------------------------------------------
// Shared CSS for hover effects on list items
// ---------------------------------------------------------------------------

const HOVER_CSS = `
  .conn-list-item:hover {
    background: ${COLOR_CONN_ITEM_HOVER_BG};
  }
  .conn-action-btn:hover {
    opacity: 1;
  }
  [data-testid="connection-manager-trigger"]:focus-visible {
    outline: 1px solid #007acc;
    outline-offset: 1px;
  }
  [data-testid="connection-manager-popover"] button:focus-visible,
  [data-testid="connection-manager-popover"] input:focus-visible {
    outline: 1px solid #007acc;
    outline-offset: 1px;
  }
`;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const triggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  background: 'transparent',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  padding: '2px 6px',
  maxWidth: `${CONN_TRIGGER_MAX_WIDTH}px`,
  overflow: 'hidden',
};

const popoverContentStyle: React.CSSProperties = {
  minWidth: `${CONN_POPOVER_MIN_WIDTH}px`,
  maxHeight: `${CONN_POPOVER_MAX_HEIGHT}px`,
  background: COLOR_CONN_POPOVER_BG,
  border: `1px solid ${COLOR_CONN_POPOVER_BORDER}`,
  borderRadius: '8px',
  padding: '12px',
  zIndex: 1000,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0',
  overflowY: 'auto',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  color: COLOR_CONN_SECTION_HEADER,
  letterSpacing: '0.5px',
  marginBottom: '6px',
};

const itemDetailStyle: React.CSSProperties = {
  fontSize: '12px',
  color: COLOR_TEXT,
  fontFamily: 'monospace',
};

const separatorStyle: React.CSSProperties = {
  height: '1px',
  background: COLOR_CONN_POPOVER_BORDER,
  margin: '0',
  marginTop: '12px',
};

const statusDotStyle = (color: string): React.CSSProperties => ({
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
});

const smallStatusDotStyle = (color: string): React.CSSProperties => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
});

const statusTextStyle: React.CSSProperties = {
  fontSize: '13px',
  color: COLOR_TEXT,
};

const mutedTextStyle: React.CSSProperties = {
  fontSize: '13px',
  color: COLOR_TEXT_MUTED,
};

const hostPortTextStyle: React.CSSProperties = {
  fontSize: '11px',
  color: COLOR_TEXT_MUTED,
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const saveFavoriteBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '12px',
  fontWeight: 500,
  background: 'transparent',
  color: COLOR_ACCENT,
  border: `1px solid ${COLOR_ACCENT}`,
  borderRadius: '4px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const disconnectBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '12px',
  fontWeight: 600,
  backgroundColor: '#d32f2f',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDotColor(status: UseConnectionManagerReturn['status']): string {
  switch (status) {
    case 'connected':
      return COLOR_STATUS_CONNECTED;
    case 'reconnecting':
      return COLOR_STATUS_RECONNECTING;
    case 'connecting':
      return COLOR_ACCENT;
    default:
      return COLOR_STATUS_DISCONNECTED;
  }
}

function getStatusLabel(status: UseConnectionManagerReturn['status']): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'reconnecting':
      return 'Reconnecting...';
    case 'connecting':
      return 'Connecting...';
    default:
      return 'Disconnected';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectionManagerPopover() {
  const {
    currentHost,
    currentPort,
    status,
    favorites,
    recentConnections,
    addFavorite,
    removeFavorite,
    clearRecent,
    connect,
    disconnect,
    connectToLocal,
    isTauri,
    localPort,
  } = useConnectionManager();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);

  // Connect form state
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3000');

  const handleConnect = useCallback(() => {
    const portNum = parseInt(port, 10);
    if (!host || isNaN(portNum) || portNum <= 0) return;
    connect(host, portNum);
    setOpen(false);
    setHost('');
    setPort('3000');
  }, [host, port, connect]);

  const handleDisconnect = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Disconnect',
      message: 'Active terminal sessions will be lost. Continue?',
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!confirmed) return;
    disconnect();
    setOpen(false);
  }, [confirm, disconnect]);

  const handleSaveFavorite = useCallback(() => {
    if (currentHost && currentPort) {
      addFavorite(`${currentHost}:${currentPort}`, currentHost, currentPort);
    }
  }, [addFavorite, currentHost, currentPort]);

  const handleConnectToLocal = useCallback(() => {
    connectToLocal();
    setOpen(false);
  }, [connectToLocal]);

  const isActive = status !== 'disconnected';
  const canConnect = host.trim().length > 0 && status !== 'connecting';
  const alreadyFavorite = useMemo(() => {
    if (!isActive || !currentHost || !currentPort) return false;
    return favorites.some((f) => f.host === currentHost && f.port === currentPort);
  }, [isActive, currentHost, currentPort, favorites]);

  // Trigger aria-label
  let ariaLabel: string;
  if (isActive && currentHost && currentPort) {
    ariaLabel = `${getStatusLabel(status)} to ${currentHost}:${currentPort}. Click to manage.`;
  } else {
    ariaLabel = 'Disconnected. Click to connect.';
  }

  return (
    <>
      <style>{HOVER_CSS}</style>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            data-testid="connection-manager-trigger"
            aria-label={ariaLabel}
            style={triggerStyle}
          >
            <span style={statusDotStyle(getDotColor(status))} />
            {isActive && currentHost && currentPort ? (
              <span style={hostPortTextStyle}>
                {currentHost}:{currentPort}
              </span>
            ) : (
              <span style={mutedTextStyle}>Disconnected</span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            data-testid="connection-manager-popover"
            side="bottom"
            align="start"
            sideOffset={4}
            style={popoverContentStyle}
          >
            {/* ── Current Connection ────────────────────────────────── */}
            <div>
              <div style={sectionHeaderStyle}>Current Connection</div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}
              >
                <span style={smallStatusDotStyle(getDotColor(status))} />
                <span style={statusTextStyle}>{getStatusLabel(status)}</span>
                {isActive && currentHost && currentPort && (
                  <span style={{ ...itemDetailStyle, marginLeft: 'auto' }}>
                    {currentHost}:{currentPort}
                  </span>
                )}
              </div>
              <div style={buttonRowStyle}>
                {isActive && !alreadyFavorite && (
                  <button
                    data-testid="save-favorite-btn"
                    onClick={handleSaveFavorite}
                    style={saveFavoriteBtnStyle}
                  >
                    ★ Save as Favorite
                  </button>
                )}
                {isActive && (
                  <button
                    data-testid="disconnect-btn"
                    onClick={handleDisconnect}
                    style={disconnectBtnStyle}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            {/* ── Separator ─────────────────────────────────────────── */}
            <div style={separatorStyle} />

            {/* ── Connect to Server ─────────────────────────────────── */}
            <ConnectionForm
              host={host}
              onHostChange={setHost}
              port={port}
              onPortChange={setPort}
              canConnect={canConnect}
              onConnect={handleConnect}
              isTauri={isTauri}
              onConnectToLocal={handleConnectToLocal}
              localPort={localPort}
            />

            {/* ── Saved & Recent Connections ─────────────────────────── */}
            <ConnectionList
              favorites={favorites}
              recentConnections={recentConnections}
              onConnect={connect}
              onRemoveFavorite={removeFavorite}
              onClearRecent={clearRecent}
              confirm={confirm}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
