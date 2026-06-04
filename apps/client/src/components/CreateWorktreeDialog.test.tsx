/// <reference lib="dom" />
import { setupTestDom, setupAllMocks, setReactInputValue } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

let mockMutationState = {
  mutateAsync: mock(async (_vars: unknown) => ({})),
  isPending: false,
  isError: false,
  error: null as Error | null,
};

const mockUseCreateWorktree = mock(() => ({ ...mockMutationState }));

let mockCopyFilesData: { configuredFiles: string[]; untrackedFiles: string[] } | undefined = {
  configuredFiles: ['config.json', '.env.example'],
  untrackedFiles: ['temp.log'],
};

let mockCopyFilesLoading = false;

const mockUseWorktreeCopyFiles = mock(() => ({
  data: mockCopyFilesData,
  isLoading: mockCopyFilesLoading,
}));

mock.module('../hooks/useWorkspaces', () => ({
  useCreateWorktree: mockUseCreateWorktree,
  useWorktreeCopyFiles: mockUseWorktreeCopyFiles,
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { CreateWorktreeDialog } = await import('./CreateWorktreeDialog');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

function renderDialog(
  overrides: {
    open?: boolean;
    workspaceId?: string | null;
    onClose?: () => void;
    onCreated?: () => void;
  } = {},
) {
  const onClose = overrides.onClose ?? mock(() => {});
  const onCreated = overrides.onCreated ?? mock(() => {});
  const workspaceId = 'workspaceId' in overrides ? overrides.workspaceId : 'ws-1';

  const result = render(
    React.createElement(CreateWorktreeDialog, {
      open: overrides.open ?? true,
      onClose,
      onCreated,
      workspaceId,
      workspaceCwd: '/path/to/workspace',
    }),
  );

  return { ...result, onClose, onCreated };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateWorktreeDialog', () => {
  afterEach(() => {
    cleanup();
    mockMutationState = {
      mutateAsync: mock(async () => ({})),
      isPending: false,
      isError: false,
      error: null,
    };
    mockCopyFilesData = {
      configuredFiles: ['config.json', '.env.example'],
      untrackedFiles: ['temp.log'],
    };
    mockCopyFilesLoading = false;
  });

  // -----------------------------------------------------------------------
  // 1. Renders dialog with form fields
  // -----------------------------------------------------------------------
  test('renders dialog with form fields', () => {
    const { getByTestId, getByLabelText } = renderDialog();

    expect(getByTestId('create-worktree-dialog')).toBeTruthy();
    expect(getByLabelText('Branch Name')).toBeTruthy();
    expect(getByLabelText('Base Ref')).toBeTruthy();
    expect(getByTestId('create-worktree-cancel')).toBeTruthy();
    expect(getByTestId('create-worktree-submit')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 1b. Renders file copy section with configured and untracked files
  // -----------------------------------------------------------------------
  test('renders file copy section with files', () => {
    const { getByText } = renderDialog();

    expect(getByText('Files to Copy')).toBeTruthy();
    expect(getByText('config.json')).toBeTruthy();
    expect(getByText('.env.example')).toBeTruthy();
    expect(getByText('temp.log')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 1c. Shows loading state for files
  // -----------------------------------------------------------------------
  test('shows loading state for file list', () => {
    mockCopyFilesLoading = true;

    const { getByText } = renderDialog();

    expect(getByText('Loading files…')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 1d. Shows empty state when no files
  // -----------------------------------------------------------------------
  test('shows empty state when no files available', () => {
    mockCopyFilesData = { configuredFiles: [], untrackedFiles: [] };

    const { getByText } = renderDialog();

    expect(getByText('No untracked files')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Validates branch name input
  // -----------------------------------------------------------------------
  test('shows validation error for invalid branch name', () => {
    const { getByLabelText, getByText } = renderDialog();

    const branchInput = getByLabelText('Branch Name') as HTMLInputElement;
    setReactInputValue(branchInput, 'branch@invalid');
    // Blur to trigger touched state
    act(() => {
      fireEvent.blur(branchInput);
    });

    expect(
      getByText('Branch name can only contain letters, numbers, /, ., spaces, _, and -'),
    ).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2b. Valid branch name does not show error
  // -----------------------------------------------------------------------
  test('does not show validation error for valid branch name', () => {
    const { getByLabelText, queryByText } = renderDialog();

    const branchInput = getByLabelText('Branch Name') as HTMLInputElement;
    setReactInputValue(branchInput, 'my-feature');
    act(() => {
      fireEvent.blur(branchInput);
    });

    expect(
      queryByText('Branch name can only contain letters, numbers, /, ., spaces, _, and -'),
    ).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2c. Accepts valid characters: slash, dot, space, underscore, hyphen
  // -----------------------------------------------------------------------
  test('accepts branch names with valid special characters', () => {
    const { getByLabelText, queryByText } = renderDialog();

    const branchInput = getByLabelText('Branch Name') as HTMLInputElement;
    setReactInputValue(branchInput, 'feature/sub-branch_v2.0');
    act(() => {
      fireEvent.blur(branchInput);
    });

    expect(
      queryByText('Branch name can only contain letters, numbers, /, ., spaces, _, and -'),
    ).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. Submits form with correct data
  // -----------------------------------------------------------------------
  test('submits form with branch name and calls onCreated', async () => {
    const onCreated = mock(() => {});
    const mutateAsync = mock(async () => ({}));
    mockMutationState.mutateAsync = mutateAsync;

    const { getByLabelText, getByTestId } = renderDialog({ onCreated });

    const branchInput = getByLabelText('Branch Name') as HTMLInputElement;
    setReactInputValue(branchInput, 'my-feature');

    const baseRefInput = getByLabelText('Base Ref') as HTMLInputElement;
    setReactInputValue(baseRefInput, 'develop');

    await act(async () => {
      fireEvent.click(getByTestId('create-worktree-submit'));
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        branchName: 'my-feature',
        startRef: 'develop',
      }),
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 3b. Submits with filesToCopy from selection
  // -----------------------------------------------------------------------
  test('submits form with selected files', async () => {
    const mutateAsync = mock(async () => ({}));
    mockMutationState.mutateAsync = mutateAsync;

    const { getByLabelText, getByTestId, getByText } = renderDialog();

    const branchInput = getByLabelText('Branch Name') as HTMLInputElement;
    setReactInputValue(branchInput, 'my-feature');

    // Initially only configured files are selected (when configured files exist)
    // Deselect config.json, leaving only .env.example selected
    const configFileLabel = getByText('config.json').closest('label');
    expect(configFileLabel).toBeTruthy();
    const configFileCheckbox = configFileLabel!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    act(() => {
      fireEvent.click(configFileCheckbox);
    });

    // Also select temp.log (untracked file, not selected by default)
    const tempLogLabel = getByText('temp.log').closest('label');
    expect(tempLogLabel).toBeTruthy();
    const tempLogCheckbox = tempLogLabel!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    act(() => {
      fireEvent.click(tempLogCheckbox);
    });

    await act(async () => {
      fireEvent.click(getByTestId('create-worktree-submit'));
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const callArgs = mutateAsync.mock.calls[0][0] as {
      filesToCopy: string[];
    };
    expect(callArgs.filesToCopy).not.toContain('config.json');
    expect(callArgs.filesToCopy).toContain('.env.example');
    expect(callArgs.filesToCopy).toContain('temp.log');
  });

  // -----------------------------------------------------------------------
  // 4. Handles error responses
  // -----------------------------------------------------------------------
  test('displays error message when mutation fails', () => {
    mockMutationState = {
      ...mockMutationState,
      isError: true,
      error: new Error('Worktree creation failed: branch already exists'),
    };

    const { getByTestId, getByText } = renderDialog();

    expect(getByTestId('create-worktree-error')).toBeTruthy();
    expect(getByText('Worktree creation failed: branch already exists')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 4b. Shows generic error when error is not an Error instance
  // -----------------------------------------------------------------------
  test('shows generic error message for non-Error errors', () => {
    mockMutationState = {
      ...mockMutationState,
      isError: true,
      error: 'string error' as unknown as Error,
    };

    const { getByTestId, getByText } = renderDialog();

    expect(getByTestId('create-worktree-error')).toBeTruthy();
    expect(getByText('Failed to create worktree')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 5. Disables submit while loading
  // -----------------------------------------------------------------------
  test('disables submit button while mutation is pending', () => {
    mockMutationState = {
      ...mockMutationState,
      isPending: true,
    };

    const { getByTestId } = renderDialog();

    const submitBtn = getByTestId('create-worktree-submit') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toContain('Creating…');
  });

  // -----------------------------------------------------------------------
  // 5b. Disables submit when branch name is empty
  // -----------------------------------------------------------------------
  test('disables submit when branch name is empty', () => {
    const { getByTestId } = renderDialog();

    const submitBtn = getByTestId('create-worktree-submit') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 5c. Disables submit when workspaceId is null
  // -----------------------------------------------------------------------
  test('disables submit when workspaceId is null', () => {
    const { getByTestId, getByLabelText } = renderDialog({ workspaceId: null });

    const branchInput = getByLabelText('Branch Name') as HTMLInputElement;
    setReactInputValue(branchInput, 'my-feature');

    const submitBtn = getByTestId('create-worktree-submit') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Cancel calls onClose
  // -----------------------------------------------------------------------
  test('cancel button calls onClose', () => {
    const onClose = mock(() => {});
    const { getByTestId } = renderDialog({ onClose });

    fireEvent.click(getByTestId('create-worktree-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Does not render when open is false
  // -----------------------------------------------------------------------
  test('does not render when open is false', () => {
    const { queryByTestId } = renderDialog({ open: false });

    expect(queryByTestId('create-worktree-dialog')).toBeNull();
  });
});
