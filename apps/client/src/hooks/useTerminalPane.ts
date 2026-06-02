import { useRef, useCallback, useEffect } from 'react';
import { useTabs } from './useTabs';
import type { TabInfo } from '@ymir/shared';
import { sendRequest } from '../lib/send-request';
import { useConfirm } from './useDialog';

export interface UseTerminalPaneOptions {
  workspaceId?: string | null;
  pane?: 'content' | 'bottom';
  dirtyFiles?: Set<string>;
  confirmMultipleText?: string;
  onTerminalRegistered?: (terminalId: string, tabId: string, workspaceId: string) => void;
  onTerminalUnregistered?: (terminalId: string) => void;
}

export function useTerminalPane(options: UseTerminalPaneOptions = {}) {
  const {
    workspaceId,
    pane = 'content',
    dirtyFiles,
    confirmMultipleText,
    onTerminalRegistered,
    onTerminalUnregistered,
  } = options;

  const confirm = useConfirm();

  // Track which workspaces have already been loaded from server
  const loadedWorkspacesRef = useRef<Set<string>>(new Set());

  // Refs for options to avoid stale closures in callbacks
  const paneRef = useRef(pane);
  const onTerminalRegisteredRef = useRef(onTerminalRegistered);

  useEffect(() => {
    paneRef.current = pane;
  }, [pane]);

  useEffect(() => {
    onTerminalRegisteredRef.current = onTerminalRegistered;
  }, [onTerminalRegistered]);

  const {
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
  } = useTabs({
    onTabChange: (evt) => {
      switch (evt.type) {
        case 'create': {
          const payload: Record<string, unknown> = {
            workspaceId: evt.workspaceId,
            pane: paneRef.current,
            tabType: evt.tabType,
            title: evt.title,
            filePath: evt.filePath,
            terminalId: evt.terminalId,
          };
          if (evt.diffRef !== undefined) payload.diffRef = evt.diffRef;
          if (evt.diffRepoPath !== undefined) payload.diffRepoPath = evt.diffRepoPath;
          if (evt.repoPath !== undefined) payload.repoPath = evt.repoPath;
          if (evt.commitSha !== undefined) payload.commitSha = evt.commitSha;
          if (evt.parentSha !== undefined) payload.parentSha = evt.parentSha;
          sendRequest('tab.create', payload).catch(console.error);
          break;
        }
        case 'close':
          sendRequest('tab.delete', { tabId: evt.tabId }).catch(console.error);
          break;
        case 'reorder':
          sendRequest('tab.reorder', { tabIds: evt.tabIds }).catch(console.error);
          break;
        case 'activate':
          sendRequest('tab.update', { tabId: evt.tabId, active: true }).catch(console.error);
          break;
      }
    },
  });

  // Keep refs so imperative handle always sees current state
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // ---------------------------------------------------------------------------
  // Switch workspace + load tabs from server
  // ---------------------------------------------------------------------------
  useEffect(() => {
    switchWorkspace(workspaceId ?? null);

    if (workspaceId && !loadedWorkspacesRef.current.has(workspaceId)) {
      loadedWorkspacesRef.current.add(workspaceId);
      sendRequest<{ tabs: TabInfo[] }>('tab.list', { workspaceId, pane: paneRef.current })
        .then((response) => {
          // Filter out dead terminals
          const liveTabs = response.tabs.filter((t) => t.terminalAlive !== false);
          loadTabs(workspaceId, liveTabs);

          // Register terminal tabs with parent
          for (const t of liveTabs) {
            if (t.terminalId) {
              onTerminalRegisteredRef.current?.(t.terminalId, t.id, workspaceId);
            }
          }
        })
        .catch(console.error);
    }
  }, [workspaceId, switchWorkspace, loadTabs]);

  // --- Shared handle logic ---

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (dirtyFiles && tab?.filePath && dirtyFiles.has(tab.filePath)) {
        const fileName = tab.filePath.split('/').pop() || tab.filePath;
        const ok = await confirm({
          title: 'Close Tab',
          message: `"${fileName}" has unsaved changes. Close without saving?`,
          confirmLabel: 'Close',
          danger: true,
        });
        if (!ok) return;
        if (!tabsRef.current.find((t) => t.id === tabId)) return;
      }
      if (tab?.terminalId) {
        sendRequest('terminal.close', { terminalId: tab.terminalId }).catch(console.error);
        onTerminalUnregistered?.(tab.terminalId);
      }
      closeTab(tabId);
    },
    [tabs, closeTab, dirtyFiles, onTerminalUnregistered, confirm],
  );

  const handleCloseRight = useCallback(
    async (tabId: string) => {
      const tabIdx = tabs.findIndex((t) => t.id === tabId);
      const tabsToClose = tabs.slice(tabIdx + 1);
      if (dirtyFiles) {
        const dirtyEditorsToClose = tabsToClose.filter(
          (t) => t.filePath && dirtyFiles.has(t.filePath),
        );
        if (dirtyEditorsToClose.length > 0) {
          const names = dirtyEditorsToClose.map((t) => t.filePath!.split('/').pop()).join(', ');
          const ok = await confirm({
            title: 'Close Tabs',
            message: `"${names}" has unsaved changes. Close without saving?`,
            confirmLabel: 'Close',
            danger: true,
          });
          if (!ok) return;
          if (!tabsRef.current.find((t) => t.id === tabId)) return;
        }
      } else if (confirmMultipleText && tabsToClose.length > 1) {
        const ok = await confirm({ title: 'Close Tabs', message: confirmMultipleText });
        if (!ok) return;
        if (!tabsRef.current.find((t) => t.id === tabId)) return;
      }
      tabsToClose.forEach((t) => {
        if (t.terminalId) {
          sendRequest('terminal.close', { terminalId: t.terminalId }).catch(console.error);
          onTerminalUnregistered?.(t.terminalId);
        }
      });
      closeTabsRight(tabId);
    },
    [tabs, dirtyFiles, confirmMultipleText, closeTabsRight, onTerminalUnregistered, confirm],
  );

  const handleCloseOthers = useCallback(
    async (tabId: string) => {
      const tabsToClose = tabs.filter((t) => t.id !== tabId);
      if (dirtyFiles) {
        const dirtyEditorsToClose = tabsToClose.filter(
          (t) => t.filePath && dirtyFiles.has(t.filePath),
        );
        if (dirtyEditorsToClose.length > 0) {
          const names = dirtyEditorsToClose.map((t) => t.filePath!.split('/').pop()).join(', ');
          const ok = await confirm({
            title: 'Close Tabs',
            message: `"${names}" has unsaved changes. Close without saving?`,
            confirmLabel: 'Close',
            danger: true,
          });
          if (!ok) return;
          if (!tabsRef.current.find((t) => t.id === tabId)) return;
        }
      } else if (confirmMultipleText && tabsToClose.length > 1) {
        const ok = await confirm({ title: 'Close Tabs', message: confirmMultipleText });
        if (!ok) return;
        if (!tabsRef.current.find((t) => t.id === tabId)) return;
      }
      tabsToClose.forEach((t) => {
        if (t.terminalId) {
          sendRequest('terminal.close', { terminalId: t.terminalId }).catch(console.error);
          onTerminalUnregistered?.(t.terminalId);
        }
      });
      closeOtherTabs(tabId);
    },
    [tabs, dirtyFiles, confirmMultipleText, closeOtherTabs, onTerminalUnregistered, confirm],
  );

  const handleRenameTab = useCallback(
    (tabId: string, newTitle: string) => {
      setDisplayTitle(tabId, newTitle);
    },
    [setDisplayTitle],
  );

  const handleTitleChange = useCallback(
    (tabId: string, title: string) => {
      updateTabTitle(tabId, title);
    },
    [updateTabTitle],
  );

  const handleCwdChange = useCallback(
    (tabId: string, cwd: string) => {
      updateTabCwd(tabId, cwd);
    },
    [updateTabCwd],
  );

  // --- Imperative handle data ---

  const transferTabOut = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab?.terminalId) return null;
      const data = {
        terminalId: tab.terminalId,
        title: tab.title,
        cwd: tab.cwd,
        customTitle: tab.customTitle,
      };
      closeTab(tabId);
      return data;
    },
    [closeTab],
  );

  const receiveTab = useCallback(
    (terminalId: string, title: string, cwd?: string, customTitle?: string) => {
      const tabId = createTab({ type: 'terminal', title, terminalId, cwd, customTitle });
      return tabId;
    },
    [createTab],
  );

  const getTabs = useCallback(() => tabsRef.current, []);

  const getActiveTabId = useCallback(() => activeTabIdRef.current ?? null, []);

  return {
    // useTabs state
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

    // Refs
    tabsRef,
    activeTabIdRef,

    // Shared handlers
    handleCloseTab,
    handleCloseRight,
    handleCloseOthers,
    handleRenameTab,
    handleTitleChange,
    handleCwdChange,

    // Imperative handle functions
    transferTabOut,
    receiveTab,
    getTabs,
    getActiveTabId,
  };
}
