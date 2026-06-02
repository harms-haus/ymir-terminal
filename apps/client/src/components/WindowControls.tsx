import { useState, useCallback } from 'react';
import {
  COLOR_TOPBAR_BORDER,
  COLOR_TEXT,
  COLOR_WINDOW_CLOSE_HOVER,
  COLOR_WINDOW_CLOSE_HOVER_ICON,
  COLOR_WINDOW_CTRL_HOVER,
  COLOR_WINDOW_CTRL_ICON,
  TOP_BAR_HEIGHT,
  WINDOW_CTRL_WIDTH,
  WINDOW_CTRL_ICON_SIZE,
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
    return tauriAppWindow;
  } catch {
    tauriAppWindow = false;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WindowControls() {
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

  return (
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
          <rect
            x="2.5"
            y="2.5"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
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
  );
}
