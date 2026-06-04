import type { DropdownMenuSubItem } from '../AppDropdownMenu';
import type { GitRemoteEntry } from '@ymir/shared';
import type { MenuContext } from './types';

// ---------------------------------------------------------------------------
// Params specific to the Remote sub-menu
// ---------------------------------------------------------------------------

export interface RemoteMenuParams {
  onRemoteAdd: (name: string, url: string) => Promise<void>;
  onRemoteRemove: (name: string) => Promise<void>;
  onFetchRemoteList: () => Promise<GitRemoteEntry[]>;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function remoteMenuItems(ctx: MenuContext, params: RemoteMenuParams): DropdownMenuSubItem {
  const { confirm, prompt, doAction, pickItem } = ctx;
  const { onRemoteAdd, onRemoteRemove, onFetchRemoteList } = params;

  return {
    label: 'Remote',
    testId: 'git-repo-menu-remote-sub',
    items: [
      {
        label: 'Add...',
        testId: 'git-repo-menu-remote-add',
        action: async () => {
          const name = await prompt({
            title: 'Add Remote',
            message: 'Remote name',
          });
          if (!name) return;
          const url = await prompt({
            title: 'Add Remote',
            message: 'Remote URL',
          });
          if (!url) return;
          await doAction(`Add remote ${name}`, () => onRemoteAdd(name, url));
        },
      },
      {
        label: 'Remove...',
        testId: 'git-repo-menu-remote-remove',
        action: async () => {
          const remotes = await onFetchRemoteList();
          const items = remotes.map((r) => ({
            id: r.name,
            label: r.name,
            description: r.fetchUrl,
          }));
          const selected = await pickItem('Remove remote', items);
          if (!selected) return;
          const ok = await confirm({
            title: 'Remove Remote',
            message: `Remove remote "${selected}"?`,
            danger: true,
          });
          if (!ok) return;
          await doAction(`Remove remote ${selected}`, () => onRemoteRemove(selected));
        },
      },
    ],
  };
}
