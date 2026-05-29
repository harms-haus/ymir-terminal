import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTabs } from '../hooks/useTabs';
import type { Tab } from '../hooks/useTabs';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { Terminal } from './Terminal';
import { EditorPane } from './EditorPane';
import { TabBar } from './TabBar';
import { sendRequest } from '../lib/send-request';
import { COLOR_TEXT_DIM } from '../lib/theme';

export interface ContentPaneHandle {
  removeTerminalTab: (tabId: string) => { terminalId: string; title: string; cwd?: string } | null;
  addTerminalTab: (terminalId: string, title: string, cwd?: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  getTabs: () => Tab[];
}

export interface ContentPaneProps {
  workspaceId: string | null;
  fileToOpen?: string | null;
  onFileOpened?: () => void;
}

export const ContentPane = forwardRef<ContentPaneHandle, ContentPaneProps>(function ContentPane(
  { workspaceId, fileToOpen, onFileOpened }: ContentPaneProps,
  ref,
) {
  const { tabs, activeTabId, createTab, closeTab, activateTab, updateTabTitle, updateTabCwd, reorderTabs, closeTabsRight, closeOtherTabs } = useTabs();

  // Keep a ref to tabs so imperative handle always sees current state
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

  const terminalRefs = useRef<Map<string, { focus(): void }>>(new Map());

  const handleAddTerminal = useCreateTerminalTab(workspaceId, tabs, createTab);

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
      }
      closeTab(tabId);
    },
    [tabs, closeTab, dirtyFiles],
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
        }
      });
      closeTabsRight(tabId);
    },
    [tabs, dirtyFiles, closeTabsRight],
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
        }
      });
      closeOtherTabs(tabId);
    },
    [tabs, dirtyFiles, closeOtherTabs],
  );

  const handleRenameTab = useCallback(
    (tabId: string, newTitle: string) => {
      updateTabTitle(tabId, newTitle);
    },
    [updateTabTitle],
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

  useEffect(() => {
    if (activeTab?.type === 'terminal') {
      // Small delay to ensure the terminal is visible (display changed from none to block)
      requestAnimationFrame(() => {
        terminalRefs.current.get(activeTabId!)?.focus();
      });
    }
  }, [activeTabId, activeTab?.type]);

  useEffect(() => {
    if (fileToOpen) {
      handleAddEditor(fileToOpen);
      onFileOpened?.();
    }
  }, [fileToOpen, handleAddEditor, onFileOpened]);

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
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tabs
          .filter((t) => t.type === 'terminal' && t.terminalId)
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
                ref={(el: { focus(): void } | null) => {
                  if (el) terminalRefs.current.set(t.id, el);
                  else terminalRefs.current.delete(t.id);
                }}
                onTitleChange={(title: string) => handleTitleChange(t.id, title)}
                onCwdChange={(cwd: string) => handleCwdChange(t.id, cwd)}
              />
            </div>
          ))}
        {activeTab?.type === 'editor' && activeTab.filePath && workspaceId && (
          <EditorPane
            key={activeTab.filePath}
            workspaceId={workspaceId}
            filePath={activeTab.filePath}
            onDirtyChange={handleDirtyChange}
          />
        )}
        {!activeTab && (
          <div
            style={{
              color: COLOR_TEXT_DIM,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            No tabs open
          </div>
        )}
      </div>
    </div>
  );
});
