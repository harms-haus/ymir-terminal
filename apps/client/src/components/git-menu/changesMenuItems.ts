import type { DropdownMenuSubItem } from '../AppDropdownMenu';
import type { MenuContext } from './types';

// ---------------------------------------------------------------------------
// Params specific to the Changes sub-menu
// ---------------------------------------------------------------------------

export interface ChangesMenuParams {
  hasStaged: boolean;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  onDiscardAll: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function changesMenuItems(ctx: MenuContext, params: ChangesMenuParams): DropdownMenuSubItem {
  const { confirm, doAction } = ctx;
  const { hasStaged, onStageAll, onUnstageAll, onDiscardAll } = params;

  return {
    label: 'Changes',
    testId: 'git-repo-menu-changes-sub',
    items: [
      {
        label: 'Stage All',
        testId: 'git-repo-menu-stage-all',
        action: () => doAction('Stage All', onStageAll),
      },
      {
        label: 'Unstage All',
        testId: 'git-repo-menu-unstage-all',
        disabled: !hasStaged,
        action: () => doAction('Unstage All', onUnstageAll),
        separatorAfter: true,
      },
      {
        label: 'Discard All',
        testId: 'git-repo-menu-discard-all',
        destructive: true,
        action: async () => {
          const ok = await confirm({
            title: 'Discard All Changes',
            message:
              'This will permanently discard ALL uncommitted changes. This cannot be undone.',
            danger: true,
          });
          if (!ok) return;
          await doAction('Discard All', onDiscardAll);
        },
      },
    ],
  };
}
