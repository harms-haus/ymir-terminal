import React, { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { GitWorktreeInfo } from '@ymir/shared';
import { COLOR_ERROR } from '../lib/theme';
import {
  getContextMenuCss,
  getMenuContainerStyle,
  menuItemStyle,
  separatorStyle,
} from '../lib/context-menu-styles';
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

const WT_CONTEXT_MENU_CSS = getContextMenuCss('wt-context-menu');

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

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-testid="wt-context-menu" style={getMenuContainerStyle('180px')}>
          <style>{WT_CONTEXT_MENU_CSS}</style>

          {/* Copy Path */}
          <ContextMenu.Item
            data-testid="wt-menu-copy-path"
            onSelect={onCopyPath}
            style={menuItemStyle}
          >
            Copy Path
          </ContextMenu.Item>

          <ContextMenu.Separator style={separatorStyle} />

          {/* Merge Worktree */}
          <ContextMenu.Item
            data-testid="wt-menu-merge"
            onSelect={() => setIsMergeDialogOpen(true)}
            style={menuItemStyle}
          >
            Merge Worktree…
          </ContextMenu.Item>

          <ContextMenu.Separator style={separatorStyle} />

          {/* Remove Worktree */}
          <ContextMenu.Item
            data-testid="wt-menu-remove"
            onSelect={() => setIsDialogOpen(true)}
            style={{ ...menuItemStyle, color: COLOR_ERROR }}
          >
            Remove Worktree
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>

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
    </ContextMenu.Root>
  );
}
