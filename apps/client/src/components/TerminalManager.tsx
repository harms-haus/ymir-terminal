import React, { useState, useEffect } from 'react';
import { Terminal } from './Terminal';

export interface TerminalEntry {
  terminalId: string;
  tabId: string;
  owningPane: string;
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
  getPaneBounds: (paneId: string) => PaneBounds | null;
  terminalRefs: React.MutableRefObject<Map<string, { focus(): void }>>;
  /** Bounds version — when this changes, triggers a re-render to re-read getPaneBounds */
  boundsVersion?: unknown;
  /** Called when the user clicks on a terminal area — notifies which pane was clicked */
  onFocusPane?: (paneId: string) => void;
}

export const TerminalManager = React.memo(function TerminalManager({
  terminals,
  getPaneBounds,
  terminalRefs,
  // boundsVersion is not used directly — it forces re-renders when bounds update
  boundsVersion: _boundsVersion,
  onFocusPane,
}: TerminalManagerProps) {
  // Stable ref callbacks: tabId -> ref callback. Created once per tabId to
  // avoid React tearing down and rebuilding the ref on every render.
  // Using useState (lazy init) gives a stable mutable Map that is not a ref,
  // so reading from it during render satisfies react-hooks/refs.
  const [refCallbackCache] = useState<Map<string, (el: { focus(): void } | null) => void>>(
    () => new Map(),
  );

  // Last-known bounds per pane: preserved when getPaneBounds temporarily returns null
  // so terminals keep their previous dimensions instead of collapsing to 0×0.
  const [lastBoundsMap] = useState<Map<string, PaneBounds>>(() => new Map());

  // Clean up stale entries for terminals no longer in the list
  useEffect(() => {
    const currentTabIds = new Set(terminals.map((t) => t.tabId));
    for (const [tabId] of refCallbackCache) {
      if (!currentTabIds.has(tabId)) {
        terminalRefs.current.delete(tabId);
        refCallbackCache.delete(tabId);
      }
    }

    const currentPaneIds = new Set(terminals.map((t) => t.owningPane));
    for (const [paneId] of lastBoundsMap) {
      if (!currentPaneIds.has(paneId)) {
        lastBoundsMap.delete(paneId);
      }
    }
  }, [terminals, terminalRefs, refCallbackCache, lastBoundsMap]);

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
        const bounds = getPaneBounds(t.owningPane);
        const effectiveBounds = bounds ?? lastBoundsMap.get(t.owningPane) ?? null;

        // Intentional render-time mutation: we cache the latest bounds during render
        // to avoid a one-frame flicker that useEffect would introduce. This is safe
        // because Map.set is idempotent under Strict Mode's double-render.
        if (bounds) {
          lastBoundsMap.set(t.owningPane, bounds);
        }

        // Get or create a stable ref callback for this tabId — must be
        // initialized before any early-return branch that uses it.
        let refCb = refCallbackCache.get(t.tabId);
        if (!refCb) {
          refCb = (el: { focus(): void } | null) => {
            if (el) terminalRefs.current.set(t.tabId, el);
            else terminalRefs.current.delete(t.tabId);
          };
          refCallbackCache.set(t.tabId, refCb);
        }

        const wrapperStyle: React.CSSProperties = effectiveBounds
          ? {
              position: 'absolute',
              top: effectiveBounds.top,
              left: effectiveBounds.left,
              width: effectiveBounds.width,
              height: effectiveBounds.height,
              visibility: t.isActive ? 'visible' : 'hidden',
              pointerEvents: t.isActive ? 'auto' : 'none',
            }
          : {
              position: 'absolute',
              width: 0,
              height: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            };

        return (
          <div
            key={t.terminalId}
            style={wrapperStyle}
            onMouseDown={() => onFocusPane?.(t.owningPane)}
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
});
