import { useState, useCallback, useRef, useEffect } from 'react';

export interface Tab {
  id: string;
  type: 'terminal' | 'editor';
  title: string;
  terminalId?: string;
  filePath?: string;
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

  const activateTab = useCallback((tabId: string) => setActiveTabId(tabId), []);

  return { tabs, activeTabId, createTab, closeTab, activateTab };
}
