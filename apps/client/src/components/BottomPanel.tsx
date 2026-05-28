import { useCallback, useEffect, useRef } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useTerminal } from '../hooks/useTerminal';
import { Terminal } from './Terminal';
import { sendRequest } from '../lib/send-request';
import type { Terminal as GhosttyTerminal } from 'ghostty-web';

export function BottomPanel({ workspaceId }: { workspaceId: string | null }) {
  const { tabs, activeTabId, createTab, closeTab, activateTab } = useTabs();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const { sendData, onOutput, createTerminal, resizeTerminal } = useTerminal(
    activeTab?.terminalId ?? null,
  );

  const outputUnsubRef = useRef<(() => void) | null>(null);
  const dataDisposableRef = useRef<{ dispose?: () => void } | null>(null);
  const creatingRef = useRef(false);

  // Clean up output subscription and data disposable when the active terminal changes
  useEffect(() => {
    return () => {
      dataDisposableRef.current?.dispose?.();
      dataDisposableRef.current = null;
      outputUnsubRef.current?.();
      outputUnsubRef.current = null;
    };
  }, [activeTab?.terminalId]);

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

  const handleReady = useCallback(
    (term: GhosttyTerminal) => {
      dataDisposableRef.current?.dispose?.();
      dataDisposableRef.current = term.onData((data: string) => sendData(data));
      outputUnsubRef.current?.();
      outputUnsubRef.current = onOutput((data: string) => term.write(data));
    },
    [sendData, onOutput],
  );

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

  return (
    <div
      data-testid="bottom-panel"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e1e' }}
    >
      <style>{`
        .tab-close-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
        .tab-close-btn:focus-visible { outline: 1px solid #007acc; outline-offset: -1px; }
      `}</style>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#252526',
          borderBottom: '1px solid #333',
          height: '35px',
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            data-testid={`bottom-tab-${tab.id}`}
            onClick={() => activateTab(tab.id)}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: activeTabId === tab.id ? '#1e1e1e' : 'transparent',
              borderBottom: activeTabId === tab.id ? '1px solid #007acc' : '1px solid transparent',
              color: activeTabId === tab.id ? '#fff' : '#888',
            }}
          >
            <span style={{ fontSize: '12px' }}>{tab.title}</span>
            <button
              aria-label={`Close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                handleCloseTab(tab.id);
              }}
              className="tab-close-btn"
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '0 2px',
                width: '24px',
                height: '24px',
                minWidth: '24px',
                minHeight: '24px',
                borderRadius: '4px',
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          aria-label="Open new terminal"
          data-testid="add-bottom-terminal"
          onClick={handleAddTerminal}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            padding: '6px 12px',
            fontSize: '14px',
            borderRadius: '4px',
          }}
        >
          +
        </button>
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab?.terminalId && (
          <Terminal
            key={activeTab.terminalId}
            terminalId={activeTab.terminalId}
            onReady={handleReady}
            onResize={resizeTerminal}
          />
        )}
        {!activeTab && (
          <div style={{ color: '#666', padding: '8px', fontSize: '12px' }}>No terminal</div>
        )}
      </div>
    </div>
  );
}
