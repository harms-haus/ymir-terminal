import { useState, useCallback, useMemo } from 'react';
import type {
  GitRepoInfo,
  GitBranch,
  GitStatusResponse,
  GitStashEntry,
  GitRemoteEntry,
} from '@ymir/shared';
import { AppDropdownMenu } from './AppDropdownMenu';
import type { DropdownMenuEntry } from './AppDropdownMenu';
import { GenericPicker } from './GenericPicker';
import type { PickerItem } from './GenericPicker';
import { useConfirm, usePrompt } from '../hooks/useDialog';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GitRepoMenuProps {
  repoInfo: GitRepoInfo;
  branches: GitBranch[];
  status: GitStatusResponse | undefined;
  isRebaseInProgress: boolean;
  children: React.ReactNode;
  // Action callbacks:
  onPull: (rebase?: boolean) => Promise<void>;
  onPush: (branch: string) => Promise<void>;
  onFetch: () => Promise<void>;
  onSync: (branch: string) => Promise<void>;
  onCommitAmend: (options?: { message?: string; noEdit?: boolean }) => Promise<string>;
  onCommitAll: (
    message: string,
    options?: { includeUntracked?: boolean; amend?: boolean },
  ) => Promise<string>;
  onResetSoft: () => Promise<void>;
  onRebaseAbort: () => Promise<void>;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  onDiscardAll: () => Promise<void>;
  onMerge: (branch: string) => Promise<string>;
  onRebase: (branch: string) => Promise<string>;
  onCreateBranch: (name: string) => Promise<void>;
  onCreateBranchFrom: (name: string, startPoint: string) => Promise<void>;
  onRenameBranch: (oldName: string, newName: string) => Promise<void>;
  onDeleteBranch: (name: string) => Promise<void>;
  onDeleteRemoteBranch: (remote: string, branch: string) => Promise<void>;
  onPublishBranch: () => Promise<void>;
  onRemoteAdd: (name: string, url: string) => Promise<void>;
  onRemoteRemove: (name: string) => Promise<void>;
  onStashPush: (options?: { includeUntracked?: boolean }) => Promise<string>;
  onStashApply: (stashRef?: string) => Promise<void>;
  onStashPop: (stashRef?: string) => Promise<void>;
  onStashDrop: (stashRef: string) => Promise<void>;
  onStashClear: () => Promise<void>;
  onFetchStashList: () => Promise<GitStashEntry[]>;
  onFetchRemoteList: () => Promise<GitRemoteEntry[]>;
  onFetchRemoteBranches: () => Promise<GitBranch[]>;
}

// ---------------------------------------------------------------------------
// Internal picker state
// ---------------------------------------------------------------------------

interface PickerState {
  open: boolean;
  title: string;
  items: PickerItem[];
  resolve: ((value: string | null) => void) | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GitRepoMenu({
  repoInfo,
  branches,
  status,
  isRebaseInProgress,
  children,
  onPull,
  onPush,
  onFetch,
  onSync,
  onCommitAmend,
  onCommitAll,
  onResetSoft,
  onRebaseAbort,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  onMerge,
  onRebase,
  onCreateBranch,
  onCreateBranchFrom,
  onRenameBranch,
  onDeleteBranch,
  onDeleteRemoteBranch,
  onPublishBranch,
  onRemoteAdd,
  onRemoteRemove,
  onStashPush,
  onStashApply,
  onStashPop,
  onStashDrop,
  onStashClear,
  onFetchStashList,
  onFetchRemoteList,
  onFetchRemoteBranches,
}: GitRepoMenuProps) {
  const confirm = useConfirm();
  const prompt = usePrompt();

  const [pickerState, setPickerState] = useState<PickerState>({
    open: false,
    title: '',
    items: [],
    resolve: null,
  });

  const pickItem = useCallback(
    (title: string, items: PickerItem[]): Promise<string | null> => {
      return new Promise((resolve) =>
        setPickerState({ open: true, title, items, resolve }),
      );
    },
    [],
  );

  const doAction = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        toast.success(label);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : `${label} failed`;
        toast.error(message);
      }
    },
    [],
  );

  const hasRemote = repoInfo.hasRemote;
  const branch = repoInfo.branch;

  const nonCurrentBranches = useMemo(
    () => branches.filter((b) => !b.isCurrent),
    [branches],
  );

  const branchPickerItems = useMemo(
    () =>
      nonCurrentBranches.map((b) => ({
        id: b.name,
        label: b.name,
      })),
    [nonCurrentBranches],
  );

  const items = useMemo<DropdownMenuEntry[]>(
    () => [
      // ── Commit submenu ─────────────────────────────────────────────────
      {
        label: 'Commit',
        testId: 'git-repo-menu-commit-sub',
        items: [
          {
            label: 'Commit',
            testId: 'git-repo-menu-commit',
            action: () => toast.info('Use the commit input above'),
          },
          {
            label: 'Commit Staged',
            testId: 'git-repo-menu-commit-staged',
            action: async () => {
              const msg = await prompt({
                title: 'Commit Staged',
                message: 'Enter commit message',
              });
              if (msg == null) return;
              await doAction('Commit Staged', () =>
                onCommitAll(msg, { includeUntracked: false }),
              );
            },
          },
          {
            label: 'Commit All',
            testId: 'git-repo-menu-commit-all',
            action: async () => {
              const msg = await prompt({
                title: 'Commit All',
                message: 'Enter commit message',
              });
              if (msg == null) return;
              await doAction('Commit All', () =>
                onCommitAll(msg, { includeUntracked: true }),
              );
            },
            separatorAfter: true,
          },
          {
            label: 'Undo Last Commit',
            testId: 'git-repo-menu-undo-commit',
            destructive: true,
            action: async () => {
              const ok = await confirm({
                title: 'Undo Last Commit',
                message: 'This will soft-reset the last commit, keeping changes staged.',
                danger: true,
              });
              if (!ok) return;
              await doAction('Undo Last Commit', onResetSoft);
            },
          },
          {
            label: 'Abort Rebase',
            testId: 'git-repo-menu-abort-rebase',
            disabled: !isRebaseInProgress,
            action: () => doAction('Abort Rebase', onRebaseAbort),
          },
          {
            label: 'Commit (Amend)',
            testId: 'git-repo-menu-commit-amend',
            action: async () => {
              const ok = await confirm({
                title: 'Amend Commit',
                message: 'Amend the previous commit without editing the message?',
              });
              if (!ok) return;
              await doAction('Commit (Amend)', () =>
                onCommitAmend({ noEdit: true }),
              );
            },
          },
          {
            label: 'Commit Staged (Amend)',
            testId: 'git-repo-menu-commit-staged-amend',
            action: async () => {
              const msg = await prompt({
                title: 'Commit Staged (Amend)',
                message: 'Enter commit message',
              });
              if (msg == null) return;
              await doAction('Commit Staged (Amend)', () =>
                onCommitAll(msg, { includeUntracked: false, amend: true }),
              );
            },
          },
          {
            label: 'Commit All (Amend)',
            testId: 'git-repo-menu-commit-all-amend',
            action: async () => {
              const msg = await prompt({
                title: 'Commit All (Amend)',
                message: 'Enter commit message',
              });
              if (msg == null) return;
              await doAction('Commit All (Amend)', () =>
                onCommitAll(msg, { includeUntracked: true, amend: true }),
              );
            },
          },
        ],
      },

      // ── Changes submenu ─────────────────────────────────────────────────
      {
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
            disabled: !(status?.staged?.length),
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
      },

      // ── Pull, Push submenu ──────────────────────────────────────────────
      {
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
      },

      // ── Branch submenu ──────────────────────────────────────────────────
      {
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
              const selected = await pickItem(
                'Rebase onto branch',
                branchPickerItems,
              );
              if (!selected) return;
              await doAction(`Rebase onto ${selected}`, () =>
                onRebase(selected),
              );
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
              await doAction(`Create branch ${name}`, () =>
                onCreateBranch(name),
              );
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
              const base = await pickItem(
                'Select base branch',
                branchPickerItems,
              );
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
              const selected = await pickItem(
                'Delete branch',
                branchPickerItems,
              );
              if (!selected) return;
              const ok = await confirm({
                title: 'Delete Branch',
                message: `Delete branch "${selected}"?`,
                danger: true,
              });
              if (!ok) return;
              await doAction(`Delete branch ${selected}`, () =>
                onDeleteBranch(selected),
              );
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
      },

      // ── Remote submenu ──────────────────────────────────────────────────
      {
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
              await doAction(`Add remote ${name}`, () =>
                onRemoteAdd(name, url),
              );
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
              await doAction(`Remove remote ${selected}`, () =>
                onRemoteRemove(selected),
              );
            },
          },
        ],
      },

      // ── Stash submenu ───────────────────────────────────────────────────
      {
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
            action: () =>
              doAction('Stash All', () =>
                onStashPush({ includeUntracked: true }),
              ),
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
              await doAction(`Apply stash ${selected}`, () =>
                onStashApply(selected),
              );
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
              await doAction(`Pop stash ${selected}`, () =>
                onStashPop(selected),
              );
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
              await doAction(`Drop stash ${selected}`, () =>
                onStashDrop(selected),
              );
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
      },
    ],
    [
      branch,
      branches,
      branchPickerItems,
      confirm,
      doAction,
      hasRemote,
      isRebaseInProgress,
      onCommitAll,
      onCommitAmend,
      onCreateBranch,
      onCreateBranchFrom,
      onDeleteBranch,
      onDeleteRemoteBranch,
      onDiscardAll,
      onFetch,
      onFetchRemoteBranches,
      onFetchRemoteList,
      onFetchStashList,
      onMerge,
      onPull,
      onPublishBranch,
      onPush,
      onRebase,
      onRebaseAbort,
      onRemoteAdd,
      onRemoteRemove,
      onRenameBranch,
      onResetSoft,
      onStageAll,
      onStashApply,
      onStashClear,
      onStashDrop,
      onStashPop,
      onStashPush,
      onSync,
      onUnstageAll,
      pickItem,
      prompt,
      status?.staged?.length,
    ],
  );

  return (
    <>
      <AppDropdownMenu items={items} testId="git-repo-menu">
        {children}
      </AppDropdownMenu>
      <GenericPicker
        open={pickerState.open}
        onClose={() => {
          pickerState.resolve?.(null);
          setPickerState((prev) => ({ ...prev, open: false, resolve: null }));
        }}
        onSelect={(item) => {
          pickerState.resolve?.(item.id);
          setPickerState((prev) => ({ ...prev, open: false, resolve: null }));
        }}
        title={pickerState.title}
        items={pickerState.items}
      />
    </>
  );
}
