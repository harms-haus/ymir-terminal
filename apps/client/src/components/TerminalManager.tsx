import { Terminal } from './Terminal';
import { useState, useEffect } from 'react';

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
  // Using useState (lazy init) gives a stable mutable Map that is not a ref,
  // so reading from it during render satisfies react-hooks/refs.
  const [refCallbackCache] = useState<Map<string, (el: { focus(): void } | null) => void>>(
    () => new Map(),
  );

  // Clean up stale entries for terminals no longer in the list
  useEffect(() => {
    const currentTabIds = new Set(terminals.map((t) => t.tabId));
    for (const [tabId] of refCallbackCache) {
      if (!currentTabIds.has(tabId)) {
        terminalRefs.current.delete(tabId);
        refCallbackCache.delete(tabId);
      }
    }
  }, [terminals, terminalRefs, refCallbackCache]);

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
        let refCb = refCallbackCache.get(t.tabId);
        if (!refCb) {
          refCb = (el: { focus(): void } | null) => {
            if (el) terminalRefs.current.set(t.tabId, el);
            else terminalRefs.current.delete(t.tabId);
          };
          refCallbackCache.set(t.tabId, refCb);
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
