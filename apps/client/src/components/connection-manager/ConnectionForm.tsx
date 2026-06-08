import React from 'react';
import { inputStyle } from '../../lib/dialog-styles';
import {
  COLOR_ACCENT,
  COLOR_CONN_POPOVER_BORDER,
  COLOR_CONN_SECTION_HEADER,
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
} from '../../lib/theme';

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

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
};

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '6px 8px',
  fontSize: '12px',
  outline: undefined,
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

const connectLocalBtnStyle: React.CSSProperties = {
  ...connectBtnStyle,
  marginTop: '6px',
  background: 'rgba(255,255,255,0.08)',
  color: COLOR_TEXT,
  border: `1px solid ${COLOR_CONN_POPOVER_BORDER}`,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionFormProps {
  host: string;
  onHostChange: (value: string) => void;
  port: string;
  onPortChange: (value: string) => void;
  canConnect: boolean;
  onConnect: () => void;
  isTauri: boolean;
  onConnectToLocal: () => void;
  localPort: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectionForm({
  host,
  onHostChange,
  port,
  onPortChange,
  canConnect,
  onConnect,
  isTauri,
  onConnectToLocal,
  localPort,
}: ConnectionFormProps) {
  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>Connect to Server</div>
      <div style={inputRowStyle}>
        <input
          data-testid="host-input"
          type="text"
          placeholder="e.g. 192.168.1.100"
          aria-label="Host address"
          value={host}
          onChange={(e) => onHostChange(e.target.value)}
          style={smallInputStyle}
        />
        <input
          data-testid="port-input"
          type="number"
          placeholder="Port"
          aria-label="Port number"
          value={port}
          onChange={(e) => onPortChange(e.target.value)}
          style={portInputStyle}
        />
      </div>
      <button
        data-testid="connect-btn"
        onClick={onConnect}
        disabled={!canConnect}
        style={canConnect ? connectBtnStyle : connectBtnDisabledStyle}
      >
        Connect
      </button>

      {isTauri && (
        <button
          data-testid="connect-local-btn"
          onClick={onConnectToLocal}
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
  );
}
