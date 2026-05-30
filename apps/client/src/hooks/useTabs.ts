import { useState, useCallback, useRef, useEffect } from 'react';

export interface Tab {
  id: string;
  type: 'terminal' | 'editor';
  title: string;
  terminalId?: string;
  filePath?: string;
  cwd?: string;
  paneLayout?: unknown; // will be defined in Phase 8
  customTitle?: string;
}

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Ref that stays in sync with state via functional updaters
  const tabsRef = useRef<Tab[]>([]);

  // Ref to avoid stale closure reads
  const activeTabIdRef = useRef(activeTabId);

  // Sync refs after render (functional updaters keep them fresh between renders)
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  const createTab = useCallback(
    (opts: {
      type: 'terminal' | 'editor';
      title: string;
      terminalId?: string;
      filePath?: string;
      cwd?: string;
      customTitle?: string;
    }) => {
      const id = crypto.randomUUID();
      const tab: Tab = { id, ...opts };
      setTabs((prev) => {
        const next = [...prev, tab];
        tabsRef.current = next;
        return next;
      });
      setActiveTabId(id);
      return id;
    },
    [],
  );

  const closeTab = useCallback((tabId: string) => {
    const wasActive = activeTabIdRef.current === tabId;
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      tabsRef.current = next;
      if (wasActive) {
        const newActive = next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? null;
        setActiveTabId(newActive);
      }
      return next;
    });
  }, []);

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) => {
      const next = prev.map((t) => (t.id === tabId ? { ...t, title } : t));
      tabsRef.current = next;
      return next;
    });
  }, []);

  const updateTabCwd = useCallback((tabId: string, cwd: string) => {
    setTabs((prev) => {
      const next = prev.map((t) => (t.id === tabId ? { ...t, cwd } : t));
      tabsRef.current = next;
      return next;
    });
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      tabsRef.current = next;
      return next;
    });
  }, []);

  const closeTabsRight = useCallback((tabId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      const kept = prev.slice(0, idx + 1);
      tabsRef.current = kept;
      const closedIds = new Set(prev.slice(idx + 1).map((t) => t.id));
      if (closedIds.has(activeTabIdRef.current as string)) {
        setActiveTabId(tabId);
      }
      return kept;
    });
  }, []);

  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id === tabId);
      tabsRef.current = remaining;
      if (!prev.find((t) => t.id === activeTabIdRef.current) || activeTabIdRef.current !== tabId) {
        setActiveTabId(tabId);
      }
      return remaining;
    });
  }, []);

  const activateTab = useCallback((tabId: string) => setActiveTabId(tabId), []);

  const setDisplayTitle = useCallback((tabId: string, customTitle: string | undefined) => {
    setTabs((prev) => {
      const next = prev.map((t) => {
        if (t.id !== tabId) return t;
        const trimmed = customTitle?.trim();
        // Clear custom title if empty or same as live terminal title
        if (!trimmed || trimmed === t.title) {
          return { ...t, customTitle: undefined };
        }
        return { ...t, customTitle: trimmed };
      });
      tabsRef.current = next;
      return next;
    });
  }, []);

  return {
    tabs,
    activeTabId,
    createTab,
    closeTab,
    activateTab,
    updateTabTitle,
    updateTabCwd,
    reorderTabs,
    closeTabsRight,
    closeOtherTabs,
    setDisplayTitle,
  };
}
