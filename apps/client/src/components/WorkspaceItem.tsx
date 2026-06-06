import type { CwdCompression, GitWorktreeInfo } from '@ymir/shared';
import { useRef, useState, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { compressPathToWidth } from '../lib/path-compression';
import { COLOR_ACCENT, COLOR_WORKSPACE_ACTIVE, COLOR_WORKSPACE_CWD } from '../lib/theme';
import { WorktreeItem } from './WorktreeItem';
import { WorktreeItemContextMenu } from './WorktreeItemContextMenu';
import { WorkspaceItemContextMenu } from './WorkspaceItemContextMenu';

interface WorkspaceItemProps {
  workspace: {
    id: string;
    name: string;
    cwd: string;
    color: string;
    cwdCompression?: CwdCompression;
  };
  wsIndex: number;
  isActive: boolean;
  worktrees: GitWorktreeInfo[];
  activeWorktreePath: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onSetCwd: (id: string, newCwd: string) => void;
  onRemove: (id: string) => void;
  onChangeColor: (id: string, newColor: string) => void;
  onWorktreeSelect: (path: string) => void;
  onCopyWorktreePath: (path: string) => void;
  onRemoveWorktree: (path: string, force: boolean) => void;
  onMergeWorktree: (
    path: string,
    branch: string,
    deleteAfterMerge?: boolean,
    filesToCopy?: string[],
  ) => void;
  onCreateWorktree?: () => void;
}

function createTextMeasurer(): (text: string) => number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = '11px sans-serif';
  return (text: string) => ctx.measureText(text).width;
}

export function WorkspaceItem({
  workspace,
  wsIndex,
  isActive,
  worktrees,
  activeWorktreePath,
  onSelect,
  onRename,
  onSetCwd,
  onRemove,
  onChangeColor,
  onWorktreeSelect,
  onCopyWorktreePath,
  onRemoveWorktree,
  onMergeWorktree,
  onCreateWorktree,
}: WorkspaceItemProps) {
  const cwdRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<((text: string) => number) | null>(null);
  const [displayCwd, setDisplayCwd] = useState(workspace.cwd);

  useEffect(() => {
    const el = cwdRef.current;
    if (!el || !workspace.cwdCompression) {
      setDisplayCwd(workspace.cwd);
      return;
    }

    if (measureRef.current === null) {
      measureRef.current = createTextMeasurer();
    }
    const measure = measureRef.current;
    let rafId: number | null = null;

    const update = () => {
      rafId = null;
      const availableWidth = el.clientWidth;
      setDisplayCwd(compressPathToWidth(workspace.cwdCompression!, availableWidth, measure));
    };

    update();

    const observer = new ResizeObserver(() => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(update);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [workspace.cwdCompression, workspace.cwd]);
  const linkedWorktrees = worktrees.filter((w) => !w.isMain);
  const hasLinkedWorktrees = linkedWorktrees.length > 0;
  const hasActiveChildWorktree =
    activeWorktreePath != null &&
    linkedWorktrees.some((wt: GitWorktreeInfo) => wt.path === activeWorktreePath);
  const isExpanded = isActive || hasActiveChildWorktree;

  const { ref: sortableRef, isDragging } = useSortable({
    id: workspace.id,
    index: wsIndex,
    group: 'workspace-list',
    type: 'workspace',
    accept: ['workspace'],
  });

  const { ref: worktreeDroppableRef, isDropTarget: isWorktreeDropTarget } = useDroppable({
    id: `worktree-list-${workspace.id}`,
    type: 'worktree-list',
    accept: ['worktree'],
    data: { group: `worktree-${workspace.id}` },
  });

  return (
    <>
      <WorkspaceItemContextMenu
        workspace={workspace}
        onRename={onRename}
        onSetCwd={onSetCwd}
        onRemove={onRemove}
        onChangeColor={onChangeColor}
        onCreateWorktree={onCreateWorktree}
      >
        <div
          ref={sortableRef}
          data-testid={`workspace-item-${workspace.id}`}
          onClick={() => onSelect(workspace.id)}
          style={{
            padding: '6px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background:
              isActive && !hasActiveChildWorktree ? COLOR_WORKSPACE_ACTIVE : 'transparent',
            opacity: isDragging ? 0.4 : undefined,
          }}
        >
          <div
            data-testid={`ws-color-${workspace.id}`}
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
              ref={cwdRef}
              style={{
                fontSize: '11px',
                color: COLOR_WORKSPACE_CWD,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayCwd}
            </div>
          </div>
        </div>
      </WorkspaceItemContextMenu>
      {isExpanded && hasLinkedWorktrees && (
        <div
          ref={worktreeDroppableRef}
          data-testid={`ws-worktrees-${workspace.id}`}
          style={{
            boxShadow: isWorktreeDropTarget ? 'inset 0 0 0 1px var(--accent)' : undefined,
            transition: 'box-shadow 0.15s',
          }}
        >
          {linkedWorktrees.map((wt, index) => (
            <WorktreeItemContextMenu
              key={wt.path}
              worktree={wt}
              onCopyPath={() => onCopyWorktreePath(wt.path)}
              onMergeConfirm={(deleteAfterMerge, filesToCopy) =>
                onMergeWorktree(wt.path, wt.branch ?? '', deleteAfterMerge, filesToCopy)
              }
              targetBranch="main"
              onRemove={(force) => onRemoveWorktree(wt.path, force)}
              workspaceId={workspace.id}
            >
              <WorktreeItem
                worktree={wt}
                workspaceId={workspace.id}
                wtIndex={index}
                isActive={activeWorktreePath === wt.path}
                onClick={() => onWorktreeSelect(wt.path)}
                onCopyPath={() => onCopyWorktreePath(wt.path)}
                onRemove={(force) => onRemoveWorktree(wt.path, force)}
                onMergeWorktree={onMergeWorktree}
              />
            </WorktreeItemContextMenu>
          ))}
        </div>
      )}
    </>
  );
}
