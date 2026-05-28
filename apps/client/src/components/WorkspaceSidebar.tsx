import { useWorkspaces } from '../hooks/useWorkspaces';
import { WorkspaceItem } from './WorkspaceItem';

interface WorkspaceSidebarProps {
  activeWorkspaceId: string | null;
  onWorkspaceSelect: (id: string) => void;
  onAddWorkspace: () => void;
  onRenameWorkspace: (id: string, newName: string) => void;
  onSetCwdWorkspace: (id: string, newCwd: string) => void;
  onRemoveWorkspace: (id: string) => void;
  onChangeColorWorkspace: (id: string, newColor: string) => void;
}

export function WorkspaceSidebar({
  activeWorkspaceId,
  onWorkspaceSelect,
  onAddWorkspace,
  onRenameWorkspace,
  onSetCwdWorkspace,
  onRemoveWorkspace,
  onChangeColorWorkspace,
}: WorkspaceSidebarProps) {
  const { data: workspaces, isLoading } = useWorkspaces();

  return (
    <div
      data-testid="workspace-sidebar"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '8px' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          padding: '4px 8px',
        }}
      >
        <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#888' }}>
          Workspaces
        </span>
        <button
          aria-label="Add workspace"
          data-testid="add-workspace-btn"
          onClick={onAddWorkspace}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '16px',
            borderRadius: '4px',
          }}
        >
          +
        </button>
      </div>
      {isLoading && <div style={{ color: '#666', padding: '8px' }}>Loading...</div>}
      {workspaces?.length === 0 && (
        <div style={{ color: '#666', padding: '8px', fontSize: '12px' }}>No workspaces</div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {workspaces?.map((ws) => (
          <WorkspaceItem
            key={ws.id}
            workspace={ws}
            isActive={activeWorkspaceId === ws.id}
            onSelect={onWorkspaceSelect}
            onRename={onRenameWorkspace}
            onSetCwd={onSetCwdWorkspace}
            onRemove={onRemoveWorkspace}
            onChangeColor={onChangeColorWorkspace}
          />
        ))}
      </div>
    </div>
  );
}
