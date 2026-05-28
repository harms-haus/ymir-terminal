import { useTabs, type Tab } from '../hooks/useTabs';
import { Terminal } from './Terminal';
import { TabBar } from './TabBar';

export function ContentPane({ workspaceId }: { workspaceId: string | null }) {
  const { tabs, activeTabId, createTab, closeTab, activateTab } = useTabs();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleAddTerminal = () => {
    createTab({ type: 'terminal', title: `Terminal ${tabs.length + 1}` });
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
          <Terminal terminalId={activeTab.terminalId} />
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
