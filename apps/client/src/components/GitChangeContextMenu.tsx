import type { GitFileChangeStatus } from '@ymir/shared';
import { AppContextMenu } from './AppContextMenu';
import type { ContextMenuItem } from './AppContextMenu';
import { useConfirm } from '../hooks/useDialog';

interface GitChangeContextMenuProps {
  path: string;
  status?: GitFileChangeStatus;
  isDirectory: boolean;
  isStaged: boolean;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
  onDiscard?: (path: string) => void;
  onOpenDiff?: (path: string) => void;
  onOpenEditor?: (path: string) => void;
  children: React.ReactNode;
}

export function GitChangeContextMenu({
  path,
  status: _status,
  isDirectory,
  isStaged,
  onStage,
  onUnstage,
  onDiscard,
  onOpenDiff,
  onOpenEditor,
  children,
}: GitChangeContextMenuProps) {
  const confirm = useConfirm();
  let items: ContextMenuItem[] = [];

  /* UNSTAGED file */
  if (!isStaged && !isDirectory) {
    items = [
      { label: 'Stage', testId: 'git-ctx-stage', action: () => onStage?.(path) },
      {
        label: 'Discard Changes',
        testId: 'git-ctx-discard',
        action: async () => {
          const ok = await confirm({
            title: 'Discard Changes',
            message: `Discard changes to ${path}?`,
            confirmLabel: 'Discard',
            danger: true,
          });
          if (!ok) return;
          onDiscard?.(path);
        },
        destructive: true,
        separatorAfter: true,
      },
      { label: 'View Diff', testId: 'git-ctx-diff', action: () => onOpenDiff?.(path) },
      {
        label: 'Open in Editor',
        testId: 'git-ctx-open-editor',
        action: () => onOpenEditor?.(path),
      },
    ];
  }

  /* STAGED file */
  if (isStaged && !isDirectory) {
    items = [
      {
        label: 'Unstage',
        testId: 'git-ctx-unstage',
        action: () => onUnstage?.(path),
        separatorAfter: true,
      },
      { label: 'View Diff', testId: 'git-ctx-staged-diff', action: () => onOpenDiff?.(path) },
      {
        label: 'Open in Editor',
        testId: 'git-ctx-open-editor-staged',
        action: () => onOpenEditor?.(path),
      },
    ];
  }

  /* UNSTAGED directory */
  if (!isStaged && isDirectory) {
    items = [
      { label: 'Stage All', testId: 'git-ctx-stage-all', action: () => onStage?.(path) },
      {
        label: 'Discard All',
        testId: 'git-ctx-discard-all',
        action: async () => {
          const ok = await confirm({
            title: 'Discard All Changes',
            message: `Discard all changes in ${path}?`,
            confirmLabel: 'Discard',
            danger: true,
          });
          if (!ok) return;
          onDiscard?.(path);
        },
        destructive: true,
      },
    ];
  }

  /* STAGED directory */
  if (isStaged && isDirectory) {
    items = [
      { label: 'Unstage All', testId: 'git-ctx-unstage-all', action: () => onUnstage?.(path) },
    ];
  }

  return (
    <AppContextMenu items={items} testId="git-change-context-menu" minWidth="180px">
      {children}
    </AppContextMenu>
  );
}
