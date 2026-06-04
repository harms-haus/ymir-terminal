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
import type { MenuContext } from './git-menu/types';
import { commitMenuItems } from './git-menu/commitMenuItems';
import { changesMenuItems } from './git-menu/changesMenuItems';
import { pullPushMenuItems } from './git-menu/pullPushMenuItems';
import { branchMenuItems } from './git-menu/branchMenuItems';
import { remoteMenuItems } from './git-menu/remoteMenuItems';
import { stashMenuItems } from './git-menu/stashMenuItems';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GitRepoMenuProps {
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

  const pickItem = useCallback((title: string, items: PickerItem[]): Promise<string | null> => {
    return new Promise((resolve) => setPickerState({ open: true, title, items, resolve }));
  }, []);

  const doAction = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.success(label);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `${label} failed`;
      toast.error(message);
    }
  }, []);

  const hasRemote = repoInfo.hasRemote;
  const branch = repoInfo.branch;

  const nonCurrentBranches = useMemo(() => branches.filter((b) => !b.isCurrent), [branches]);

  const branchPickerItems = useMemo(
    () =>
      nonCurrentBranches.map((b) => ({
        id: b.name,
        label: b.name,
      })),
    [nonCurrentBranches],
  );

  // Shared context for all menu builders
  const menuCtx: MenuContext = useMemo(
    () => ({ confirm, prompt, doAction, pickItem }),
    [confirm, prompt, doAction, pickItem],
  );

  const items = useMemo<DropdownMenuEntry[]>(
    () => [
      commitMenuItems(menuCtx, {
        isRebaseInProgress,
        onCommitAll,
        onCommitAmend,
        onResetSoft,
        onRebaseAbort,
      }),
      changesMenuItems(menuCtx, {
        hasStaged: !!status?.staged?.length,
        onStageAll,
        onUnstageAll,
        onDiscardAll,
      }),
      pullPushMenuItems(menuCtx, {
        hasRemote,
        branch: branch ?? undefined,
        onPull,
        onPush,
        onFetch,
        onSync,
      }),
      branchMenuItems(menuCtx, {
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
      }),
      remoteMenuItems(menuCtx, {
        onRemoteAdd,
        onRemoteRemove,
        onFetchRemoteList,
      }),
      stashMenuItems(menuCtx, {
        onStashPush,
        onStashApply,
        onStashPop,
        onStashDrop,
        onStashClear,
        onFetchStashList,
      }),
    ],
    [
      menuCtx,
      branch,
      branches,
      branchPickerItems,
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
