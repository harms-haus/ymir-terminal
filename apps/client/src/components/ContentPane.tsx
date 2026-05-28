import { useRef, useCallback, useEffect } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useTerminal } from '../hooks/useTerminal';
import { Terminal } from './Terminal';
import { TabBar } from './TabBar';
import { sendRequest } from '../lib/send-request';

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
  const { sendData, onOutput, createTerminal, resizeTerminal } = useTerminal(
    activeTab?.type === 'terminal' ? (activeTab.terminalId ?? null) : null,
  );
  // Track cleanup functions for the current terminal's I/O wiring
  const cleanupRef = useRef<(() => void) | null>(null);

  // Clean up terminal I/O wiring on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const handleTerminalReady = useCallback(
    (term: { onData: (cb: (data: string) => void) => void }) => {
      // Clean up previous wiring
      cleanupRef.current?.();

      const dataDisposable = term.onData((data: string) => {
        sendData(data);
      });
      const unregisterOutput = onOutput((data: string) => {
        term.write(data);
      });

      cleanupRef.current = () => {
        dataDisposable?.dispose?.();
        unregisterOutput();
      };
    },
    [sendData, onOutput],
  );

  const handleTerminalResize = useCallback(
    (cols: number, rows: number) => {
      resizeTerminal(cols, rows);
    },
    [resizeTerminal],
  );

  const creatingRef = useRef(false);

  const handleAddTerminal = async () => {
    if (!workspaceId || creatingRef.current) return;
    creatingRef.current = true;
    try {
      const terminalId = await createTerminal(workspaceId);
      createTab({ type: 'terminal', title: `Terminal ${tabs.length + 1}`, terminalId });
    } catch (err) {
      console.error('Failed to create terminal:', err);
    } finally {
      creatingRef.current = false;
    }
  };

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
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab?.type === 'terminal' && activeTab.terminalId && (
          <Terminal
            key={activeTab.terminalId}
            terminalId={activeTab.terminalId}
            onReady={handleTerminalReady}
            onResize={handleTerminalResize}
          />
        )}
        {activeTab?.type === 'editor' && (
          <div data-testid="editor-placeholder">Editor: {activeTab.filePath}</div>
        )}
        {!activeTab && (
          <div
            style={{
              color: '#666',
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
