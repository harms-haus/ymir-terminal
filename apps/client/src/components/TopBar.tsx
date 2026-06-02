import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { usePaneVisibility } from '../hooks/usePaneVisibility';
import { PaneToggleButtons } from './PaneToggleButtons';
import { WindowControls } from './WindowControls';
import {
  COLOR_TOPBAR_BG,
  COLOR_TOPBAR_BORDER,
  COLOR_STATUS_CONNECTED,
  COLOR_STATUS_DISCONNECTED,
  COLOR_STATUS_RECONNECTING,
  TOP_BAR_HEIGHT,
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

  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tauriDetected = !!(window as any).__TAURI_INTERNALS__;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTauri(tauriDetected);
  }, []);

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

  const handleMaximize = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (window as any).__TAURI_INTERNALS__;
    if (w) {
      import('@tauri-apps/api/window').then((mod) => mod.getCurrentWindow().toggleMaximize());
    }
  }, []);

  return (
    <div
      data-tauri-drag-region="deep"
      onDoubleClick={handleMaximize}
      style={{
        height: `${TOP_BAR_HEIGHT}px`,
        display: 'flex',
        alignItems: 'center',
        background: COLOR_TOPBAR_BG,
        borderBottom: `1px solid ${COLOR_TOPBAR_BORDER}`,
        padding: '0 12px',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
        userSelect: 'none',
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
      <div style={{ flex: '0 0 auto', marginRight: '16px', pointerEvents: 'auto' as const }}>
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
          pointerEvents: 'auto' as const,
        }}
      >
        {commandBar}
      </div>

      {/* Right — Toggle buttons & window controls */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          gap: '4px',
          marginLeft: '16px',
          pointerEvents: 'auto' as const,
        }}
      >
        <PaneToggleButtons
          left={left}
          right={right}
          bottom={bottom}
          toggleLeft={toggleLeft}
          toggleRight={toggleRight}
          toggleBottom={toggleBottom}
        />

        {isTauri && <WindowControls />}
      </div>
    </div>
  );
}
