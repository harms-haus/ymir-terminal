import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTabs } from '../hooks/useTabs';
import type { Tab } from '../hooks/useTabs';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { EditorPane } from './EditorPane';
import { TabBar } from './TabBar';
import { sendRequest } from '../lib/send-request';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';

export interface ContentPaneHandle {
  transferTabOut: (tabId: string) => { terminalId: string; title: string; cwd?: string; customTitle?: string } | null;
  receiveTab: (terminalId: string, title: string, cwd?: string, customTitle?: string) => string;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  getTabs: () => Tab[];
  getActiveTabId: () => string | null;
  updateTabTitle: (tabId: string, title: string) => void;
  updateTabCwd: (tabId: string, cwd: string) => void;
}

export interface ContentPaneProps {
  workspaceId: string | null;
  fileToOpen?: string | null;
  onFileOpened?: () => void;
  terminalContainerRef?: React.Ref<HTMLDivElement>;
  onTerminalRegistered?: (terminalId: string, tabId: string) => void;
  onTerminalUnregistered?: (terminalId: string) => void;
  onActiveTabChange?: (activeTabId: string | null) => void;
}

export const ContentPane = forwardRef<ContentPaneHandle, ContentPaneProps>(function ContentPane(
  { workspaceId, fileToOpen, onFileOpened, terminalContainerRef, onTerminalRegistered, onTerminalUnregistered, onActiveTabChange }: ContentPaneProps,
  ref,
) {
  const { tabs, activeTabId, createTab, closeTab, activateTab, updateTabTitle, updateTabCwd, reorderTabs, closeTabsRight, closeOtherTabs, setDisplayTitle } = useTabs();

  // Keep a ref to tabs so imperative handle always sees current state
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

  const handleTerminalCreated = useCallback(
    (terminalId: string, tabId: string) => {
      onTerminalRegistered?.(terminalId, tabId);
    },
    [onTerminalRegistered],
  );

  const handleAddTerminal = useCreateTerminalTab(workspaceId, tabs, createTab, handleTerminalCreated);

  const handleDirtyChange = useCallback((filePath: string, dirty: boolean) => {
    setDirtyFiles((prev) => {
      if (dirty ? prev.has(filePath) : !prev.has(filePath)) return prev;
      const next = new Set(prev);
      if (dirty) next.add(filePath);
      else next.delete(filePath);
      return next;
    });
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.filePath && dirtyFiles.has(tab.filePath)) {
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
      const dirtyEditorsToClose = tabsToClose.filter(
        (t) => t.filePath && dirtyFiles.has(t.filePath),
      );
      if (dirtyEditorsToClose.length > 0) {
        const names = dirtyEditorsToClose.map((t) => t.filePath!.split('/').pop()).join(', ');
        if (!window.confirm(`"${names}" has unsaved changes. Close without saving?`)) return;
      }
      tabsToClose.forEach((t) => {
        if (t.terminalId) {
          sendRequest('terminal.close', { terminalId: t.terminalId }).catch(console.error);
          onTerminalUnregistered?.(t.terminalId);
        }
      });
      closeTabsRight(tabId);
    },
    [tabs, dirtyFiles, closeTabsRight, onTerminalUnregistered],
  );

  const handleCloseOthers = useCallback(
    (tabId: string) => {
      const tabsToClose = tabs.filter((t) => t.id !== tabId);
      const dirtyEditorsToClose = tabsToClose.filter(
        (t) => t.filePath && dirtyFiles.has(t.filePath),
      );
      if (dirtyEditorsToClose.length > 0) {
        const names = dirtyEditorsToClose.map((t) => t.filePath!.split('/').pop()).join(', ');
        if (!window.confirm(`"${names}" has unsaved changes. Close without saving?`)) return;
      }
      tabsToClose.forEach((t) => {
        if (t.terminalId) {
          sendRequest('terminal.close', { terminalId: t.terminalId }).catch(console.error);
          onTerminalUnregistered?.(t.terminalId);
        }
      });
      closeOtherTabs(tabId);
    },
    [tabs, dirtyFiles, closeOtherTabs, onTerminalUnregistered],
  );

  const handleRenameTab = useCallback(
    (tabId: string, newTitle: string) => {
      setDisplayTitle(tabId, newTitle);
    },
    [setDisplayTitle],
  );

  const handleAddEditor = useCallback(
    (filePath: string) => {
      const existing = tabs.find((t) => t.filePath === filePath);
      if (existing) {
        activateTab(existing.id);
        return;
      }
      createTab({ type: 'editor', title: filePath.split('/').pop() || filePath, filePath });
    },
    [tabs, activateTab, createTab],
  );

  // Notify parent of activeTabId changes
  useEffect(() => {
    onActiveTabChange?.(activeTabId);
  }, [activeTabId, onActiveTabChange]);

  useEffect(() => {
    if (fileToOpen) {
      handleAddEditor(fileToOpen);
      onFileOpened?.();
    }
  }, [fileToOpen, handleAddEditor, onFileOpened]);

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
      getActiveTabId: () => {
        // Read from the current tabs state via ref
        const currentTabs = tabsRef.current;
        // activeTabId is captured in the closure but may be stale;
        // use the internal ref pattern instead
        return activeTabId ?? null;
      },
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
      data-testid="content-pane"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={activateTab}
        onClose={handleCloseTab}
        onAddTerminal={handleAddTerminal}
        canAddTerminal={!!workspaceId}
        variant="content"
        onCloseRight={handleCloseRight}
        onCloseOthers={handleCloseOthers}
        onRename={handleRenameTab}
        group="content"
      />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* TerminalManager portals terminals into this container */}
        <div ref={terminalContainerRef} data-testid="terminal-container" style={{ height: '100%', pointerEvents: 'none' }} />
        {activeTab?.type === 'editor' && activeTab.filePath && workspaceId && (
          <div style={{ position: 'absolute', inset: 0, background: COLOR_BG_PRIMARY }}>
            <EditorPane
              key={activeTab.filePath}
              workspaceId={workspaceId}
              filePath={activeTab.filePath}
              onDirtyChange={handleDirtyChange}
            />
          </div>
        )}
        {!activeTab && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              color: COLOR_TEXT_DIM,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: COLOR_BG_PRIMARY,
            }}
          >
            No tabs open
          </div>
        )}
      </div>
    </div>
  );
});
