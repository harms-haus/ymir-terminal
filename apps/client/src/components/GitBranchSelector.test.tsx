/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';

await setupTestDom();
setupAllMocks();

import { describe, it, expect, mock, afterEach } from 'bun:test';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import type { GitBranch } from '@ymir/shared';

const { GitBranchSelector } = await import('./GitBranchSelector');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockBranches: GitBranch[] = [
  { name: 'main', isCurrent: true, isRemote: false },
  { name: 'develop', isCurrent: false, isRemote: false },
];

const onCheckout = mock(() => {});
const onCreateBranch = mock(() => {});

function renderSelector(overrides?: {
  branches?: GitBranch[];
  current?: string | null;
  disabled?: boolean;
}) {
  return render(
    React.createElement(GitBranchSelector, {
      branches: overrides?.branches ?? mockBranches,
      current: overrides?.current ?? 'main',
      onCheckout,
      onCreateBranch,
      disabled: overrides?.disabled,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitBranchSelector', () => {
  afterEach(() => {
    cleanup();
    onCheckout.mockClear();
    onCreateBranch.mockClear();
  });

  it('renders trigger with current branch name', () => {
    const { getByTestId } = renderSelector();
    const trigger = getByTestId('git-branch-selector');
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain('main');
  });

  it('clicking trigger opens dropdown', () => {
    const { getByTestId } = renderSelector();
    const trigger = getByTestId('git-branch-selector');
    fireEvent.click(trigger);
    const dropdown = getByTestId('git-branch-dropdown');
    expect(dropdown).toBeTruthy();
  });

  it('shows branches in dropdown', () => {
    const { getByTestId } = renderSelector();
    const trigger = getByTestId('git-branch-selector');
    fireEvent.click(trigger);

    const mainItem = getByTestId('git-branch-item-main');
    expect(mainItem).toBeTruthy();
    expect(mainItem.textContent).toContain('✓ main');

    const developItem = getByTestId('git-branch-item-develop');
    expect(developItem).toBeTruthy();
    expect(developItem.textContent).toContain('develop');
  });

  it('shows create branch option', () => {
    const { getByTestId } = renderSelector();
    const trigger = getByTestId('git-branch-selector');
    fireEvent.click(trigger);

    const createOption = getByTestId('git-create-branch');
    expect(createOption).toBeTruthy();
    expect(createOption.textContent).toContain('Create New Branch');
  });
});
