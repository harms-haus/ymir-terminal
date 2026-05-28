import { useTabs } from '../hooks/useTabs';
import { Terminal } from './Terminal';

export function BottomPanel({ workspaceId }: { workspaceId: string | null }) {
  const { tabs, activeTabId, createTab, closeTab, activateTab } = useTabs();
  const activeTab = tabs.find(t => t.id === activeTabId);

  const handleAddTerminal = async () => {
    if (!workspaceId) return;
    createTab({ type: 'terminal', title: `Terminal ${tabs.length + 1}` });
  };

  return (
    <div data-testid="bottom-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e1e' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', background: '#252526', borderBottom: '1px solid #333', height: '35px' }}>
        {tabs.map(tab => (
          <div key={tab.id} data-testid={`bottom-tab-${tab.id}`} onClick={() => activateTab(tab.id)} style={{
            padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            background: activeTabId === tab.id ? '#1e1e1e' : 'transparent',
            borderBottom: activeTabId === tab.id ? '1px solid #007acc' : '1px solid transparent',
            color: activeTabId === tab.id ? '#fff' : '#888',
          }}>
            <span style={{ fontSize: '12px' }}>{tab.title}</span>
            <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}>×</button>
          </div>
        ))}
        <button data-testid="add-bottom-terminal" onClick={handleAddTerminal} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '6px 12px', fontSize: '14px' }}>+</button>
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab?.terminalId && <Terminal terminalId={activeTab.terminalId} />}
        {!activeTab && <div style={{ color: '#666', padding: '8px', fontSize: '12px' }}>No terminal</div>}
      </div>
    </div>
  );
}
