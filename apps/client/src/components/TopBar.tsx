import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
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
  TOP_BAR_HEIGHT,
  WINDOW_CTRL_WIDTH,
  WINDOW_CTRL_ICON_SIZE,
  COLOR_WINDOW_CLOSE_HOVER,
  COLOR_WINDOW_CLOSE_HOVER_ICON,
  COLOR_WINDOW_CTRL_HOVER,
  COLOR_WINDOW_CTRL_ICON,
} from '../lib/theme';

// Tauri window controls (lazy-loaded to avoid errors in browser)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tauriAppWindow: any = null;
async function getTauriWindow() {
  if (tauriAppWindow !== null) return tauriAppWindow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(window as any).__TAURI_INTERNALS__) {
    tauriAppWindow = false;
    return false;
  }
  try {
    const mod = await import('@tauri-apps/api/window');
    tauriAppWindow = mod.getCurrentWindow();
    // Cache the PhysicalPosition constructor for drag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TauriPhysicalPosition = mod.PhysicalPosition;
    return tauriAppWindow;
  } catch {
    tauriAppWindow = false;
    return false;
  }
}

/**
 * Client-side window dragging for Linux/Wayland where Tauri's native
 * start_dragging doesn't work (WebKitGTK can't relay pointer grabs to GDK).
 * Tracks mouse movement and repositions the window via the Tauri API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dragState: { startX: number; startY: number; winX: number; winY: number; window: any; PhysicalPosition: any } | null = null;

function startClientDrag(e: React.MouseEvent, appWindow: unknown) {
  if (!appWindow) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = appWindow as any;
  e.preventDefault();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PhysicalPos = (window as any).__TauriPhysicalPosition;
  dragState = {
    startX: e.screenX,
    startY: e.screenY,
    winX: 0,
    winY: 0,
    window: w,
    PhysicalPosition: PhysicalPos,
  };
  // Get initial window position
  w.outerPosition().then((pos: { x: number; y: number }) => {
    if (dragState) {
      dragState.winX = pos.x;
      dragState.winY = pos.y;
    }
  });
}

function onDragMove(e: React.MouseEvent) {
  if (!dragState) return;
  const dx = e.screenX - dragState.startX;
  const dy = e.screenY - dragState.startY;
  const PP = dragState.PhysicalPosition;
  if (PP) {
    dragState.window.setPosition(new PP(dragState.winX + dx, dragState.winY + dy));
  }
}

function stopClientDrag() {
  dragState = null;
}

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appWindowRef = useRef<any>(null);

  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- window is unavailable during SSR */
    const tauriDetected = !!(window as any).__TAURI_INTERNALS__;
    setIsTauri(tauriDetected);
    if (tauriDetected) {
      getTauriWindow().then((w) => {
        appWindowRef.current = w;
      });
    }
  }, []);
  const [hoverMinimize, setHoverMinimize] = useState(false);
  const [hoverMaximize, setHoverMaximize] = useState(false);
  const [hoverClose, setHoverClose] = useState(false);

  const handleMinimize = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTauriWindow().then((w: any) => w?.minimize());
  }, []);
  const handleMaximize = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTauriWindow().then((w: any) => w?.toggleMaximize());
  }, []);
  const handleClose = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTauriWindow().then((w: any) => w?.close());
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

      {/* Right — Toggle buttons */}
      <div style={{ flex: '0 0 auto', display: 'flex', gap: '4px', marginLeft: '16px', pointerEvents: 'auto' as const }}>
        {/* Workspace (left sidebar) toggle */}
        <button
          className="topbar-toggle-btn"
          data-testid="toggle-workspace-btn"
          aria-label="Toggle workspace pane"
          onClick={toggleLeft}
          onMouseEnter={() => setHoverWorkspace(true)}
          onMouseLeave={() => setHoverWorkspace(false)}
          style={{
            width: '20px',
            height: '20px',
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
            pointerEvents: 'auto' as const,
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16">
            <rect x="1" y="1" width="7" height="14" fill="currentColor" />
            <rect
              x="8.5"
              y="1.5"
              width="6"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
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
            width: '20px',
            height: '20px',
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
            pointerEvents: 'auto' as const,
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16">
            <rect
              x="1.5"
              y="1.5"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
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
            width: '20px',
            height: '20px',
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
            pointerEvents: 'auto' as const,
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16">
            <rect
              x="1.5"
              y="1.5"
              width="6"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
            <rect x="8" y="1" width="7" height="14" fill="currentColor" />
          </svg>
        </button>

        {/* Tauri window controls */}
        {isTauri && (
          <>
            {/* Separator */}
            <div
              style={{
                width: '1px',
                height: '16px',
                background: COLOR_TOPBAR_BORDER,
                marginLeft: '8px',
                marginRight: '8px',
                alignSelf: 'center',
              }}
            />

            {/* Minimize */}
            <button
              className="topbar-toggle-btn"
              data-testid="window-minimize-btn"
              aria-label="Minimize window"
              onClick={handleMinimize}
              onMouseEnter={() => setHoverMinimize(true)}
              onMouseLeave={() => setHoverMinimize(false)}
              style={{
                width: `${WINDOW_CTRL_WIDTH}px`,
                height: `${TOP_BAR_HEIGHT}px`,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                backgroundColor: hoverMinimize ? COLOR_WINDOW_CTRL_HOVER : 'transparent',
                color: hoverMinimize ? COLOR_TEXT : COLOR_WINDOW_CTRL_ICON,
              }}
            >
              <svg viewBox="0 0 16 16" width={WINDOW_CTRL_ICON_SIZE} height={WINDOW_CTRL_ICON_SIZE}>
                <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>

            {/* Maximize */}
            <button
              className="topbar-toggle-btn"
              data-testid="window-maximize-btn"
              aria-label="Maximize window"
              onClick={handleMaximize}
              onMouseEnter={() => setHoverMaximize(true)}
              onMouseLeave={() => setHoverMaximize(false)}
              style={{
                width: `${WINDOW_CTRL_WIDTH}px`,
                height: `${TOP_BAR_HEIGHT}px`,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                backgroundColor: hoverMaximize ? COLOR_WINDOW_CTRL_HOVER : 'transparent',
                color: hoverMaximize ? COLOR_TEXT : COLOR_WINDOW_CTRL_ICON,
              }}
            >
              <svg viewBox="0 0 16 16" width={WINDOW_CTRL_ICON_SIZE} height={WINDOW_CTRL_ICON_SIZE}>
                <rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>

            {/* Close */}
            <button
              className="topbar-toggle-btn"
              data-testid="window-close-btn"
              aria-label="Close window"
              onClick={handleClose}
              onMouseEnter={() => setHoverClose(true)}
              onMouseLeave={() => setHoverClose(false)}
              style={{
                width: `${WINDOW_CTRL_WIDTH}px`,
                height: `${TOP_BAR_HEIGHT}px`,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                backgroundColor: hoverClose ? COLOR_WINDOW_CLOSE_HOVER : 'transparent',
                color: hoverClose ? COLOR_WINDOW_CLOSE_HOVER_ICON : COLOR_WINDOW_CTRL_ICON,
                marginRight: '-12px',
              }}
            >
              <svg viewBox="0 0 16 16" width={WINDOW_CTRL_ICON_SIZE} height={WINDOW_CTRL_ICON_SIZE}>
                <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" />
                <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
