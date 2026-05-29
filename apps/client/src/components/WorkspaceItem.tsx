import { COLOR_ACCENT, COLOR_WORKSPACE_ACTIVE, COLOR_WORKSPACE_CWD } from '../lib/theme';
import { WorkspaceItemContextMenu } from './WorkspaceItemContextMenu';

interface WorkspaceItemProps {
  workspace: { id: string; name: string; cwd: string; color: string };
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onSetCwd: (id: string, newCwd: string) => void;
  onRemove: (id: string) => void;
  onChangeColor: (id: string, newColor: string) => void;
}

export function WorkspaceItem({
  workspace,
  isActive,
  onSelect,
  onRename,
  onSetCwd,
  onRemove,
  onChangeColor,
}: WorkspaceItemProps) {
  return (
    <WorkspaceItemContextMenu
      workspace={workspace}
      onRename={onRename}
      onSetCwd={onSetCwd}
      onRemove={onRemove}
      onChangeColor={onChangeColor}
    >
      <div
        data-testid={`workspace-item-${workspace.id}`}
        role="button"
        tabIndex={0}
        aria-label={`Workspace: ${workspace.name}`}
        onClick={() => onSelect(workspace.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(workspace.id);
          }
        }}
        style={{
          padding: '6px 8px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: isActive ? COLOR_WORKSPACE_ACTIVE : 'transparent',
        }}
      >
        <div
          data-testid={`ws-color-${workspace.id}`}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: workspace.color || COLOR_ACCENT,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {workspace.name}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: COLOR_WORKSPACE_CWD,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {workspace.cwd}
          </div>
        </div>
      </div>
    </WorkspaceItemContextMenu>
  );
}
