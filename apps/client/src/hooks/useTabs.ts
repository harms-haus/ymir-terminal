import { useState, useCallback, useRef, useEffect } from 'react';

export interface Tab {
  id: string;
  type: 'terminal' | 'editor';
  title: string;
  workspaceId: string;
  terminalId?: string;
  filePath?: string;
  cwd?: string;
  paneLayout?: unknown; // will be defined in Phase 8
  customTitle?: string;
}

export interface ServerTabInfo {
  id: string;
  tabType: 'terminal' | 'editor';
  title: string | null;
  filePath: string | null;
  terminalId: string | null;
  active: boolean;
  sortOrder: number;
  terminalAlive?: boolean;
}

export type TabChangeEvent =
  | {
      type: 'create';
      tabId: string;
      workspaceId: string;
      tabType: string;
      title: string;
      filePath?: string;
      terminalId?: string;
    }
  | { type: 'close'; tabId: string }
  | { type: 'reorder'; workspaceId: string; tabIds: string[] }
  | { type: 'activate'; tabId: string; workspaceId: string };

interface WorkspaceTabState {
  tabs: Tab[];
  activeTabId: string | null;
}

export function useTabs(opts?: { onTabChange?: (event: TabChangeEvent) => void }) {
  const onTabChangeRef = useRef(opts?.onTabChange);
  useEffect(() => {
    onTabChangeRef.current = opts?.onTabChange;
  });

  const [workspaceStates, setWorkspaceStates] = useState<Map<string, WorkspaceTabState>>(new Map());
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);

  // Refs for stale-closure-safe reads inside callbacks
  const currentWorkspaceIdRef = useRef<string | null>(null);
  const tabsRef = useRef<Tab[]>([]);
  const activeTabIdRef = useRef<string | null>(null);

  // Derive public state from current workspace
  const currentWsState = currentWorkspaceId ? workspaceStates.get(currentWorkspaceId) : undefined;
  const tabs = currentWsState?.tabs ?? [];
  const activeTabId = currentWsState?.activeTabId ?? null;

  // Sync refs after render
  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspaceId;
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [currentWorkspaceId, tabs, activeTabId]);

  // ---------------------------------------------------------------------------
  // switchWorkspace
  // ---------------------------------------------------------------------------
  const switchWorkspace = useCallback((workspaceId: string | null) => {
    if (workspaceId) {
      setWorkspaceStates((prev) => {
        if (prev.has(workspaceId)) return prev;
        const newMap = new Map(prev);
        newMap.set(workspaceId, { tabs: [], activeTabId: null });
        return newMap;
      });
    }
    currentWorkspaceIdRef.current = workspaceId;
    setCurrentWorkspaceId(workspaceId);
  }, []);

  // ---------------------------------------------------------------------------
  // loadTabs
  // ---------------------------------------------------------------------------
  const loadTabs = useCallback((workspaceId: string, serverTabs: ServerTabInfo[]) => {
    const sorted = [...serverTabs].sort((a, b) => a.sortOrder - b.sortOrder);
    const mappedTabs: Tab[] = sorted.map((st) => ({
      id: st.id,
      type: st.tabType,
      title: st.title ?? '',
      workspaceId,
      terminalId: st.terminalId ?? undefined,
      filePath: st.filePath ?? undefined,
    }));
    const activeTab = sorted.find((st) => st.active);
    const newActiveTabId = activeTab?.id ?? mappedTabs[0]?.id ?? null;

    setWorkspaceStates((prev) => {
      const newMap = new Map(prev);
      newMap.set(workspaceId, { tabs: mappedTabs, activeTabId: newActiveTabId });
      return newMap;
    });

    // Sync refs immediately if this is the current workspace
    if (currentWorkspaceIdRef.current === workspaceId) {
      tabsRef.current = mappedTabs;
      activeTabIdRef.current = newActiveTabId;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // createTab
  // ---------------------------------------------------------------------------
  const createTab = useCallback(
    (opts: {
      type: 'terminal' | 'editor';
      title: string;
      terminalId?: string;
      filePath?: string;
      cwd?: string;
      customTitle?: string;
    }) => {
      const wsId = currentWorkspaceIdRef.current;
      if (!wsId) return '';
      const id = crypto.randomUUID();
      const tab: Tab = { id, workspaceId: wsId, ...opts };
      setWorkspaceStates((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(wsId) ?? { tabs: [], activeTabId: null };
        const newTabs = [...existing.tabs, tab];
        newMap.set(wsId, { tabs: newTabs, activeTabId: id });
        tabsRef.current = newTabs;
        activeTabIdRef.current = id;
        return newMap;
      });
      onTabChangeRef.current?.({
        type: 'create',
        tabId: id,
        workspaceId: wsId,
        tabType: opts.type,
        title: opts.title,
        filePath: opts.filePath,
        terminalId: opts.terminalId,
      });
      return id;
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // closeTab
  // ---------------------------------------------------------------------------
  const closeTab = useCallback((tabId: string) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    const wasActive = activeTabIdRef.current === tabId;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(wsId);
      if (!wsState) return prev;
      const idx = wsState.tabs.findIndex((t) => t.id === tabId);
      const newTabs = wsState.tabs.filter((t) => t.id !== tabId);
      let newActiveId = wsState.activeTabId;
      if (wasActive) {
        newActiveId = newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0]?.id ?? null;
      }
      const newMap = new Map(prev);
      newMap.set(wsId, { tabs: newTabs, activeTabId: newActiveId });
      tabsRef.current = newTabs;
      activeTabIdRef.current = newActiveId;
      return newMap;
    });
    onTabChangeRef.current?.({ type: 'close', tabId });
  }, []);

  // ---------------------------------------------------------------------------
  // updateTabTitle
  // ---------------------------------------------------------------------------
  const updateTabTitle = useCallback((tabId: string, title: string) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(wsId);
      if (!wsState) return prev;
      const newTabs = wsState.tabs.map((t) => (t.id === tabId ? { ...t, title } : t));
      const newMap = new Map(prev);
      newMap.set(wsId, { ...wsState, tabs: newTabs });
      tabsRef.current = newTabs;
      return newMap;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // updateTabCwd
  // ---------------------------------------------------------------------------
  const updateTabCwd = useCallback((tabId: string, cwd: string) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(wsId);
      if (!wsState) return prev;
      const newTabs = wsState.tabs.map((t) => (t.id === tabId ? { ...t, cwd } : t));
      const newMap = new Map(prev);
      newMap.set(wsId, { ...wsState, tabs: newTabs });
      tabsRef.current = newTabs;
      return newMap;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // reorderTabs
  // ---------------------------------------------------------------------------
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(wsId);
      if (!wsState) return prev;
      const next = [...wsState.tabs];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const newMap = new Map(prev);
      newMap.set(wsId, { ...wsState, tabs: next });
      tabsRef.current = next;
      return newMap;
    });
    // Fire reorder event with the new order — read from ref after updater runs
    onTabChangeRef.current?.({
      type: 'reorder',
      workspaceId: wsId,
      tabIds: tabsRef.current.map((t) => t.id),
    });
  }, []);

  // ---------------------------------------------------------------------------
  // closeTabsRight
  // ---------------------------------------------------------------------------
  const closeTabsRight = useCallback((tabId: string) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(wsId);
      if (!wsState) return prev;
      const idx = wsState.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      const kept = wsState.tabs.slice(0, idx + 1);
      let newActiveId = wsState.activeTabId;
      const closedIds = new Set(wsState.tabs.slice(idx + 1).map((t) => t.id));
      if (closedIds.has(wsState.activeTabId as string)) {
        newActiveId = tabId;
      }
      const newMap = new Map(prev);
      newMap.set(wsId, { tabs: kept, activeTabId: newActiveId });
      tabsRef.current = kept;
      activeTabIdRef.current = newActiveId;
      return newMap;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // closeOtherTabs
  // ---------------------------------------------------------------------------
  const closeOtherTabs = useCallback((tabId: string) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(wsId);
      if (!wsState) return prev;
      const remaining = wsState.tabs.filter((t) => t.id === tabId);
      let newActiveId = wsState.activeTabId;
      if (
        !wsState.tabs.find((t) => t.id === wsState.activeTabId) ||
        wsState.activeTabId !== tabId
      ) {
        newActiveId = tabId;
      }
      const newMap = new Map(prev);
      newMap.set(wsId, { tabs: remaining, activeTabId: newActiveId });
      tabsRef.current = remaining;
      activeTabIdRef.current = newActiveId;
      return newMap;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // activateTab
  // ---------------------------------------------------------------------------
  const activateTab = useCallback((tabId: string) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(wsId);
      if (!wsState) return prev;
      const newMap = new Map(prev);
      newMap.set(wsId, { ...wsState, activeTabId: tabId });
      activeTabIdRef.current = tabId;
      return newMap;
    });
    onTabChangeRef.current?.({ type: 'activate', tabId, workspaceId: wsId });
  }, []);

  // ---------------------------------------------------------------------------
  // setDisplayTitle
  // ---------------------------------------------------------------------------
  const setDisplayTitle = useCallback((tabId: string, customTitle: string | undefined) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(wsId);
      if (!wsState) return prev;
      const newTabs = wsState.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const trimmed = customTitle?.trim();
        // Clear custom title if empty or same as live terminal title
        if (!trimmed || trimmed === t.title) {
          return { ...t, customTitle: undefined };
        }
        return { ...t, customTitle: trimmed };
      });
      const newMap = new Map(prev);
      newMap.set(wsId, { ...wsState, tabs: newTabs });
      tabsRef.current = newTabs;
      return newMap;
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
    switchWorkspace,
    loadTabs,
  };
}
