import type { DropdownMenuSubItem } from '../AppDropdownMenu';
import type { MenuContext } from './types';

// ---------------------------------------------------------------------------
// Params specific to the Commit sub-menu
// ---------------------------------------------------------------------------

export interface CommitMenuParams {
  isRebaseInProgress: boolean;
  onCommitAll: (
    message: string,
    options?: { includeUntracked?: boolean; amend?: boolean },
  ) => Promise<string>;
  onCommitAmend: (options?: { message?: string; noEdit?: boolean }) => Promise<string>;
  onResetSoft: () => Promise<void>;
  onRebaseAbort: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function commitMenuItems(ctx: MenuContext, params: CommitMenuParams): DropdownMenuSubItem {
  const { confirm, prompt, doAction } = ctx;
  const { isRebaseInProgress, onCommitAll, onCommitAmend, onResetSoft, onRebaseAbort } = params;

  return {
    label: 'Commit',
    testId: 'git-repo-menu-commit-sub',
    items: [
      {
        label: 'Commit Staged',
        testId: 'git-repo-menu-commit-staged',
        action: async () => {
          const msg = await prompt({
            title: 'Commit Staged',
            message: 'Enter commit message',
          });
          if (msg == null) return;
          await doAction('Commit Staged', () => onCommitAll(msg, { includeUntracked: false }));
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
          await doAction('Commit All', () => onCommitAll(msg, { includeUntracked: true }));
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
          await doAction('Commit (Amend)', () => onCommitAmend({ noEdit: true }));
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
  };
}
