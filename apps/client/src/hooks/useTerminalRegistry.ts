import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { TerminalEntry } from '../components/TerminalManager';
import type { TerminalPanelHandle as ContentPaneHandle } from './useTerminalPanel';
import type { TerminalPanelHandle as BottomPanelHandle } from './useTerminalPanel';

interface TerminalRegistryEntry {
  terminalId: string;
  tabId: string;
  owningPane: 'content' | 'bottom';
  workspaceId: string;
}

interface UseTerminalRegistryParams {
  contentPaneRef: React.RefObject<ContentPaneHandle | null>;
  bottomPanelRef: React.RefObject<BottomPanelHandle | null>;
  activeWorkspaceId: string | null;
}

export function useTerminalRegistry({
  contentPaneRef,
  bottomPanelRef,
  activeWorkspaceId,
}: UseTerminalRegistryParams) {
  // Terminal registry — tracks all live terminals across both panes
  const [terminalRegistry, setTerminalRegistry] = useState<TerminalRegistryEntry[]>([]);
  const terminalRefsMap = useRef<Map<string, { focus(): void }>>(new Map());

  // Track active tab IDs from both panes (synced via callbacks)
  const [contentActiveTabId, setContentActiveTabId] = useState<string | null>(null);
  const [bottomActiveTabId, setBottomActiveTabId] = useState<string | null>(null);

  // Terminal lifecycle callbacks
  const handleTerminalRegistered = useCallback(
    (terminalId: string, tabId: string, pane: 'content' | 'bottom', workspaceId: string) => {
      setTerminalRegistry((prev) => [
        ...prev,
        { terminalId, tabId, owningPane: pane, workspaceId },
      ]);
    },
    [],
  );

  const handleTerminalUnregistered = useCallback((terminalId: string) => {
    setTerminalRegistry((prev) => prev.filter((t) => t.terminalId !== terminalId));
  }, []);

  // Content pane callbacks
  const handleContentTerminalRegistered = useCallback(
    (terminalId: string, tabId: string, workspaceId: string) => {
      handleTerminalRegistered(terminalId, tabId, 'content', workspaceId);
    },
    [handleTerminalRegistered],
  );

  // Bottom panel callbacks
  const handleBottomTerminalRegistered = useCallback(
    (terminalId: string, tabId: string, workspaceId: string) => {
      handleTerminalRegistered(terminalId, tabId, 'bottom', workspaceId);
    },
    [handleTerminalRegistered],
  );

  // Focus content pane's active terminal
  useEffect(() => {
    if (!contentActiveTabId) return;
    const entry = terminalRegistry.find(
      (t) => t.owningPane === 'content' && t.tabId === contentActiveTabId,
    );
    if (entry) {
      const handle = requestAnimationFrame(() => {
        terminalRefsMap.current.get(entry.tabId)?.focus();
      });
      return () => cancelAnimationFrame(handle);
    }
  }, [contentActiveTabId, terminalRegistry]);

  // Focus bottom panel's active terminal
  useEffect(() => {
    if (!bottomActiveTabId) return;
    const entry = terminalRegistry.find(
      (t) => t.owningPane === 'bottom' && t.tabId === bottomActiveTabId,
    );
    if (entry) {
      const handle = requestAnimationFrame(() => {
        terminalRefsMap.current.get(entry.tabId)?.focus();
      });
      return () => cancelAnimationFrame(handle);
    }
  }, [bottomActiveTabId, terminalRegistry]);

  // Stable callback cache: tabId -> {onTitleChange, onCwdChange}
  // useState with lazy init gives a stable mutable Map; closures read pane refs
  // only when invoked (in event handlers), satisfying the react-hooks/refs rule.
  const callbackCacheRef = useRef<
    Map<string, { onTitleChange: (title: string) => void; onCwdChange: (cwd: string) => void }>
  >(new Map());

  // Build terminal entries for TerminalManager
  /* eslint-disable react-hooks/refs, react-hooks/exhaustive-deps -- stable mutable cache and stable refs */
  const terminalEntries: TerminalEntry[] = useMemo(() => {
    const cache = callbackCacheRef.current;
    return terminalRegistry.map((entry) => {
      let cached = cache.get(entry.tabId);
      if (!cached) {
        const paneRef = entry.owningPane === 'content' ? contentPaneRef : bottomPanelRef;
        cached = {
          onTitleChange: (title: string) => {
            paneRef.current?.updateTabTitle(entry.tabId, title);
          },
          onCwdChange: (cwd: string) => {
            paneRef.current?.updateTabCwd(entry.tabId, cwd);
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
          ((entry.owningPane === 'content' && entry.tabId === contentActiveTabId) ||
            (entry.owningPane === 'bottom' && entry.tabId === bottomActiveTabId)),
        onTitleChange: cached.onTitleChange,
        onCwdChange: cached.onCwdChange,
      };
    });
  }, [terminalRegistry, contentActiveTabId, bottomActiveTabId, activeWorkspaceId]);
  /* eslint-enable react-hooks/refs, react-hooks/exhaustive-deps */

  return {
    terminalRegistry,
    setTerminalRegistry,
    terminalRefsMap,
    callbackCacheRef,
    terminalEntries,
    contentActiveTabId,
    setContentActiveTabId,
    bottomActiveTabId,
    setBottomActiveTabId,
    handleTerminalRegistered,
    handleTerminalUnregistered,
    handleContentTerminalRegistered,
    handleBottomTerminalRegistered,
  };
}
