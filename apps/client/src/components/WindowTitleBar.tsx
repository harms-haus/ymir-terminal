import { useState, useEffect, type ReactNode } from 'react';
import { ConnectionManagerPopover } from './ConnectionManagerPopover';
import { WindowControls } from './WindowControls';
import { COLOR_TOPBAR_BG, COLOR_TOPBAR_BORDER, TOP_BAR_HEIGHT, Z_INDEX_TOPBAR } from '../lib/theme';
import { useTauriMaximize } from '../lib/tauri';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WindowTitleBarProps {
  /** Optional centre content (e.g. a label or logo). */
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Minimal window-decoration bar for login and loading screens.
 *
 * Renders the {@link ConnectionManagerPopover} on the left, optional
 * {@link children} in the centre, and {@link WindowControls} on the right.
 *
 * **Requires** {@link ConnectionUrlProvider} and {@link AuthProvider} ancestors.
 */
export function WindowTitleBar({ children }: WindowTitleBarProps) {
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tauriDetected = !!(window as any).__TAURI_INTERNALS__;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTauri(tauriDetected);
  }, []);

  const handleMaximize = useTauriMaximize();

  return (
    <div
      data-testid="window-title-bar"
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
        zIndex: Z_INDEX_TOPBAR,
        userSelect: 'none',
      }}
    >
      {/* Left — Connection manager */}
      <div style={{ flex: '0 0 auto', marginRight: '8px', pointerEvents: 'auto' as const }}>
        <ConnectionManagerPopover />
      </div>

      {/* Centre — children slot */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          pointerEvents: 'auto' as const,
        }}
      >
        {children}
      </div>

      {/* Right — Window controls */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          marginLeft: 'auto',
          pointerEvents: 'auto' as const,
        }}
      >
        {isTauri && <WindowControls />}
      </div>
    </div>
  );
}
