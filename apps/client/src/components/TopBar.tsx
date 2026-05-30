import { useState, type ReactNode } from 'react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { usePaneVisibility } from '../hooks/usePaneVisibility';
import {
  COLOR_TOPBAR_BG,
  COLOR_TOPBAR_BORDER,
  COLOR_TOPBAR_HOVER_BG,
  COLOR_TOPBAR_ACTIVE_BG,
  COLOR_STATUS_CONNECTED,
  COLOR_STATUS_DISCONNECTED,
  COLOR_STATUS_RECONNECTING,
  COLOR_TEXT,
} from '../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopBarProps {
  commandBar?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopBar({ commandBar }: TopBarProps) {
  const { isConnected, isReconnecting } = useConnectionStatus();
  const { left, right, bottom, toggleLeft, toggleRight, toggleBottom } = usePaneVisibility();

  const [hoverWorkspace, setHoverWorkspace] = useState(false);
  const [hoverTerminal, setHoverTerminal] = useState(false);
  const [hoverExplorer, setHoverExplorer] = useState(false);

  // Connection dot colour & animation
  let dotBackground: string;
  let dotAnimation: string | undefined;

  if (isConnected) {
    dotBackground = COLOR_STATUS_CONNECTED;
    dotAnimation = undefined;
  } else if (isReconnecting) {
    dotBackground = COLOR_STATUS_RECONNECTING;
    dotAnimation = 'topbar-pulse-reconnecting 2s ease-in-out infinite';
  } else {
    dotBackground = COLOR_STATUS_DISCONNECTED;
    dotAnimation = 'topbar-pulse-disconnected 1.5s ease-in-out infinite';
  }

  // Accessible connection state label
  const connectionLabel = isConnected
    ? 'Connected'
    : isReconnecting
      ? 'Reconnecting...'
      : 'Disconnected';

  return (
    <div
      style={{
        height: '38px',
        display: 'flex',
        alignItems: 'center',
        background: COLOR_TOPBAR_BG,
        borderBottom: `1px solid ${COLOR_TOPBAR_BORDER}`,
        padding: '0 12px',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes topbar-pulse-disconnected {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes topbar-pulse-reconnecting {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .topbar-toggle-btn:focus-visible {
          outline: 1px solid var(--accent, #007acc);
          outline-offset: -1px;
        }
      `}</style>

      {/* Left — Connection indicator */}
      <div style={{ flex: '0 0 auto', marginRight: '16px' }}>
        <div
          data-testid="connection-indicator"
          role="status"
          aria-label={connectionLabel}
          title={connectionLabel}
          className="topbar-connection-pulse"
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: dotBackground,
            animation: dotAnimation,
          }}
        />
      </div>

      {/* Center — Command bar slot */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {commandBar}
      </div>

      {/* Right — Toggle buttons */}
      <div style={{ flex: '0 0 auto', display: 'flex', gap: '4px', marginLeft: '16px' }}>
        {/* Workspace (left sidebar) toggle */}
        <button
          className="topbar-toggle-btn"
          data-testid="toggle-workspace-btn"
          aria-label="Toggle workspace pane"
          onClick={toggleLeft}
          onMouseEnter={() => setHoverWorkspace(true)}
          onMouseLeave={() => setHoverWorkspace(false)}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            color: COLOR_TEXT,
            backgroundColor: hoverWorkspace
              ? COLOR_TOPBAR_HOVER_BG
              : left
                ? COLOR_TOPBAR_ACTIVE_BG
                : 'transparent',
            opacity: left ? 1 : 0.5,
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16">
            <rect x="1" y="1" width="7" height="14" fill="currentColor" />
            <rect x="8" y="1" width="7" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>

        {/* Terminal (bottom panel) toggle */}
        <button
          className="topbar-toggle-btn"
          data-testid="toggle-terminal-btn"
          aria-label="Toggle terminal pane"
          onClick={toggleBottom}
          onMouseEnter={() => setHoverTerminal(true)}
          onMouseLeave={() => setHoverTerminal(false)}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            color: COLOR_TEXT,
            backgroundColor: hoverTerminal
              ? COLOR_TOPBAR_HOVER_BG
              : bottom
                ? COLOR_TOPBAR_ACTIVE_BG
                : 'transparent',
            opacity: bottom ? 1 : 0.5,
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16">
            <rect x="1" y="1" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="1" y="8" width="14" height="7" fill="currentColor" />
          </svg>
        </button>

        {/* Explorer (right sidebar) toggle */}
        <button
          className="topbar-toggle-btn"
          data-testid="toggle-explorer-btn"
          aria-label="Toggle explorer pane"
          onClick={toggleRight}
          onMouseEnter={() => setHoverExplorer(true)}
          onMouseLeave={() => setHoverExplorer(false)}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            color: COLOR_TEXT,
            backgroundColor: hoverExplorer
              ? COLOR_TOPBAR_HOVER_BG
              : right
                ? COLOR_TOPBAR_ACTIVE_BG
                : 'transparent',
            opacity: right ? 1 : 0.5,
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16">
            <rect x="1" y="1" width="7" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="8" y="1" width="7" height="14" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
