import type { GitWorktreeInfo } from '@ymir/shared';
import { useSortable } from '@dnd-kit/react/sortable';
import { COLOR_WORKSPACE_ACTIVE } from '../lib/theme';
import { WorktreeItemContextMenu } from './WorktreeItemContextMenu';

interface WorktreeItemProps {
  worktree: GitWorktreeInfo;
  workspaceId: string;
  wtIndex: number;
  isActive: boolean;
  onClick: () => void;
  onCopyPath: () => void;
  onRemove: (force: boolean) => void;
  onMergeWorktree?: (path: string, branch: string, deleteAfterMerge?: boolean, filesToCopy?: string[]) => void;
}

export function WorktreeItem({
  worktree,
  workspaceId,
  wtIndex,
  isActive,
  onClick,
  onCopyPath,
  onRemove,
  onMergeWorktree,
}: WorktreeItemProps) {
  const { ref: sortableRef, isDragging } = useSortable({
    id: worktree.path,
    index: wtIndex,
    group: `worktree-${workspaceId}`,
    type: 'worktree',
    accept: ['worktree'],
  });

  return (
    <WorktreeItemContextMenu
      worktree={worktree}
      onCopyPath={onCopyPath}
      onMergeConfirm={(deleteAfterMerge, filesToCopy) =>
        onMergeWorktree?.(worktree.path, worktree.branch ?? '', deleteAfterMerge, filesToCopy)
      }
      targetBranch="main"
      onRemove={onRemove}
      workspaceId={workspaceId}
    >
      <div
        ref={sortableRef}
        data-testid={`worktree-item-${worktree.path.replace(/\//g, '-')}`}
        role="button"
        tabIndex={0}
        aria-label={`Worktree: ${worktree.isDetached ? 'detached' : worktree.branch}`}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        style={{
          padding: '6px 8px 6px 24px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          background: isActive ? COLOR_WORKSPACE_ACTIVE : 'transparent',
          opacity: isDragging ? 0.4 : 1,
        }}
      >
        <div
          style={{
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ flexShrink: 0 }}>⑂</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {worktree.isDetached ? 'detached' : worktree.branch}
          </span>
        </div>
      </div>
    </WorktreeItemContextMenu>
  );
}
