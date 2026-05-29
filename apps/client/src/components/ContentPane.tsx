import { useRef, useState, useCallback, useEffect } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { Terminal } from './Terminal';
import { EditorPane } from './EditorPane';
import { TabBar } from './TabBar';
import { sendRequest } from '../lib/send-request';
import { COLOR_TEXT_DIM } from '../lib/theme';

export function ContentPane({
  workspaceId,
  fileToOpen,
  onFileOpened,
}: {
  workspaceId: string | null;
  fileToOpen?: string | null;
  onFileOpened?: () => void;
}) {
  const { tabs, activeTabId, createTab, closeTab, activateTab } = useTabs();
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
}
