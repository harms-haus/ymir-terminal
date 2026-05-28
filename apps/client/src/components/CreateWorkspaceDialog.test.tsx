/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useCreateWorkspace
// ---------------------------------------------------------------------------

const mockMutateAsync = mock(() =>
  Promise.resolve({ workspace: { id: 'ws-new', name: 'New', cwd: '/new', color: '#007acc' } }),
);

const mockUseCreateWorkspace = mock(() => ({
  mutateAsync: mockMutateAsync,
  isPending: false,
  isError: false,
  error: null,
}));

mock.module('../hooks/useWorkspaces', () => ({
  useCreateWorkspace: mockUseCreateWorkspace,
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

  const result = render(
    React.createElement(CreateWorkspaceDialog, {
      open: overrides.open ?? true,
      onClose,
      onCreated,
    }),
  );

  return { onClose, onCreated, ...result };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
    const { getByTestId, getByText } = renderDialog({ open: true });

    expect(getByTestId('create-workspace-dialog')).toBeTruthy();
    expect(getByText('Create Workspace')).toBeTruthy();
    expect(getByTestId('create-workspace-cancel')).toBeTruthy();
    expect(getByTestId('create-workspace-submit')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Does not render content when open={false}
  // -----------------------------------------------------------------------
  test('does not render content when open={false}', () => {
    const { queryByTestId } = renderDialog({ open: false });

    expect(queryByTestId('create-workspace-dialog')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. Calls onClose when cancel button is clicked
  // -----------------------------------------------------------------------
  test('calls onClose when cancel button is clicked', () => {
    const onClose = mock(() => {});
    const { getByTestId } = renderDialog({ open: true, onClose });

    fireEvent.click(getByTestId('create-workspace-cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
