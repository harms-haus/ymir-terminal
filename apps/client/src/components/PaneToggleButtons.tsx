import { useState } from 'react';
import {
  COLOR_TEXT,
  COLOR_TOPBAR_HOVER_BG,
  COLOR_TOPBAR_ACTIVE_BG,
} from '../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaneToggleButtonsProps {
  left: boolean;
  right: boolean;
  bottom: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleBottom: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaneToggleButtons({
  left,
  right,
  bottom,
  toggleLeft,
  toggleRight,
  toggleBottom,
}: PaneToggleButtonsProps) {
  const [hoverWorkspace, setHoverWorkspace] = useState(false);
  const [hoverTerminal, setHoverTerminal] = useState(false);
  const [hoverExplorer, setHoverExplorer] = useState(false);

  return (
    <>
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
    </>
  );
}
