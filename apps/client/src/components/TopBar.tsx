import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { usePaneVisibility } from '../hooks/usePaneVisibility';
import { ConnectionManagerPopover } from './ConnectionManagerPopover';
import { PaneToggleButtons } from './PaneToggleButtons';
import { WindowControls } from './WindowControls';
import { COLOR_TOPBAR_BG, COLOR_TOPBAR_BORDER, TOP_BAR_HEIGHT, Z_INDEX_TOPBAR } from '../lib/theme';

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
  const { left, right, bottom, toggleLeft, toggleRight, toggleBottom } = usePaneVisibility();

  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tauriDetected = !!(window as any).__TAURI_INTERNALS__;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTauri(tauriDetected);
  }, []);

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
        zIndex: Z_INDEX_TOPBAR,
        userSelect: 'none',
      }}
    >
      <style>{`
        .topbar-toggle-btn:focus-visible {
          outline: 1px solid var(--accent, #007acc);
          outline-offset: -1px;
        }
      `}</style>

      {/* Left — Connection manager */}
      <div style={{ flex: '0 0 auto', marginRight: '8px', pointerEvents: 'auto' as const }}>
        <ConnectionManagerPopover />
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
