import { useWorkspaces } from '../hooks/useWorkspaces';

interface WorkspaceSidebarProps {
  activeWorkspaceId: string | null;
  onWorkspaceSelect: (id: string) => void;
  onAddWorkspace: () => void;
}

export function WorkspaceSidebar({ activeWorkspaceId, onWorkspaceSelect, onAddWorkspace }: WorkspaceSidebarProps) {
  const { data: workspaces, isLoading } = useWorkspaces();

  return (
    <div data-testid="workspace-sidebar" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '4px 8px' }}>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#888' }}>Workspaces</span>
        <button data-testid="add-workspace-btn" onClick={onAddWorkspace} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}>+</button>
      </div>
      {isLoading && <div style={{ color: '#666', padding: '8px' }}>Loading...</div>}
      {workspaces?.length === 0 && <div style={{ color: '#666', padding: '8px', fontSize: '12px' }}>No workspaces</div>}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {workspaces?.map((ws) => (
          <div key={ws.id} data-testid={`workspace-${ws.id}`} onClick={() => onWorkspaceSelect(ws.id)} style={{
            padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            background: activeWorkspaceId === ws.id ? '#37373d' : 'transparent',
          }}>
            <div data-testid={`ws-color-${ws.id}`} style={{ width: '8px', height: '8px', borderRadius: '50%', background: ws.color || '#007acc' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</div>
              <div style={{ fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.cwd}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
