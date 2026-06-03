import { useInsertionEffect, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusDotProps {
  /** Agent status: 'working' (blue/pulse), 'halted' (orange/pulse), 'done' (green/static), or null (hidden). */
  status: 'working' | 'halted' | 'done' | null;
  /** Dot diameter in pixels (default 8). */
  size?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  working: '#3b82f6', // blue-500
  halted: '#fb923c', // orange-400
  done: '#4ade80', // green-400
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  working: 'Agent is working',
  halted: 'Agent needs your input',
  done: 'Agent finished',
};

/** Module-level guard to prevent injecting the same @keyframes twice. */
const INJECTED_KEYFRAMES = new Set<string>();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusDot({ status, size = 8 }: StatusDotProps) {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  // ---- Inject @keyframes styles into <head> (runs before layout paint) ----
  useInsertionEffect(() => {
    if (status == null || status === 'done') return;

    const styleId = `agent-pulse-${status}`;

    // Guard against double-injection: check module-level Set + DOM
    if (INJECTED_KEYFRAMES.has(styleId) || document.getElementById(styleId)) {
      return;
    }

    INJECTED_KEYFRAMES.add(styleId);

    const glowColor =
      status === 'working'
        ? 'rgba(59,130,246,0.3)' // blue glow
        : 'rgba(251,146,60,0.3)'; // orange glow

    const styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = `
      @keyframes ${styleId} {
        0%, 100% {
          opacity: 0.4;
          transform: scale(1);
          box-shadow: 0 0 0 0 ${glowColor};
        }
        50% {
          opacity: 1;
          transform: scale(1.2);
          box-shadow: 0 0 6px 2px ${glowColor};
        }
      }
    `;
    document.head.appendChild(styleTag);
  }, [status]);

  // ---- Listen for prefers-reduced-motion changes ----
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handler = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // ---- Null status → invisible placeholder (reserves space) ----
  if (status == null) {
    return (
      <span
        style={{
          width: size ?? 8,
          height: size ?? 8,
          display: 'inline-block',
          flexShrink: 0,
          visibility: 'hidden',
        }}
      />
    );
  }

  const color = STATUS_COLORS[status];

  // ---- Animation style ----
  let animationStyle: React.CSSProperties = {};

  if (status !== 'done') {
    if (reducedMotion) {
      // Dimmed static dot when user prefers reduced motion
      animationStyle = { opacity: 0.6 };
    } else {
      animationStyle = {
        animation: `agent-pulse-${status} 2s ease-in-out infinite`,
      };
    }
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'inline-block',
        flexShrink: 0,
        ...animationStyle,
      }}
      role="img"
      title={STATUS_DESCRIPTIONS[status!]}
      aria-label={`Agent status: ${status}`}
    />
  );
}
