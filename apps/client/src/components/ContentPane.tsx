import { useRef, useCallback } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useTerminal } from '../hooks/useTerminal';
import { Terminal } from './Terminal';
import { TabBar } from './TabBar';

export function ContentPane({ workspaceId }: { workspaceId: string | null }) {
  const { tabs, activeTabId, createTab, closeTab, activateTab } = useTabs();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const { sendData, onOutput, createTerminal, resizeTerminal } = useTerminal(
    activeTab?.type === 'terminal' ? (activeTab.terminalId ?? null) : null,
  );
  // Track cleanup functions for the current terminal's I/O wiring
  const cleanupRef = useRef<(() => void) | null>(null);

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

  const handleAddTerminal = async () => {
    if (!workspaceId) return;
    const terminalId = await createTerminal(workspaceId);
    createTab({ type: 'terminal', title: `Terminal ${tabs.length + 1}`, terminalId });
  };

  const handleAddEditor = (filePath: string) => {
    const existing = tabs.find((t) => t.filePath === filePath);
    if (existing) {
      activateTab(existing.id);
      return;
    }
    createTab({ type: 'editor', title: filePath.split('/').pop() || filePath, filePath });
  };

  return (
    <div data-testid="content-pane" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={activateTab}
        onClose={closeTab}
        onAddTerminal={handleAddTerminal}
        onAddEditor={handleAddEditor}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab?.type === 'terminal' && activeTab.terminalId && (
          <Terminal
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
