/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

let mockCopyFilesData: { configuredFiles: string[]; untrackedFiles: string[] } | undefined = {
  configuredFiles: ['config.json', '.env.example'],
  untrackedFiles: ['temp.log'],
};

const mockUseWorktreeCopyFiles = mock(() => ({
  data: mockCopyFilesData,
  isLoading: false,
}));

mock.module('../hooks/useWorkspaces', () => ({
  useWorktreeCopyFiles: mockUseWorktreeCopyFiles,
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { MergeWorktreeDialog } = await import('./MergeWorktreeDialog');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

/**
 * The Dialog component renders via createPortal to document.body, so
 * container.querySelector() won't find portal content. This helper queries
 * the entire document.body for elements inside the dialog.
 */
function queryFromBody(selector: string): HTMLElement | null {
  return document.body.querySelector(selector);
}

function renderDialog(
  overrides: {
    open?: boolean;
    onClose?: () => void;
    onConfirm?: (opts: { deleteAfterMerge: boolean; filesToCopy: string[] }) => void;
    branchName?: string;
    targetBranch?: string;
    isLoading?: boolean;
    worktreePath?: string;
    workspaceId?: string;
  } = {},
) {
  const onClose = overrides.onClose ?? mock(() => {});
  const onConfirm = overrides.onConfirm ?? mock(() => {});

  const result = render(
    React.createElement(MergeWorktreeDialog, {
      open: overrides.open ?? true,
      onClose,
      onConfirm,
      branchName: overrides.branchName ?? 'feature/my-work',
      targetBranch: overrides.targetBranch ?? 'main',
      isLoading: overrides.isLoading ?? false,
      worktreePath: overrides.worktreePath ?? '/worktrees/feature-my-work',
      workspaceId: overrides.workspaceId ?? 'ws-1',
    }),
  );

  return { ...result, onClose, onConfirm };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MergeWorktreeDialog', () => {
  afterEach(() => {
    cleanup();
    mockCopyFilesData = {
      configuredFiles: ['config.json', '.env.example'],
      untrackedFiles: ['temp.log'],
    };
  });

  // -----------------------------------------------------------------------
  // 1. Renders dialog with file copy config
  // -----------------------------------------------------------------------
  test('renders dialog with merge message and branch names', () => {
    const { getByText } = renderDialog();

    expect(getByText('Merge Worktree')).toBeTruthy();
    expect(getByText(/feature\/my-work/)).toBeTruthy();
    expect(getByText(/main/)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 1b. Renders file list with configured and untracked files
  // -----------------------------------------------------------------------
  test('renders file list with configured and untracked files', () => {
    const { getByText } = renderDialog();

    expect(getByText('Files to copy to target')).toBeTruthy();
    expect(getByText('config.json')).toBeTruthy();
    expect(getByText('.env.example')).toBeTruthy();
    expect(getByText('temp.log')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 1c. Configured files selected by default (untracked not selected)
  // -----------------------------------------------------------------------
  test('configured files are selected by default, untracked files are not', () => {
    renderDialog();

    // Query from document.body because Dialog renders via portal
    const configFileCb = queryFromBody('#worktree-copy-file-config\\.json') as HTMLInputElement;
    const envFileCb = queryFromBody('#worktree-copy-file-\\.env\\.example') as HTMLInputElement;
    const tempFileCb = queryFromBody('#worktree-copy-file-temp\\.log') as HTMLInputElement;

    expect(configFileCb).toBeTruthy();
    expect(envFileCb).toBeTruthy();
    expect(tempFileCb).toBeTruthy();

    // Configured files are selected
    expect(configFileCb.checked).toBe(true);
    expect(envFileCb.checked).toBe(true);
    // Untracked file is NOT selected by default (only configured files are)
    expect(tempFileCb.checked).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 1d. Delete after merge checkbox is unchecked by default
  // -----------------------------------------------------------------------
  test('delete after merge checkbox is unchecked by default', () => {
    renderDialog();

    const checkbox = queryFromBody('#worktree-delete-after-merge') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 1e. Shows empty state when no files
  // -----------------------------------------------------------------------
  test('shows empty state when no files available', () => {
    mockCopyFilesData = { configuredFiles: [], untrackedFiles: [] };

    const { getByText } = renderDialog();

    expect(getByText('No untracked files')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 1f. Hides file section entirely when no files and copyFiles not loaded
  // -----------------------------------------------------------------------
  test('hides file section when copyFiles data is undefined', () => {
    mockCopyFilesData = undefined;

    const { queryByText } = renderDialog();

    expect(queryByText('Files to copy to target')).toBeNull();
    expect(queryByText('No untracked files')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. Submits merge request
  // -----------------------------------------------------------------------
  test('calls onConfirm with selected files and deleteAfterMerge=false by default', async () => {
    const onConfirm = mock(() => {});
    const { getByTestId } = renderDialog({ onConfirm });

    await act(async () => {
      fireEvent.click(getByTestId('merge-worktree-confirm'));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Only configured files are selected by default
    expect(onConfirm).toHaveBeenCalledWith({
      deleteAfterMerge: false,
      filesToCopy: ['config.json', '.env.example'],
    });
  });

  // -----------------------------------------------------------------------
  // 2b. Submits with deleteAfterMerge enabled
  // -----------------------------------------------------------------------
  test('submits with deleteAfterMerge when checkbox is checked', async () => {
    const onConfirm = mock(() => {});
    const { getByTestId } = renderDialog({ onConfirm });

    const deleteCheckbox = queryFromBody('#worktree-delete-after-merge') as HTMLInputElement;
    act(() => {
      fireEvent.click(deleteCheckbox);
    });

    await act(async () => {
      fireEvent.click(getByTestId('merge-worktree-confirm'));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ deleteAfterMerge: true }));
  });

  // -----------------------------------------------------------------------
  // 2c. Submits with modified file selection
  // -----------------------------------------------------------------------
  test('submits with only selected files after deselecting one', async () => {
    const onConfirm = mock(() => {});
    const { getByTestId } = renderDialog({ onConfirm });

    // Deselect config.json — use getElementById to avoid CSS selector escaping issues
    const configFileCb = document.getElementById(
      'worktree-copy-file-config.json',
    ) as HTMLInputElement;
    expect(configFileCb).toBeTruthy();
    act(() => {
      fireEvent.click(configFileCb);
    });

    // Select temp.log (untracked, not selected by default)
    const tempFileCb = document.getElementById('worktree-copy-file-temp.log') as HTMLInputElement;
    expect(tempFileCb).toBeTruthy();
    act(() => {
      fireEvent.click(tempFileCb);
    });

    await act(async () => {
      fireEvent.click(getByTestId('merge-worktree-confirm'));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const callArgs = onConfirm.mock.calls[0][0] as {
      filesToCopy: string[];
    };
    expect(callArgs.filesToCopy).not.toContain('config.json');
    expect(callArgs.filesToCopy).toContain('.env.example');
    expect(callArgs.filesToCopy).toContain('temp.log');
  });

  // -----------------------------------------------------------------------
  // 3. Handles conflict errors (loading state)
  // -----------------------------------------------------------------------
  test('disables buttons and shows loading when isLoading is true', () => {
    const { getByTestId } = renderDialog({ isLoading: true });

    const confirmBtn = getByTestId('merge-worktree-confirm') as HTMLButtonElement;
    const cancelBtn = getByTestId('merge-worktree-cancel') as HTMLButtonElement;

    expect(confirmBtn.disabled).toBe(true);
    expect(cancelBtn.disabled).toBe(true);
    expect(confirmBtn.textContent).toContain('Merging…');
  });

  // -----------------------------------------------------------------------
  // 3b. File checkboxes are disabled when loading
  // -----------------------------------------------------------------------
  test('disables file checkboxes when isLoading is true', () => {
    renderDialog({ isLoading: true });

    const configFileCb = queryFromBody('#worktree-copy-file-config\\.json') as HTMLInputElement;
    const envFileCb = queryFromBody('#worktree-copy-file-\\.env\\.example') as HTMLInputElement;
    const tempFileCb = queryFromBody('#worktree-copy-file-temp\\.log') as HTMLInputElement;

    expect(configFileCb.disabled).toBe(true);
    expect(envFileCb.disabled).toBe(true);
    expect(tempFileCb.disabled).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 4. Shows force option (delete after merge)
  // -----------------------------------------------------------------------
  test('renders delete after merge checkbox', () => {
    renderDialog();

    const checkbox = queryFromBody('#worktree-delete-after-merge') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.type).toBe('checkbox');

    const label = queryFromBody('label[for="worktree-delete-after-merge"]');
    expect(label).toBeTruthy();
    expect(label!.textContent).toContain('Delete worktree after merge');
  });

  // -----------------------------------------------------------------------
  // 4b. Toggle delete after merge checkbox
  // -----------------------------------------------------------------------
  test('toggles delete after merge checkbox', () => {
    renderDialog();

    const checkbox = queryFromBody('#worktree-delete-after-merge') as HTMLInputElement;

    expect(checkbox.checked).toBe(false);
    act(() => {
      fireEvent.click(checkbox);
    });
    expect(checkbox.checked).toBe(true);
    act(() => {
      fireEvent.click(checkbox);
    });
    expect(checkbox.checked).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Cancel calls onClose
  // -----------------------------------------------------------------------
  test('cancel button calls onClose', () => {
    const onClose = mock(() => {});
    const { getByTestId } = renderDialog({ onClose });

    fireEvent.click(getByTestId('merge-worktree-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Cancel button is disabled when loading
  // -----------------------------------------------------------------------
  test('cancel button is disabled when isLoading is true', () => {
    const onClose = mock(() => {});
    const { getByTestId } = renderDialog({ onClose, isLoading: true });

    const cancelBtn = getByTestId('merge-worktree-cancel') as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(true);

    fireEvent.click(cancelBtn);
    expect(onClose).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Does not render when open is false
  // -----------------------------------------------------------------------
  test('does not render when open is false', () => {
    const { queryByTestId } = renderDialog({ open: false });

    expect(queryByTestId('merge-worktree-dialog')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Shows configured files before untracked files
  // -----------------------------------------------------------------------
  test('shows configured files before untracked files', () => {
    const { getByText } = renderDialog();

    // Get all text nodes for file names within the file list section
    // The component renders: configured files first, then untracked files
    // Verify by checking DOM order
    const configNode = getByText('config.json');
    const envNode = getByText('.env.example');
    const tempNode = getByText('temp.log');

    // Compare document positions: configured files should appear before untracked
    const configPos = configNode.compareDocumentPosition(tempNode);
    // DOCUMENT_POSITION_FOLLOWING (4) means configNode comes before tempNode
    expect(configPos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const envPos = envNode.compareDocumentPosition(tempNode);
    expect(envPos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
