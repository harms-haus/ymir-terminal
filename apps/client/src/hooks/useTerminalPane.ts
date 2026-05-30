import { useRef, useCallback } from 'react';
import { useTabs } from './useTabs';
import type { Tab } from './useTabs';
import { sendRequest } from '../lib/send-request';

export interface UseTerminalPaneOptions {
  dirtyFiles?: Set<string>;
  confirmMultipleText?: string;
  onTerminalUnregistered?: (terminalId: string) => void;
}

export function useTerminalPane(options: UseTerminalPaneOptions = {}) {
  const { dirtyFiles, confirmMultipleText, onTerminalUnregistered } = options;

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
  } = useTabs();

  // Keep refs so imperative handle always sees current state
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // --- Shared handle logic ---

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (dirtyFiles && tab?.filePath && dirtyFiles.has(tab.filePath)) {
        const fileName = tab.filePath.split('/').pop() || tab.filePath;
        if (!window.confirm(`"${fileName}" has unsaved changes. Close without saving?`)) {
          return;
        }
      }
      if (tab?.terminalId) {
        sendRequest('terminal.close', { terminalId: tab.terminalId }).catch(console.error);
        onTerminalUnregistered?.(tab.terminalId);
      }
      closeTab(tabId);
    },
    [tabs, closeTab, dirtyFiles, onTerminalUnregistered],
  );

  const handleCloseRight = useCallback(
    (tabId: string) => {
      const tabIdx = tabs.findIndex((t) => t.id === tabId);
      const tabsToClose = tabs.slice(tabIdx + 1);
      if (dirtyFiles) {
        const dirtyEditorsToClose = tabsToClose.filter(
          (t) => t.filePath && dirtyFiles.has(t.filePath),
        );
        if (dirtyEditorsToClose.length > 0) {
          const names = dirtyEditorsToClose.map((t) => t.filePath!.split('/').pop()).join(', ');
          if (!window.confirm(`"${names}" has unsaved changes. Close without saving?`)) return;
        }
      } else if (confirmMultipleText && tabsToClose.length > 1) {
        if (!window.confirm(confirmMultipleText)) return;
      }
      tabsToClose.forEach((t) => {
        if (t.terminalId) {
          sendRequest('terminal.close', { terminalId: t.terminalId }).catch(console.error);
          onTerminalUnregistered?.(t.terminalId);
        }
      });
      closeTabsRight(tabId);
    },
    [tabs, dirtyFiles, confirmMultipleText, closeTabsRight, onTerminalUnregistered],
  );

  const handleCloseOthers = useCallback(
    (tabId: string) => {
      const tabsToClose = tabs.filter((t) => t.id !== tabId);
      if (dirtyFiles) {
        const dirtyEditorsToClose = tabsToClose.filter(
          (t) => t.filePath && dirtyFiles.has(t.filePath),
        );
        if (dirtyEditorsToClose.length > 0) {
          const names = dirtyEditorsToClose.map((t) => t.filePath!.split('/').pop()).join(', ');
          if (!window.confirm(`"${names}" has unsaved changes. Close without saving?`)) return;
        }
      } else if (confirmMultipleText && tabsToClose.length > 1) {
        if (!window.confirm(confirmMultipleText)) return;
      }
      tabsToClose.forEach((t) => {
        if (t.terminalId) {
          sendRequest('terminal.close', { terminalId: t.terminalId }).catch(console.error);
          onTerminalUnregistered?.(t.terminalId);
        }
      });
      closeOtherTabs(tabId);
    },
    [tabs, dirtyFiles, confirmMultipleText, closeOtherTabs, onTerminalUnregistered],
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
      const data = { terminalId: tab.terminalId, title: tab.title, cwd: tab.cwd, customTitle: tab.customTitle };
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
