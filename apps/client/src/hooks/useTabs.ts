import { useState, useCallback, useRef, useEffect } from 'react';

export interface Tab {
  id: string;
  type: 'terminal' | 'editor';
  title: string;
  terminalId?: string;
  filePath?: string;
  cwd?: string;
  paneLayout?: unknown; // will be defined in Phase 8
}

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Ref to avoid stale closure reads in closeTab
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const createTab = useCallback(
    (opts: {
      type: 'terminal' | 'editor';
      title: string;
      terminalId?: string;
      filePath?: string;
    }) => {
      const id = crypto.randomUUID();
      const tab: Tab = { id, ...opts };
      setTabs((prev) => [...prev, tab]);
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
      if (wasActive) {
        const newActive = next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? null;
        setActiveTabId(newActive);
      }
      return next;
    });
  }, []);

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title } : t)));
  }, []);

  const updateTabCwd = useCallback((tabId: string, cwd: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, cwd } : t)));
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const closeTabsRight = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev;
        const kept = prev.slice(0, idx + 1);
        const closedIds = new Set(prev.slice(idx + 1).map((t) => t.id));
        if (closedIds.has(activeTabIdRef.current as string)) {
          setActiveTabId(tabId);
        }
        return kept;
      });
    },
    [],
  );

  const closeOtherTabs = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id === tabId);
        if (!prev.find((t) => t.id === activeTabIdRef.current) || activeTabIdRef.current !== tabId) {
          setActiveTabId(tabId);
        }
        return remaining;
      });
    },
    [],
  );

  const activateTab = useCallback((tabId: string) => setActiveTabId(tabId), []);

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
  };
}
