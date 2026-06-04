import type { DropdownMenuSubItem } from '../AppDropdownMenu';
import type { GitStashEntry } from '@ymir/shared';
import type { MenuContext } from './types';

// ---------------------------------------------------------------------------
// Params specific to the Stash sub-menu
// ---------------------------------------------------------------------------

export interface StashMenuParams {
  onStashPush: (options?: { includeUntracked?: boolean }) => Promise<string>;
  onStashApply: (stashRef?: string) => Promise<void>;
  onStashPop: (stashRef?: string) => Promise<void>;
  onStashDrop: (stashRef: string) => Promise<void>;
  onStashClear: () => Promise<void>;
  onFetchStashList: () => Promise<GitStashEntry[]>;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function stashMenuItems(ctx: MenuContext, params: StashMenuParams): DropdownMenuSubItem {
  const { confirm, doAction, pickItem } = ctx;
  const { onStashPush, onStashApply, onStashPop, onStashDrop, onStashClear, onFetchStashList } =
    params;

  return {
    label: 'Stash',
    testId: 'git-repo-menu-stash-sub',
    items: [
      {
        label: 'Stash',
        testId: 'git-repo-menu-stash-push',
        action: () => doAction('Stash', () => onStashPush()),
      },
      {
        label: 'Stash All',
        testId: 'git-repo-menu-stash-push-all',
        action: () => doAction('Stash All', () => onStashPush({ includeUntracked: true })),
        separatorAfter: true,
      },
      {
        label: 'Apply Latest',
        testId: 'git-repo-menu-stash-apply-latest',
        action: () => doAction('Apply Latest Stash', () => onStashApply()),
      },
      {
        label: 'Apply Stash...',
        testId: 'git-repo-menu-stash-apply',
        action: async () => {
          const stashes = await onFetchStashList();
          const items = stashes.map((s) => ({
            id: s.ref,
            label: s.message,
            description: s.ref,
          }));
          const selected = await pickItem('Apply stash', items);
          if (!selected) return;
          await doAction(`Apply stash ${selected}`, () => onStashApply(selected));
        },
      },
      {
        label: 'Pop Latest',
        testId: 'git-repo-menu-stash-pop-latest',
        action: () => doAction('Pop Latest Stash', () => onStashPop()),
      },
      {
        label: 'Pop Stash...',
        testId: 'git-repo-menu-stash-pop',
        action: async () => {
          const stashes = await onFetchStashList();
          const items = stashes.map((s) => ({
            id: s.ref,
            label: s.message,
            description: s.ref,
          }));
          const selected = await pickItem('Pop stash', items);
          if (!selected) return;
          await doAction(`Pop stash ${selected}`, () => onStashPop(selected));
        },
        separatorAfter: true,
      },
      {
        label: 'Drop Stash...',
        testId: 'git-repo-menu-stash-drop',
        action: async () => {
          const stashes = await onFetchStashList();
          const items = stashes.map((s) => ({
            id: s.ref,
            label: s.message,
            description: s.ref,
          }));
          const selected = await pickItem('Drop stash', items);
          if (!selected) return;
          const ok = await confirm({
            title: 'Drop Stash',
            message: `Drop stash "${selected}"?`,
            danger: true,
          });
          if (!ok) return;
          await doAction(`Drop stash ${selected}`, () => onStashDrop(selected));
        },
        separatorAfter: true,
      },
      {
        label: 'Drop All Stashes...',
        testId: 'git-repo-menu-stash-clear',
        destructive: true,
        action: async () => {
          const ok = await confirm({
            title: 'Drop All Stashes',
            message: 'This will permanently remove all stashes. This cannot be undone.',
            danger: true,
          });
          if (!ok) return;
          await doAction('Drop All Stashes', onStashClear);
        },
      },
    ],
  };
}
