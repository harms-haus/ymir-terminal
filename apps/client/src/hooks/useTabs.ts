import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { TabInfo } from '@ymir/shared';
import { generateId } from '@ymir/shared';
import { parseScopeKey } from './useWorkspaceSelection';

export interface Tab {
  id: string;
  type: 'terminal' | 'editor' | 'diff' | 'git-tree' | 'agent';
  title: string;
  workspaceId: string;
  terminalId?: string;
  filePath?: string;
  cwd?: string;
  customTitle?: string;
  diffRef?: 'staged' | 'unstaged' | 'commit';
  diffRepoPath?: string;
  repoPath?: string;
  commitSha?: string;
  parentSha?: string;
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
      diffRef?: 'staged' | 'unstaged' | 'commit';
      diffRepoPath?: string;
      repoPath?: string;
      commitSha?: string;
      parentSha?: string;
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
  const [currentScopeKey, setCurrentScopeKey] = useState<string | null>(null);

  // Refs for stale-closure-safe reads inside callbacks
  const currentScopeKeyRef = useRef<string | null>(null);
  const realWorkspaceIdRef = useRef<string | null>(null);
  const tabsRef = useRef<Tab[]>([]);
  const activeTabIdRef = useRef<string | null>(null);

  // Derive public state from current scope
  const currentWsState = currentScopeKey ? workspaceStates.get(currentScopeKey) : undefined;
  const tabs = useMemo(() => currentWsState?.tabs ?? [], [currentWsState]);
  const activeTabId = useMemo(() => currentWsState?.activeTabId ?? null, [currentWsState]);

  // Sync refs after render
  useEffect(() => {
    currentScopeKeyRef.current = currentScopeKey;
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [currentScopeKey, tabs, activeTabId]);

  // ---------------------------------------------------------------------------
  // switchWorkspace — accepts a scopeKey ("workspaceId:worktreePath" or plain "workspaceId")
  // ---------------------------------------------------------------------------
  const switchWorkspace = useCallback((scopeKey: string | null) => {
    if (scopeKey) {
      setWorkspaceStates((prev) => {
        if (prev.has(scopeKey)) return prev;
        const newMap = new Map(prev);
        newMap.set(scopeKey, { tabs: [], activeTabId: null });
        return newMap;
      });
    }
    currentScopeKeyRef.current = scopeKey;
    realWorkspaceIdRef.current = scopeKey ? parseScopeKey(scopeKey).workspaceId : null;
    setCurrentScopeKey(scopeKey);
  }, []);

  // ---------------------------------------------------------------------------
  // loadTabs — scopeKey is the Map key; workspaceId on each Tab is the real ID
  // ---------------------------------------------------------------------------
  const loadTabs = useCallback((scopeKey: string, serverTabs: TabInfo[]) => {
    const { workspaceId: realWorkspaceId } = parseScopeKey(scopeKey);
    const sorted = [...serverTabs].sort((a, b) => a.sortOrder - b.sortOrder);
    const mappedTabs: Tab[] = sorted.map((st) => ({
      id: st.id,
      type: st.tabType,
      title: st.title ?? '',
      workspaceId: realWorkspaceId,
      terminalId: st.terminalId ?? undefined,
      filePath: st.filePath ?? undefined,
      diffRef: st.diffRef ?? undefined,
      diffRepoPath: st.repoPath ?? undefined,
      repoPath: st.repoPath ?? undefined,
      commitSha: st.commitSha ?? undefined,
      parentSha: st.parentSha ?? undefined,
    }));
    const activeTab = sorted.find((st) => st.active);
    const newActiveTabId = activeTab?.id ?? mappedTabs[0]?.id ?? null;

    setWorkspaceStates((prev) => {
      const newMap = new Map(prev);
      newMap.set(scopeKey, { tabs: mappedTabs, activeTabId: newActiveTabId });
      return newMap;
    });

    // Sync refs immediately if this is the current workspace
    if (currentScopeKeyRef.current === scopeKey) {
      tabsRef.current = mappedTabs;
      activeTabIdRef.current = newActiveTabId;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // createTab — Map keyed by scopeKey, Tab.workspaceId is the real workspace ID
  // ---------------------------------------------------------------------------
  const createTab = useCallback(
    (opts: {
      type: 'terminal' | 'editor' | 'diff' | 'git-tree' | 'agent';
      title: string;
      terminalId?: string;
      filePath?: string;
      cwd?: string;
      customTitle?: string;
      diffRef?: 'staged' | 'unstaged' | 'commit';
      diffRepoPath?: string;
      repoPath?: string;
      commitSha?: string;
      parentSha?: string;
    }) => {
      const scopeKey = currentScopeKeyRef.current;
      if (!scopeKey) return '';
      const { workspaceId: realWorkspaceId } = parseScopeKey(scopeKey);
      const id = generateId();
      const tab: Tab = { id, workspaceId: realWorkspaceId, ...opts };
      setWorkspaceStates((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(scopeKey) ?? { tabs: [], activeTabId: null };
        const newTabs = [...existing.tabs, tab];
        newMap.set(scopeKey, { tabs: newTabs, activeTabId: id });
        tabsRef.current = newTabs;
        activeTabIdRef.current = id;
        return newMap;
      });
      onTabChangeRef.current?.({
        type: 'create',
        tabId: id,
        workspaceId: realWorkspaceId,
        tabType: opts.type,
        title: opts.title,
        filePath: opts.filePath,
        terminalId: opts.terminalId,
        diffRef: opts.diffRef,
        diffRepoPath: opts.diffRepoPath,
        repoPath: opts.repoPath,
        commitSha: opts.commitSha,
        parentSha: opts.parentSha,
      });
      return id;
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // closeTab
  // ---------------------------------------------------------------------------
  const closeTab = useCallback((tabId: string) => {
    const scopeKey = currentScopeKeyRef.current;
    if (!scopeKey) return;
    const wasActive = activeTabIdRef.current === tabId;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(scopeKey);
      if (!wsState) return prev;
      const idx = wsState.tabs.findIndex((t) => t.id === tabId);
      const newTabs = wsState.tabs.filter((t) => t.id !== tabId);
      let newActiveId = wsState.activeTabId;
      if (wasActive) {
        newActiveId = newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0]?.id ?? null;
      }
      const newMap = new Map(prev);
      newMap.set(scopeKey, { tabs: newTabs, activeTabId: newActiveId });
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
    const scopeKey = currentScopeKeyRef.current;
    if (!scopeKey) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(scopeKey);
      if (!wsState) return prev;
      const newTabs = wsState.tabs.map((t) => (t.id === tabId ? { ...t, title } : t));
      const newMap = new Map(prev);
      newMap.set(scopeKey, { ...wsState, tabs: newTabs });
      tabsRef.current = newTabs;
      return newMap;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // updateTabCwd
  // ---------------------------------------------------------------------------
  const updateTabCwd = useCallback((tabId: string, cwd: string) => {
    const scopeKey = currentScopeKeyRef.current;
    if (!scopeKey) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(scopeKey);
      if (!wsState) return prev;
      const newTabs = wsState.tabs.map((t) => (t.id === tabId ? { ...t, cwd } : t));
      const newMap = new Map(prev);
      newMap.set(scopeKey, { ...wsState, tabs: newTabs });
      tabsRef.current = newTabs;
      return newMap;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // reorderTabs
  // ---------------------------------------------------------------------------
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    const scopeKey = currentScopeKeyRef.current;
    if (!scopeKey) return;
    const realWorkspaceId = realWorkspaceIdRef.current;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(scopeKey);
      if (!wsState) return prev;
      const next = [...wsState.tabs];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const newMap = new Map(prev);
      newMap.set(scopeKey, { ...wsState, tabs: next });
      tabsRef.current = next;
      return newMap;
    });
    // Fire reorder event with the new order — read from ref after updater runs
    onTabChangeRef.current?.({
      type: 'reorder',
      workspaceId: realWorkspaceId ?? '',
      tabIds: tabsRef.current.map((t) => t.id),
    });
  }, []);

  // ---------------------------------------------------------------------------
  // closeTabsRight
  // ---------------------------------------------------------------------------
  const closeTabsRight = useCallback((tabId: string) => {
    const scopeKey = currentScopeKeyRef.current;
    if (!scopeKey) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(scopeKey);
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
      newMap.set(scopeKey, { tabs: kept, activeTabId: newActiveId });
      tabsRef.current = kept;
      activeTabIdRef.current = newActiveId;
      return newMap;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // closeOtherTabs
  // ---------------------------------------------------------------------------
  const closeOtherTabs = useCallback((tabId: string) => {
    const scopeKey = currentScopeKeyRef.current;
    if (!scopeKey) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(scopeKey);
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
      newMap.set(scopeKey, { tabs: remaining, activeTabId: newActiveId });
      tabsRef.current = remaining;
      activeTabIdRef.current = newActiveId;
      return newMap;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // activateTab
  // ---------------------------------------------------------------------------
  const activateTab = useCallback((tabId: string) => {
    const scopeKey = currentScopeKeyRef.current;
    if (!scopeKey) return;
    const realWorkspaceId = realWorkspaceIdRef.current;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(scopeKey);
      if (!wsState) return prev;
      const newMap = new Map(prev);
      newMap.set(scopeKey, { ...wsState, activeTabId: tabId });
      activeTabIdRef.current = tabId;
      return newMap;
    });
    onTabChangeRef.current?.({ type: 'activate', tabId, workspaceId: realWorkspaceId ?? '' });
  }, []);

  // ---------------------------------------------------------------------------
  // setDisplayTitle
  // ---------------------------------------------------------------------------
  const setDisplayTitle = useCallback((tabId: string, customTitle: string | undefined) => {
    const scopeKey = currentScopeKeyRef.current;
    if (!scopeKey) return;
    setWorkspaceStates((prev) => {
      const wsState = prev.get(scopeKey);
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
      newMap.set(scopeKey, { ...wsState, tabs: newTabs });
      tabsRef.current = newTabs;
      return newMap;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // cleanupScope — remove a scope key's entry from the Map to prevent unbounded
  // growth when worktrees or workspaces are deleted.
  // ---------------------------------------------------------------------------
  const cleanupScope = useCallback((scopeKey: string) => {
    setWorkspaceStates((prev) => {
      if (!prev.has(scopeKey)) return prev;
      const newMap = new Map(prev);
      newMap.delete(scopeKey);
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
    cleanupScope,
  };
}
