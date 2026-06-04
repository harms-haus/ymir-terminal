import { useState, useCallback, useMemo } from 'react';
import { useConfirm } from '../hooks/useDialog';
import * as Popover from '@radix-ui/react-popover';
import {
  useConnectionManager,
  type UseConnectionManagerReturn,
} from '../hooks/useConnectionManager';
import type { ConnectionEntry, RecentConnection } from '../lib/connection-storage';
import {
  COLOR_CONN_POPOVER_BG,
  COLOR_CONN_POPOVER_BORDER,
  COLOR_CONN_ITEM_HOVER_BG,
  COLOR_CONN_SECTION_HEADER,
  COLOR_CONN_ITEM_TEXT,
  COLOR_CONN_ITEM_LABEL,
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
import { inputStyle, dangerButtonStyle, buttonRowStyle } from '../lib/dialog-styles';

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

const sectionStyle: React.CSSProperties = {
  marginTop: '12px',
};

const listItemStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'default',
};

const itemLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: COLOR_CONN_ITEM_LABEL,
  fontWeight: 500,
};

const itemDetailStyle: React.CSSProperties = {
  fontSize: '12px',
  color: COLOR_TEXT,
  fontFamily: 'monospace',
};

const itemActionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  border: 'none',
  borderRadius: '4px',
  background: 'transparent',
  color: COLOR_CONN_ITEM_TEXT,
  cursor: 'pointer',
  fontSize: '14px',
  flexShrink: 0,
};

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '6px 8px',
  fontSize: '12px',
};

const portInputStyle: React.CSSProperties = {
  ...smallInputStyle,
  width: '80px',
  flexShrink: 0,
};

const connectBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 12px',
  fontSize: '13px',
  fontWeight: 600,
  background: COLOR_ACCENT,
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  marginTop: '8px',
};

const connectBtnDisabledStyle: React.CSSProperties = {
  ...connectBtnStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
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
  ...dangerButtonStyle,
  padding: '4px 10px',
  fontSize: '12px',
};

const connectLocalBtnStyle: React.CSSProperties = {
  ...connectBtnStyle,
  marginTop: '6px',
  background: 'rgba(255,255,255,0.08)',
  color: COLOR_TEXT,
  border: `1px solid ${COLOR_CONN_POPOVER_BORDER}`,
};

const clearBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: COLOR_CONN_SECTION_HEADER,
  cursor: 'pointer',
  fontSize: '11px',
  marginLeft: 'auto',
  padding: 0,
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '6px',
};

const listContainerStyle: React.CSSProperties = {
  maxHeight: '120px',
  overflowY: 'auto',
};

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
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

  const handleDisconnect = useCallback(() => {
    disconnect();
    setOpen(false);
  }, [disconnect]);

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
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Connect to Server</div>
              <div style={inputRowStyle}>
                <input
                  data-testid="host-input"
                  type="text"
                  placeholder="e.g. 192.168.1.100"
                  aria-label="Host address"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  style={smallInputStyle}
                />
                <input
                  data-testid="port-input"
                  type="number"
                  placeholder="Port"
                  aria-label="Port number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  style={portInputStyle}
                />
              </div>
              <button
                data-testid="connect-btn"
                onClick={handleConnect}
                disabled={!canConnect}
                style={canConnect ? connectBtnStyle : connectBtnDisabledStyle}
              >
                Connect
              </button>

              {isTauri && (
                <button
                  data-testid="connect-local-btn"
                  onClick={handleConnectToLocal}
                  style={connectLocalBtnStyle}
                >
                  Connect to Local Server
                  {localPort && (
                    <span style={{ fontSize: '11px', color: COLOR_TEXT_MUTED, marginLeft: '4px' }}>
                      (port {localPort})
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* ── Favorites ─────────────────────────────────────────── */}
            {favorites.length > 0 && (
              <>
                <div style={separatorStyle} />
                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>Favorites ({favorites.length})</div>
                  <div style={listContainerStyle}>
                    {favorites.map((fav: ConnectionEntry) => (
                      <div key={fav.id} className="conn-list-item" style={listItemStyle}>
                        <span style={itemLabelStyle}>{fav.label}</span>
                        <span
                          style={{ ...itemDetailStyle, marginLeft: 'auto', marginRight: '4px' }}
                        >
                          {fav.host}:{fav.port}
                        </span>
                        <button
                          data-testid={`fav-connect-${fav.id}`}
                          className="conn-action-btn"
                          onClick={() => connect(fav.host, fav.port)}
                          style={itemActionBtnStyle}
                          title={`Connect to ${fav.host}:${fav.port}`}
                        >
                          →
                        </button>
                        <button
                          data-testid={`fav-delete-${fav.id}`}
                          className="conn-action-btn"
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Remove Favorite',
                              message: `Remove "${fav.label || fav.host}" from favorites?`,
                              confirmLabel: 'Remove',
                              danger: true,
                            });
                            if (!ok) return;
                            removeFavorite(fav.id);
                          }}
                          style={itemActionBtnStyle}
                          title="Remove from favorites"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Recent ────────────────────────────────────────────── */}
            {recentConnections.length > 0 && (
              <>
                <div style={separatorStyle} />
                <div style={sectionStyle}>
                  <div style={headerRowStyle}>
                    <span style={sectionHeaderStyle}>Recent</span>
                    <button
                      data-testid="clear-recent-btn"
                      onClick={clearRecent}
                      style={clearBtnStyle}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={listContainerStyle}>
                    {recentConnections.map((recent: RecentConnection) => (
                      <div key={recent.id} className="conn-list-item" style={listItemStyle}>
                        <span
                          style={{ ...itemDetailStyle, marginLeft: 'auto', marginRight: '4px' }}
                        >
                          {recent.host}:{recent.port}
                        </span>
                        <button
                          data-testid={`recent-connect-${recent.id}`}
                          className="conn-action-btn"
                          onClick={() => connect(recent.host, recent.port)}
                          style={itemActionBtnStyle}
                          title={`Connect to ${recent.host}:${recent.port}`}
                        >
                          →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
