import type { GitFileChangeStatus } from '@ymir/shared';
import { AppContextMenu } from './AppContextMenu';
import type { ContextMenuItem } from './AppContextMenu';

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
  let items: ContextMenuItem[] = [];

  /* UNSTAGED file */
  if (!isStaged && !isDirectory) {
    items = [
      { label: 'Stage', testId: 'git-ctx-stage', action: () => onStage?.(path) },
      {
        label: 'Discard Changes',
        testId: 'git-ctx-discard',
        action: () => {
          if (window.confirm('Discard changes to ' + path + '?')) {
            onDiscard?.(path);
          }
        },
        destructive: true,
        separatorAfter: true,
      },
      { label: 'View Diff', testId: 'git-ctx-diff', action: () => onOpenDiff?.(path) },
      { label: 'Open in Editor', testId: 'git-ctx-open-editor', action: () => onOpenEditor?.(path) },
    ];
  }

  /* STAGED file */
  if (isStaged && !isDirectory) {
    items = [
      { label: 'Unstage', testId: 'git-ctx-unstage', action: () => onUnstage?.(path), separatorAfter: true },
      { label: 'View Diff', testId: 'git-ctx-staged-diff', action: () => onOpenDiff?.(path) },
      { label: 'Open in Editor', testId: 'git-ctx-open-editor-staged', action: () => onOpenEditor?.(path) },
    ];
  }

  /* UNSTAGED directory */
  if (!isStaged && isDirectory) {
    items = [
      { label: 'Stage All', testId: 'git-ctx-stage-all', action: () => onStage?.(path) },
      {
        label: 'Discard All',
        testId: 'git-ctx-discard-all',
        action: () => {
          if (window.confirm('Discard all changes in ' + path + '?')) {
            onDiscard?.(path);
          }
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
