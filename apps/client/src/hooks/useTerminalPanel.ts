import { useImperativeHandle } from 'react';
import type { Tab } from './useTabs';
import type { PersistedTabInfo } from '@ymir/shared';

/**
 * Shared imperative handle type exposed by both ContentPane and BottomPanel.
 */
export interface TerminalPanelHandle {
  transferTabOut: (
    tabId: string,
  ) => { terminalId: string; title: string; cwd?: string; customTitle?: string } | null;
  receiveTab: (terminalId: string, title: string, cwd?: string, customTitle?: string) => string;
  loadRestoredTabs: (workspaceId: string, tabs: PersistedTabInfo[]) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  getTabs: () => Tab[];
  getActiveTabId: () => string | null;
  updateTabTitle: (tabId: string, title: string) => void;
  updateTabCwd: (tabId: string, cwd: string) => void;
}

/**
 * Wires up `useImperativeHandle` with the common set of terminal-panel
 * methods returned by `useTerminalPane`. Keeps ContentPane and BottomPanel
 * in sync without duplicating the handle shape.
 */
export function useTerminalPanelHandle(
  ref: React.Ref<TerminalPanelHandle>,
  methods: TerminalPanelHandle,
) {
  const {
    transferTabOut,
    receiveTab,
    loadRestoredTabs,
    reorderTabs,
    getTabs,
    getActiveTabId,
    updateTabTitle,
    updateTabCwd,
  } = methods;
  useImperativeHandle(
    ref,
    () => ({
      transferTabOut,
      receiveTab,
      loadRestoredTabs,
      reorderTabs,
      getTabs,
      getActiveTabId,
      updateTabTitle,
      updateTabCwd,
    }),
    [
      transferTabOut,
      receiveTab,
      loadRestoredTabs,
      reorderTabs,
      getTabs,
      getActiveTabId,
      updateTabTitle,
      updateTabCwd,
    ],
  );
}
