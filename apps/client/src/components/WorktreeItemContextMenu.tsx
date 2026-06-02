import React, { useState } from 'react';
import type { GitWorktreeInfo } from '@ymir/shared';
import { AppContextMenu } from './AppContextMenu';
import type { ContextMenuItem } from './AppContextMenu';
import { MergeWorktreeDialog } from './MergeWorktreeDialog';
import { RemoveWorktreeDialog } from './RemoveWorktreeDialog';

interface WorktreeItemContextMenuProps {
  worktree: GitWorktreeInfo;
  onCopyPath: () => void;
  onMergeConfirm: (deleteAfterMerge: boolean, filesToCopy: string[]) => void;
  targetBranch: string;
  onRemove: (force: boolean) => void;
  isLoading?: boolean;
  isMergeLoading?: boolean;
  workspaceId: string;
  children: React.ReactNode;
}

export function WorktreeItemContextMenu({
  worktree,
  onCopyPath,
  onMergeConfirm,
  targetBranch,
  onRemove,
  isLoading,
  isMergeLoading,
  workspaceId,
  children,
}: WorktreeItemContextMenuProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);

  const branchName = worktree.isDetached
    ? (worktree.path.split('/').pop() ?? worktree.path)
    : (worktree.branch ?? worktree.path.split('/').pop() ?? worktree.path);

  const items: ContextMenuItem[] = [
    {
      label: 'Copy Path',
      testId: 'wt-menu-copy-path',
      action: onCopyPath,
      separatorAfter: true,
    },
    {
      label: 'Merge Worktree…',
      testId: 'wt-menu-merge',
      action: () => setIsMergeDialogOpen(true),
      separatorAfter: true,
    },
    {
      label: 'Remove Worktree',
      testId: 'wt-menu-remove',
      action: () => setIsDialogOpen(true),
      destructive: true,
    },
  ];

  return (
    <AppContextMenu
      items={items}
      testId="wt-context-menu"
      minWidth="180px"
      extraContent={
        <>
          <MergeWorktreeDialog
            open={isMergeDialogOpen}
            onClose={() => setIsMergeDialogOpen(false)}
            onConfirm={(opts) => {
              onMergeConfirm(opts.deleteAfterMerge, opts.filesToCopy);
              setIsMergeDialogOpen(false);
            }}
            branchName={branchName}
            targetBranch={targetBranch}
            isLoading={isMergeLoading ?? false}
            worktreePath={worktree.path}
            workspaceId={workspaceId}
          />

          <RemoveWorktreeDialog
            open={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            onConfirm={(force) => {
              onRemove(force);
              setIsDialogOpen(false);
            }}
            branchName={branchName}
            isLoading={isLoading ?? false}
          />
        </>
      }
    >
      {children}
    </AppContextMenu>
  );
}
