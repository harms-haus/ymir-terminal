import type { DropdownMenuSubItem } from '../AppDropdownMenu';
import type { PickerItem } from '../GenericPicker';
import type { GitBranch } from '@ymir/shared';
import type { MenuContext } from './types';

// ---------------------------------------------------------------------------
// Params specific to the Branch sub-menu
// ---------------------------------------------------------------------------

export interface BranchMenuParams {
  hasRemote: boolean;
  branches: GitBranch[];
  branchPickerItems: PickerItem[];
  onMerge: (branch: string) => Promise<string>;
  onRebase: (branch: string) => Promise<string>;
  onCreateBranch: (name: string) => Promise<void>;
  onCreateBranchFrom: (name: string, startPoint: string) => Promise<void>;
  onRenameBranch: (oldName: string, newName: string) => Promise<void>;
  onDeleteBranch: (name: string) => Promise<void>;
  onDeleteRemoteBranch: (remote: string, branch: string) => Promise<void>;
  onPublishBranch: () => Promise<void>;
  onFetchRemoteBranches: () => Promise<GitBranch[]>;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function branchMenuItems(ctx: MenuContext, params: BranchMenuParams): DropdownMenuSubItem {
  const { confirm, prompt, doAction, pickItem } = ctx;
  const {
    hasRemote,
    branches,
    branchPickerItems,
    onMerge,
    onRebase,
    onCreateBranch,
    onCreateBranchFrom,
    onRenameBranch,
    onDeleteBranch,
    onDeleteRemoteBranch,
    onPublishBranch,
    onFetchRemoteBranches,
  } = params;

  return {
    label: 'Branch',
    testId: 'git-repo-menu-branch-sub',
    items: [
      {
        label: 'Merge...',
        testId: 'git-repo-menu-merge',
        action: async () => {
          const selected = await pickItem('Merge branch', branchPickerItems);
          if (!selected) return;
          await doAction(`Merge ${selected}`, () => onMerge(selected));
        },
      },
      {
        label: 'Rebase...',
        testId: 'git-repo-menu-rebase',
        action: async () => {
          const selected = await pickItem('Rebase onto branch', branchPickerItems);
          if (!selected) return;
          await doAction(`Rebase onto ${selected}`, () => onRebase(selected));
        },
      },
      {
        label: 'Create...',
        testId: 'git-repo-menu-branch-create',
        action: async () => {
          const name = await prompt({
            title: 'Create Branch',
            message: 'Enter branch name',
          });
          if (!name) return;
          await doAction(`Create branch ${name}`, () => onCreateBranch(name));
        },
        separatorAfter: true,
      },
      {
        label: 'Create from...',
        testId: 'git-repo-menu-branch-create-from',
        action: async () => {
          const name = await prompt({
            title: 'Create Branch from...',
            message: 'Enter new branch name',
          });
          if (!name) return;
          const base = await pickItem('Select base branch', branchPickerItems);
          if (!base) return;
          await doAction(`Create branch ${name} from ${base}`, () =>
            onCreateBranchFrom(name, base),
          );
        },
      },
      {
        label: 'Rename...',
        testId: 'git-repo-menu-branch-rename',
        action: async () => {
          const selected = await pickItem(
            'Rename branch',
            branches.map((b) => ({ id: b.name, label: b.name })),
          );
          if (!selected) return;
          const newName = await prompt({
            title: 'Rename Branch',
            message: `New name for ${selected}`,
          });
          if (!newName) return;
          await doAction(`Rename ${selected} → ${newName}`, () =>
            onRenameBranch(selected, newName),
          );
        },
      },
      {
        label: 'Delete...',
        testId: 'git-repo-menu-branch-delete',
        action: async () => {
          const selected = await pickItem('Delete branch', branchPickerItems);
          if (!selected) return;
          const ok = await confirm({
            title: 'Delete Branch',
            message: `Delete branch "${selected}"?`,
            danger: true,
          });
          if (!ok) return;
          await doAction(`Delete branch ${selected}`, () => onDeleteBranch(selected));
        },
      },
      {
        label: 'Delete Remote...',
        testId: 'git-repo-menu-branch-delete-remote',
        action: async () => {
          const remoteBranches = await onFetchRemoteBranches();
          const items = remoteBranches
            .filter((b) => b.isRemote)
            .map((b) => ({ id: b.name, label: b.name }));
          const selected = await pickItem('Delete remote branch', items);
          if (!selected) return;
          const slashIdx = selected.indexOf('/');
          if (slashIdx === -1) return;
          const remote = selected.slice(0, slashIdx);
          const ref = selected.slice(slashIdx + 1);
          const ok = await confirm({
            title: 'Delete Remote Branch',
            message: `Delete remote branch "${selected}"?`,
            danger: true,
          });
          if (!ok) return;
          await doAction(`Delete remote branch ${selected}`, () =>
            onDeleteRemoteBranch(remote, ref),
          );
        },
        separatorAfter: true,
      },
      {
        label: 'Publish',
        testId: 'git-repo-menu-branch-publish',
        disabled: !hasRemote,
        action: () => doAction('Publish branch', onPublishBranch),
      },
    ],
  };
}
