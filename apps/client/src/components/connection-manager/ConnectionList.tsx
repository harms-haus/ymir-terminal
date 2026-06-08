import React from 'react';
import type { ConnectionEntry, RecentConnection } from '../../lib/connection-storage';
import {
  COLOR_CONN_POPOVER_BORDER,
  COLOR_CONN_ITEM_LABEL,
  COLOR_CONN_ITEM_TEXT,
  COLOR_CONN_SECTION_HEADER,
  COLOR_TEXT,
  COLOR_ACCENT,
} from '../../lib/theme';
import { dangerButtonStyle } from '../../lib/dialog-styles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfirmFn = (opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) => Promise<boolean>;

export interface ConnectionListProps {
  favorites: ConnectionEntry[];
  recentConnections: RecentConnection[];
  onConnect: (host: string, port: number) => void;
  onRemoveFavorite: (id: string) => void;
  onClearRecent: () => void;
  confirm: ConfirmFn;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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

const separatorStyle: React.CSSProperties = {
  height: '1px',
  background: COLOR_CONN_POPOVER_BORDER,
  margin: '0',
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

const listContainerStyle: React.CSSProperties = {
  maxHeight: '120px',
  overflowY: 'auto',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '6px',
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

const _saveFavoriteBtnStyle: React.CSSProperties = {
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

const _disconnectBtnStyle: React.CSSProperties = {
  ...dangerButtonStyle,
  padding: '4px 10px',
  fontSize: '12px',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectionList({
  favorites,
  recentConnections,
  onConnect,
  onRemoveFavorite,
  onClearRecent,
  confirm,
}: ConnectionListProps) {
  return (
    <>
      {/* ── Favorites ─────────────────────────────────────────────── */}
      {favorites.length > 0 && (
        <>
          <div style={separatorStyle} />
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>Favorites ({favorites.length})</div>
            <div style={listContainerStyle}>
              {favorites.map((fav: ConnectionEntry) => (
                <div key={fav.id} className="conn-list-item" style={listItemStyle}>
                  <span style={itemLabelStyle}>{fav.label}</span>
                  <span style={{ ...itemDetailStyle, marginLeft: 'auto', marginRight: '4px' }}>
                    {fav.host}:{fav.port}
                  </span>
                  <button
                    data-testid={`fav-connect-${fav.id}`}
                    className="conn-action-btn"
                    onClick={() => onConnect(fav.host, fav.port)}
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
                      onRemoveFavorite(fav.id);
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

      {/* ── Recent ────────────────────────────────────────────────── */}
      {recentConnections.length > 0 && (
        <>
          <div style={separatorStyle} />
          <div style={sectionStyle}>
            <div style={headerRowStyle}>
              <span style={sectionHeaderStyle}>Recent</span>
              <button data-testid="clear-recent-btn" onClick={onClearRecent} style={clearBtnStyle}>
                Clear
              </button>
            </div>
            <div style={listContainerStyle}>
              {recentConnections.map((recent: RecentConnection) => (
                <div key={recent.id} className="conn-list-item" style={listItemStyle}>
                  <span style={{ ...itemDetailStyle, marginLeft: 'auto', marginRight: '4px' }}>
                    {recent.host}:{recent.port}
                  </span>
                  <button
                    data-testid={`recent-connect-${recent.id}`}
                    className="conn-action-btn"
                    onClick={() => onConnect(recent.host, recent.port)}
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
    </>
  );
}
