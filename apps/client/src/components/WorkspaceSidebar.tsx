import type { GitWorktreeInfo } from '@ymir/shared';
import { useDroppable } from '@dnd-kit/react';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { WorkspaceItem } from './WorkspaceItem';
import { COLOR_BORDER, COLOR_TEXT_DIM, COLOR_TEXT_MUTED, TITLE_BAR_HEIGHT } from '../lib/theme';

interface WorkspaceSidebarProps {
  activeWorkspaceId: string | null;
  worktreesByWorkspace: Record<string, GitWorktreeInfo[]>;
  activeWorktreePath: string | null;
  onWorkspaceSelect: (id: string) => void;
  onAddWorkspace: () => void;
  onRenameWorkspace: (id: string, newName: string) => void;
  onSetCwdWorkspace: (id: string, newCwd: string) => void;
  onRemoveWorkspace: (id: string) => void;
  onChangeColorWorkspace: (id: string, newColor: string) => void;
  onWorktreeSelect: (path: string) => void;
  onCreateWorktree: (workspaceId: string) => void;
  onCopyWorktreePath: (path: string) => void;
  onRemoveWorktree: (workspaceId: string, path: string, force: boolean) => void;
  onMergeWorktree: (
    workspaceId: string,
    path: string,
    branch: string,
    deleteAfterMerge?: boolean,
  ) => void;
}

export function WorkspaceSidebar({
  activeWorkspaceId,
  worktreesByWorkspace,
  activeWorktreePath,
  onWorkspaceSelect,
  onAddWorkspace,
  onRenameWorkspace,
  onSetCwdWorkspace,
  onRemoveWorkspace,
  onChangeColorWorkspace,
  onWorktreeSelect,
  onCreateWorktree,
  onCopyWorktreePath,
  onRemoveWorktree,
  onMergeWorktree,
}: WorkspaceSidebarProps) {
  const { data: workspaces, isLoading } = useWorkspaces();

  return (
    <>
      <style>{`
        [data-testid^="worktree-item-"]:focus-visible {
          outline: 2px solid var(--accent-color, #007acc);
          outline-offset: 1px;
        }
      `}</style>
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
          <div style={{ color: COLOR_TEXT_DIM, padding: '8px', fontSize: '12px' }}>
            No workspaces
          </div>
        )}
        <WorkspaceSidebarList
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          worktreesByWorkspace={worktreesByWorkspace}
          activeWorktreePath={activeWorktreePath}
          onWorkspaceSelect={onWorkspaceSelect}
          onRenameWorkspace={onRenameWorkspace}
          onSetCwdWorkspace={onSetCwdWorkspace}
          onRemoveWorkspace={onRemoveWorkspace}
          onChangeColorWorkspace={onChangeColorWorkspace}
          onWorktreeSelect={onWorktreeSelect}
          onCreateWorktree={onCreateWorktree}
          onCopyWorktreePath={onCopyWorktreePath}
          onRemoveWorktree={onRemoveWorktree}
          onMergeWorktree={onMergeWorktree}
        />
      </div>
    </>
  );
}

function WorkspaceSidebarList({
  workspaces,
  activeWorkspaceId,
  worktreesByWorkspace,
  activeWorktreePath,
  onWorkspaceSelect,
  onRenameWorkspace,
  onSetCwdWorkspace,
  onRemoveWorkspace,
  onChangeColorWorkspace,
  onWorktreeSelect,
  onCreateWorktree,
  onCopyWorktreePath,
  onRemoveWorktree,
  onMergeWorktree,
}: {
  workspaces: import('@ymir/shared').WorkspaceSummary[] | undefined;
  activeWorkspaceId: string | null;
  worktreesByWorkspace: Record<string, GitWorktreeInfo[]>;
  activeWorktreePath: string | null;
  onWorkspaceSelect: (id: string) => void;
  onRenameWorkspace: (id: string, newName: string) => void;
  onSetCwdWorkspace: (id: string, newCwd: string) => void;
  onRemoveWorkspace: (id: string) => void;
  onChangeColorWorkspace: (id: string, newColor: string) => void;
  onWorktreeSelect: (path: string) => void;
  onCreateWorktree: (workspaceId: string) => void;
  onCopyWorktreePath: (path: string) => void;
  onRemoveWorktree: (workspaceId: string, path: string, force: boolean) => void;
  onMergeWorktree: (
    workspaceId: string,
    path: string,
    branch: string,
    deleteAfterMerge?: boolean,
  ) => void;
}) {
  const { ref: droppableRef, isDropTarget } = useDroppable({
    id: 'workspace-list',
    type: 'workspace-list',
    accept: ['workspace'],
    data: { group: 'workspace-list' },
  });

  return (
    <div
      ref={droppableRef}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '8px',
        boxShadow: isDropTarget ? 'inset 0 0 0 1px var(--accent)' : undefined,
        transition: 'box-shadow 0.15s',
      }}
    >
      {workspaces?.map((ws: import('@ymir/shared').WorkspaceSummary, index: number) => (
        <WorkspaceItem
          key={ws.id}
          workspace={ws}
          wsIndex={index}
          isActive={activeWorkspaceId === ws.id}
          worktrees={worktreesByWorkspace[ws.id] || []}
          activeWorktreePath={activeWorktreePath}
          onSelect={onWorkspaceSelect}
          onRename={onRenameWorkspace}
          onSetCwd={onSetCwdWorkspace}
          onRemove={onRemoveWorkspace}
          onChangeColor={onChangeColorWorkspace}
          onWorktreeSelect={onWorktreeSelect}
          onCopyWorktreePath={onCopyWorktreePath}
          onRemoveWorktree={(path, force) => onRemoveWorktree(ws.id, path, force)}
          onMergeWorktree={(path, branch, deleteAfterMerge) =>
            onMergeWorktree(ws.id, path, branch, deleteAfterMerge)
          }
          onCreateWorktree={() => onCreateWorktree(ws.id)}
        />
      ))}
    </div>
  );
}
