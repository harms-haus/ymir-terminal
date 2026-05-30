import { useWorkspaces } from '../hooks/useWorkspaces';
import { WorkspaceItem } from './WorkspaceItem';
import { COLOR_BORDER, COLOR_TEXT_DIM, COLOR_TEXT_MUTED, TITLE_BAR_HEIGHT } from '../lib/theme';

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
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          height: `${TITLE_BAR_HEIGHT}px`,
          display: 'flex',
          borderBottom: `1px solid ${COLOR_BORDER}`,
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 12px',
        }}
      >
        <span style={{ fontSize: '11px', textTransform: 'uppercase', color: COLOR_TEXT_MUTED }}>
          Workspaces
        </span>
        <button
          aria-label="Add workspace"
          data-testid="add-workspace-btn"
          onClick={onAddWorkspace}
          style={{
            background: 'none',
            border: 'none',
            color: COLOR_TEXT_MUTED,
            cursor: 'pointer',
            fontSize: '16px',
            borderRadius: '4px',
          }}
        >
          +
        </button>
      </div>
      {isLoading && <div style={{ color: COLOR_TEXT_DIM, padding: '8px' }}>Loading...</div>}
      {workspaces?.length === 0 && (
        <div style={{ color: COLOR_TEXT_DIM, padding: '8px', fontSize: '12px' }}>No workspaces</div>
      )}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {workspaces?.map((ws: import('@ymir/shared').WorkspaceSummary) => (
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
