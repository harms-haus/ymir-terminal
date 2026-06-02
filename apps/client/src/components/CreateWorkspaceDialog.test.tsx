/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, within, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useCreateWorkspace
// ---------------------------------------------------------------------------

const mockMutateAsync = mock(() =>
  Promise.resolve({
    workspace: { id: 'ws-new', name: 'New', cwd: '/new', color: '#007acc', sortOrder: 0 },
  }),
);

const mockUseCreateWorkspace = mock(() => ({
  mutateAsync: mockMutateAsync,
  isPending: false,
  isError: false,
  error: null,
}));

mock.module('../hooks/useWorkspaces', () => ({
  useCreateWorkspace: mockUseCreateWorkspace,
  useWorktreeCopyFiles: mock(() => ({ data: null, isLoading: false })),
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { CreateWorkspaceDialog } = await import('./CreateWorkspaceDialog');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(
  overrides: { open?: boolean; onClose?: () => void; onCreated?: () => void } = {},
) {
  const onClose = overrides.onClose ?? mock(() => {});
  const onCreated = overrides.onCreated ?? mock(() => {});

  render(
    React.createElement(CreateWorkspaceDialog, {
      open: overrides.open ?? true,
      onClose,
      onCreated,
    }),
  );

  return { onClose, onCreated };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('CreateWorkspaceDialog', () => {
  beforeEach(() => {
    mockMutateAsync.mockClear();
    mockUseCreateWorkspace.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders when open={true}
  // -----------------------------------------------------------------------
  test('renders when open={true}', () => {
    renderDialog({ open: true });

    expect(within(document.body).getByTestId('create-workspace-dialog')).toBeTruthy();
    expect(within(document.body).getByText('Create Workspace')).toBeTruthy();
    expect(within(document.body).getByTestId('create-workspace-cancel')).toBeTruthy();
    expect(within(document.body).getByTestId('create-workspace-submit')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Does not render content when open={false}
  // -----------------------------------------------------------------------
  test('does not render content when open={false}', () => {
    renderDialog({ open: false });

    expect(within(document.body).queryByTestId('create-workspace-dialog')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. Calls onClose when cancel button is clicked
  // -----------------------------------------------------------------------
  test('calls onClose when cancel button is clicked', () => {
    const onClose = mock(() => {});
    renderDialog({ open: true, onClose });

    fireEvent.click(within(document.body).getByTestId('create-workspace-cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
