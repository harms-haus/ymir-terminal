import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTerminalPane } from '../hooks/useTerminalPane';
import type { Tab } from '../hooks/useTabs';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { EditorPane } from './EditorPane';
import { TabBar } from './TabBar';
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
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

  const {
    tabs,
    activeTabId,
    createTab,
    activateTab,
    reorderTabs,
    updateTabTitle,
    updateTabCwd,
    handleCloseTab,
    handleCloseRight,
    handleCloseOthers,
    handleRenameTab,
    transferTabOut,
    receiveTab,
    getTabs,
    getActiveTabId,
  } = useTerminalPane({ dirtyFiles, onTerminalUnregistered });

  const activeTab = tabs.find((t) => t.id === activeTabId);

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
      transferTabOut,
      receiveTab,
      reorderTabs,
      getTabs,
      getActiveTabId,
      updateTabTitle,
      updateTabCwd,
    }),
    [transferTabOut, receiveTab, reorderTabs, getTabs, getActiveTabId, updateTabTitle, updateTabCwd],
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
