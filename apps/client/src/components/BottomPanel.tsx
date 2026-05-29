import { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useTabs } from '../hooks/useTabs';
import type { Tab } from '../hooks/useTabs';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { Terminal } from './Terminal';
import { TabBar } from './TabBar';
import { sendRequest } from '../lib/send-request';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';

export interface BottomPanelHandle {
  removeTerminalTab: (tabId: string) => { terminalId: string; title: string; cwd?: string } | null;
  addTerminalTab: (terminalId: string, title: string, cwd?: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  getTabs: () => Tab[];
}

export const BottomPanel = forwardRef<BottomPanelHandle, { workspaceId: string | null }>(
function BottomPanel({ workspaceId }: { workspaceId: string | null }, ref) {
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
  } = useTabs();

  // Keep a ref to tabs so imperative handle always sees current state
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const handleAddTerminal = useCreateTerminalTab(workspaceId, tabs, createTab);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.terminalId) {
        sendRequest('terminal.close', { terminalId: tab.terminalId }).catch(console.error);
      }
      closeTab(tabId);
    },
    [tabs, closeTab],
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
        }
      });
      closeTabsRight(tabId);
    },
    [tabs, closeTabsRight],
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
        }
      });
      closeOtherTabs(tabId);
    },
    [tabs, closeOtherTabs],
  );

  const handleRenameTab = useCallback(
    (tabId: string, newTitle: string) => {
      updateTabTitle(tabId, newTitle);
    },
    [updateTabTitle],
  );

  useImperativeHandle(
    ref,
    () => ({
      removeTerminalTab(tabId: string) {
        const tab = tabsRef.current.find((t) => t.id === tabId);
        if (!tab?.terminalId) return null;
        const data = { terminalId: tab.terminalId, title: tab.title, cwd: tab.cwd };
        closeTab(tabId);
        return data;
      },
      addTerminalTab(terminalId: string, title: string, cwd?: string) {
        createTab({ type: 'terminal', title, terminalId, cwd });
      },
      reorderTabs,
      getTabs: () => tabsRef.current,
    }),
    [closeTab, createTab, reorderTabs],
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
      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tabs
          .filter((t) => t.terminalId)
          .map((t) => (
            <div
              key={t.terminalId}
              style={{
                height: '100%',
                display: t.id === activeTabId ? 'block' : 'none',
              }}
            >
              <Terminal
                terminalId={t.terminalId!}
                onTitleChange={(title: string) => handleTitleChange(t.id, title)}
                onCwdChange={(cwd: string) => handleCwdChange(t.id, cwd)}
              />
            </div>
          ))}
        {!activeTabId && (
          <div style={{ color: COLOR_TEXT_DIM, padding: '8px', fontSize: '12px' }}>No terminal</div>
        )}
      </div>
    </div>
  );
});
