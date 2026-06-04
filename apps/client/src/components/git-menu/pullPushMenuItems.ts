import type { DropdownMenuSubItem } from '../AppDropdownMenu';
import type { MenuContext } from './types';

// ---------------------------------------------------------------------------
// Params specific to the Pull, Push sub-menu
// ---------------------------------------------------------------------------

export interface PullPushMenuParams {
  hasRemote: boolean;
  branch: string | undefined;
  onPull: (rebase?: boolean) => Promise<void>;
  onPush: (branch: string) => Promise<void>;
  onFetch: () => Promise<void>;
  onSync: (branch: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function pullPushMenuItems(
  ctx: MenuContext,
  params: PullPushMenuParams,
): DropdownMenuSubItem {
  const { doAction } = ctx;
  const { hasRemote, branch, onPull, onPush, onFetch, onSync } = params;

  return {
    label: 'Pull, Push',
    testId: 'git-repo-menu-pull-push-sub',
    items: [
      {
        label: 'Sync',
        testId: 'git-repo-menu-sync',
        disabled: !hasRemote || !branch,
        action: () => doAction('Sync', () => onSync(branch!)),
      },
      {
        label: 'Pull',
        testId: 'git-repo-menu-pull',
        disabled: !hasRemote,
        action: () => doAction('Pull', () => onPull()),
      },
      {
        label: 'Pull (Rebase)',
        testId: 'git-repo-menu-pull-rebase',
        disabled: !hasRemote,
        action: () => doAction('Pull (Rebase)', () => onPull(true)),
      },
      {
        label: 'Push',
        testId: 'git-repo-menu-push',
        disabled: !hasRemote || !branch,
        action: () => doAction('Push', () => onPush(branch!)),
      },
      {
        label: 'Fetch',
        testId: 'git-repo-menu-fetch',
        disabled: !hasRemote,
        action: () => doAction('Fetch', onFetch),
      },
    ],
  };
}
