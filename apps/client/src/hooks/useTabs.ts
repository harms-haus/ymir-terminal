import { useState, useCallback } from 'react';

export interface Tab {
  id: string;
  type: 'terminal' | 'editor';
  title: string;
  terminalId?: string;
  filePath?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paneLayout?: any; // will be defined in Phase 8
}

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

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

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) {
          const newActive = next[Math.max(0, idx - 1)]?.id || next[0]?.id || null;
          setActiveTabId(newActive);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const activateTab = useCallback((tabId: string) => setActiveTabId(tabId), []);

  return { tabs, activeTabId, createTab, closeTab, activateTab };
}
