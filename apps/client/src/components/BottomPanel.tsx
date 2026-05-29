import { useCallback } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { Terminal } from './Terminal';
import { sendRequest } from '../lib/send-request';
import {
  COLOR_ACCENT,
  COLOR_BG_PRIMARY,
  COLOR_BG_SECONDARY,
  COLOR_BORDER,
  COLOR_CLOSE_BTN_HOVER_BG,
  COLOR_TEXT_BRIGHT,
  COLOR_TEXT_DIM,
  COLOR_TEXT_MUTED,
} from '../lib/theme';

export function BottomPanel({ workspaceId }: { workspaceId: string | null }) {
  const { tabs, activeTabId, createTab, closeTab, activateTab } = useTabs();
  const activeTab = tabs.find((t) => t.id === activeTabId);

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
      <style>{`
        .tab-close-btn:hover { color: ${COLOR_TEXT_BRIGHT}; background: ${COLOR_CLOSE_BTN_HOVER_BG}; }
        .tab-close-btn:focus-visible { outline: 1px solid ${COLOR_ACCENT}; outline-offset: -1px; }
      `}</style>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: COLOR_BG_SECONDARY,
          borderBottom: `1px solid ${COLOR_BORDER}`,
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
              background: activeTabId === tab.id ? COLOR_BG_PRIMARY : 'transparent',
              borderBottom:
                activeTabId === tab.id ? `1px solid ${COLOR_ACCENT}` : '1px solid transparent',
              color: activeTabId === tab.id ? COLOR_TEXT_BRIGHT : COLOR_TEXT_MUTED,
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
                color: COLOR_TEXT_MUTED,
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
            color: COLOR_TEXT_MUTED,
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
          <Terminal key={activeTab.terminalId} terminalId={activeTab.terminalId} />
        )}
        {!activeTab && (
          <div style={{ color: COLOR_TEXT_DIM, padding: '8px', fontSize: '12px' }}>No terminal</div>
        )}
      </div>
    </div>
  );
}
