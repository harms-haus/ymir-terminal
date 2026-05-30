import { Terminal } from './Terminal';
import { useRef } from 'react';

export interface TerminalEntry {
  terminalId: string;
  tabId: string;
  owningPane: 'content' | 'bottom';
  isActive: boolean;
  onTitleChange: (title: string) => void;
  onCwdChange: (cwd: string) => void;
}

export interface PaneBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TerminalManagerProps {
  terminals: TerminalEntry[];
  contentBounds: PaneBounds | null;
  bottomBounds: PaneBounds | null;
  terminalRefs: React.MutableRefObject<Map<string, { focus(): void }>>;
}

export function TerminalManager({
  terminals,
  contentBounds,
  bottomBounds,
  terminalRefs,
}: TerminalManagerProps) {
  // Stable ref callbacks: tabId -> ref callback. Created once per tabId to
  // avoid React tearing down and rebuilding the ref on every render.
  const refCallbackCache = useRef<Map<string, (el: { focus(): void } | null) => void>>(
    new Map(),
  );

  // Clean up stale entries for terminals no longer in the list
  const currentTabIds = new Set(terminals.map((t) => t.tabId));
  for (const [tabId] of refCallbackCache.current) {
    if (!currentTabIds.has(tabId)) {
      terminalRefs.current.delete(tabId);
      refCallbackCache.current.delete(tabId);
    }
  }

  return (
    <div
      data-testid="terminal-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {terminals.map((t) => {
        const bounds = t.owningPane === 'bottom' ? bottomBounds : contentBounds;
        if (!bounds) return null;

        // Get or create a stable ref callback for this tabId
        let refCb = refCallbackCache.current.get(t.tabId);
        if (!refCb) {
          refCb = (el: { focus(): void } | null) => {
            if (el) terminalRefs.current.set(t.tabId, el);
            else terminalRefs.current.delete(t.tabId);
          };
          refCallbackCache.current.set(t.tabId, refCb);
        }

        return (
          <div
            key={t.terminalId}
            style={{
              position: 'absolute',
              top: bounds.top,
              left: bounds.left,
              width: bounds.width,
              height: bounds.height,
              display: t.isActive ? 'block' : 'none',
              pointerEvents: t.isActive ? 'auto' : 'none',
            }}
          >
            <Terminal
              terminalId={t.terminalId}
              ref={refCb}
              onTitleChange={t.onTitleChange}
              onCwdChange={t.onCwdChange}
            />
          </div>
        );
      })}
    </div>
  );
}
