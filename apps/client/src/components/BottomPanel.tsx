import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTabs } from '../hooks/useTabs';
import type { Tab } from '../hooks/useTabs';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { TabBar } from './TabBar';
import { sendRequest } from '../lib/send-request';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';

export interface BottomPanelHandle {
  transferTabOut: (tabId: string) => { terminalId: string; title: string; cwd?: string; customTitle?: string } | null;
  receiveTab: (terminalId: string, title: string, cwd?: string, customTitle?: string) => string;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  getTabs: () => Tab[];
  getActiveTabId: () => string | null;
  updateTabTitle: (tabId: string, title: string) => void;
  updateTabCwd: (tabId: string, cwd: string) => void;
}

export interface BottomPanelProps {
  workspaceId: string | null;
  terminalContainerRef?: React.Ref<HTMLDivElement>;
  onTerminalRegistered?: (terminalId: string, tabId: string) => void;
  onTerminalUnregistered?: (terminalId: string) => void;
  onActiveTabChange?: (activeTabId: string | null) => void;
}

export const BottomPanel = forwardRef<BottomPanelHandle, BottomPanelProps>(
function BottomPanel({ workspaceId, terminalContainerRef, onTerminalRegistered, onTerminalUnregistered, onActiveTabChange }: BottomPanelProps, ref) {
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

  // Keep a ref to tabs so imperative handle always sees current state
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const handleTerminalCreated = useCallback(
    (terminalId: string, tabId: string) => {
      onTerminalRegistered?.(terminalId, tabId);
    },
    [onTerminalRegistered],
  );

  const handleAddTerminal = useCreateTerminalTab(workspaceId, tabs, createTab, handleTerminalCreated);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.terminalId) {
        sendRequest('terminal.close', { terminalId: tab.terminalId }).catch(console.error);
        onTerminalUnregistered?.(tab.terminalId);
      }
      closeTab(tabId);
    },
    [tabs, closeTab, onTerminalUnregistered],
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

  const handleCloseRight = useCallback(
    (tabId: string) => {
      const tabIdx = tabs.findIndex((t) => t.id === tabId);
      const tabsToClose = tabs.slice(tabIdx + 1);
      if (tabsToClose.length > 1) {
        if (!window.confirm(`Close ${tabsToClose.length} terminals? Running processes will be terminated.`)) return;
      }
      tabsToClose.forEach((t) => {
        if (t.terminalId) {
          sendRequest('terminal.close', { terminalId: t.terminalId }).catch(console.error);
          onTerminalUnregistered?.(t.terminalId);
        }
      });
      closeTabsRight(tabId);
    },
    [tabs, closeTabsRight, onTerminalUnregistered],
  );

  const handleCloseOthers = useCallback(
    (tabId: string) => {
      const tabsToClose = tabs.filter((t) => t.id !== tabId);
      if (tabsToClose.length > 1) {
        if (!window.confirm(`Close ${tabsToClose.length} terminals? Running processes will be terminated.`)) return;
      }
      tabsToClose.forEach((t) => {
        if (t.terminalId) {
          sendRequest('terminal.close', { terminalId: t.terminalId }).catch(console.error);
          onTerminalUnregistered?.(t.terminalId);
        }
      });
      closeOtherTabs(tabId);
    },
    [tabs, closeOtherTabs, onTerminalUnregistered],
  );

  const handleRenameTab = useCallback(
    (tabId: string, newTitle: string) => {
      setDisplayTitle(tabId, newTitle);
    },
    [setDisplayTitle],
  );

  // Notify parent of activeTabId changes
  useEffect(() => {
    onActiveTabChange?.(activeTabId);
  }, [activeTabId, onActiveTabChange]);

  useImperativeHandle(
    ref,
    () => ({
      transferTabOut(tabId: string) {
        const tab = tabsRef.current.find((t) => t.id === tabId);
        if (!tab?.terminalId) return null;
        const data = { terminalId: tab.terminalId, title: tab.title, cwd: tab.cwd, customTitle: tab.customTitle };
        closeTab(tabId);
        return data;
      },
      receiveTab(terminalId: string, title: string, cwd?: string, customTitle?: string) {
        const tabId = createTab({ type: 'terminal', title, terminalId, cwd, customTitle });
        return tabId;
      },
      reorderTabs,
      getTabs: () => tabsRef.current,
      getActiveTabId: () => activeTabId ?? null,
      updateTabTitle(tabId: string, title: string) {
        updateTabTitle(tabId, title);
      },
      updateTabCwd(tabId: string, cwd: string) {
        updateTabCwd(tabId, cwd);
      },
    }),
    [closeTab, createTab, reorderTabs, activeTabId, updateTabTitle, updateTabCwd],
  );

  return (
    <div
      data-testid="bottom-panel"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: COLOR_BG_PRIMARY,
      }}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={activateTab}
        onClose={handleCloseTab}
        onAddTerminal={handleAddTerminal}
        canAddTerminal={!!workspaceId}
        variant="bottom"
        onCloseRight={handleCloseRight}
        onCloseOthers={handleCloseOthers}
        onRename={handleRenameTab}
        group="bottom"
      />
      {/* TerminalManager portals terminals into this container */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div ref={terminalContainerRef} data-testid="terminal-container" style={{ height: '100%', pointerEvents: 'none' }} />
        {!activeTabId && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              color: COLOR_TEXT_DIM,
              padding: '8px',
              fontSize: '12px',
              background: COLOR_BG_PRIMARY,
            }}
          >
            No terminal
          </div>
        )}
      </div>
    </div>
  );
});
