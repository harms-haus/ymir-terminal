import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { TerminalEntry } from '../components/TerminalManager';
import type { TerminalPanelHandle } from './useTerminalPanel';

interface TerminalRegistryEntry {
  terminalId: string;
  tabId: string;
  owningPane: string;
  workspaceId: string;
}

interface UseTerminalRegistryParams {
  paneHandleRefs: React.MutableRefObject<Map<string, TerminalPanelHandle>>;
  bottomPanelRef: React.RefObject<TerminalPanelHandle | null>;
  activeWorkspaceId: string | null;
}

export function useTerminalRegistry({
  paneHandleRefs,
  bottomPanelRef,
  activeWorkspaceId,
}: UseTerminalRegistryParams) {
  // Terminal registry — tracks all live terminals across all panes
  const [terminalRegistry, setTerminalRegistry] = useState<TerminalRegistryEntry[]>([]);
  const terminalRefsMap = useRef<Map<string, { focus(): void }>>(new Map());

  // Track active tab IDs per pane (pane ID -> active tab ID or null)
  const [activeTabByPane, setActiveTabByPane] = useState<Map<string, string | null>>(new Map());

  const setActiveTabForPane = useCallback((paneId: string, tabId: string | null) => {
    setActiveTabByPane((prev) => {
      if (prev.get(paneId) === tabId) return prev;
      const next = new Map(prev);
      next.set(paneId, tabId);
      return next;
    });
  }, []);

  // Terminal lifecycle callbacks
  const handleTerminalRegistered = useCallback(
    (terminalId: string, tabId: string, pane: string, workspaceId: string) => {
      setTerminalRegistry((prev) => [
        ...prev,
        { terminalId, tabId, owningPane: pane, workspaceId },
      ]);
    },
    [],
  );

  const handleTerminalUnregistered = useCallback((terminalId: string) => {
    setTerminalRegistry((prev) => {
      const removed = prev.find((t) => t.terminalId === terminalId);
      if (removed) callbackCacheRef.current.delete(removed.tabId);
      return prev.filter((t) => t.terminalId !== terminalId);
    });
  }, []);

  // Content pane callback (uses 'content' as pane ID for backward compatibility)
  const handleContentTerminalRegistered = useCallback(
    (terminalId: string, tabId: string, workspaceId: string) => {
      handleTerminalRegistered(terminalId, tabId, 'content', workspaceId);
    },
    [handleTerminalRegistered],
  );

  // Bottom panel callback
  const handleBottomTerminalRegistered = useCallback(
    (terminalId: string, tabId: string, workspaceId: string) => {
      handleTerminalRegistered(terminalId, tabId, 'bottom', workspaceId);
    },
    [handleTerminalRegistered],
  );

  // Track previous active tabs per pane to only focus changed panes
  const prevActiveTabRef = useRef<Map<string, string | null>>(new Map());

  // Focus active terminal only for panes whose active tab actually changed
  useEffect(() => {
    const changedPanes: string[] = [];
    for (const [paneId, tabId] of activeTabByPane) {
      if (prevActiveTabRef.current.get(paneId) !== tabId) {
        changedPanes.push(paneId);
      }
    }
    prevActiveTabRef.current = new Map(activeTabByPane);

    const handles: number[] = [];
    for (const paneId of changedPanes) {
      const activeTabId = activeTabByPane.get(paneId);
      if (!activeTabId) continue;
      const entry = terminalRegistry.find(
        (t) => t.owningPane === paneId && t.tabId === activeTabId,
      );
      if (entry) {
        handles.push(
          requestAnimationFrame(() => {
            terminalRefsMap.current.get(entry.tabId)?.focus();
          }),
        );
      }
    }
    return () => {
      for (const h of handles) cancelAnimationFrame(h);
    };
  }, [activeTabByPane, terminalRegistry]);

  // Stable callback cache: tabId -> {onTitleChange, onCwdChange}
  // Mutable Map ref; closures read pane refs only when invoked (in event
  // handlers), satisfying the react-hooks/refs rule.
  const callbackCacheRef = useRef<
    Map<string, { onTitleChange: (title: string) => void; onCwdChange: (cwd: string) => void }>
  >(new Map());

  // Build terminal entries for TerminalManager
  /* eslint-disable react-hooks/refs, react-hooks/exhaustive-deps -- stable mutable cache and stable refs */
  const terminalEntries: TerminalEntry[] = useMemo(() => {
    const cache = callbackCacheRef.current;
    // Deduplicate by terminalId — a terminal should only appear once
    const seen = new Set<string>();
    return terminalRegistry
      .filter((entry) => {
        if (seen.has(entry.terminalId)) return false;
        seen.add(entry.terminalId);
        return true;
      })
      .map((entry) => {
        let cached = cache.get(entry.tabId);
        if (!cached) {
          cached = {
            onTitleChange: (title: string) => {
              const paneHandle =
                entry.owningPane === 'bottom'
                  ? bottomPanelRef.current
                  : paneHandleRefs.current.get(entry.owningPane);
              paneHandle?.updateTabTitle(entry.tabId, title);
            },
            onCwdChange: (cwd: string) => {
              const paneHandle =
                entry.owningPane === 'bottom'
                  ? bottomPanelRef.current
                  : paneHandleRefs.current.get(entry.owningPane);
              paneHandle?.updateTabCwd(entry.tabId, cwd);
            },
          };
          cache.set(entry.tabId, cached);
        }
        return {
          terminalId: entry.terminalId,
          tabId: entry.tabId,
          owningPane: entry.owningPane,
          isActive:
            entry.workspaceId === activeWorkspaceId &&
            entry.tabId === activeTabByPane.get(entry.owningPane),
          onTitleChange: cached.onTitleChange,
          onCwdChange: cached.onCwdChange,
        };
      });
  }, [terminalRegistry, activeTabByPane, activeWorkspaceId]);
  /* eslint-enable react-hooks/refs, react-hooks/exhaustive-deps */

  return {
    terminalRegistry,
    setTerminalRegistry,
    terminalRefsMap,
    callbackCacheRef,
    terminalEntries,
    activeTabByPane,
    setActiveTabForPane,
    handleTerminalRegistered,
    handleTerminalUnregistered,
    handleContentTerminalRegistered,
    handleBottomTerminalRegistered,
  };
}
