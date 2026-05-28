/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, afterEach } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { GitPanel } from './GitPanel';

import type { GitStatusResponse } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderGitPanel(gitStatus: GitStatusResponse | null) {
  return render(React.createElement(GitPanel, { gitStatus }));
}

const sampleStatus: GitStatusResponse = {
  branch: 'main',
  changes: [
    { path: 'src/index.ts', status: 'M' },
    { path: 'README.md', status: 'A' },
    { path: 'old-file.ts', status: 'D' },
  ],
  staged: [
    { path: 'src/app.ts', status: 'A' },
    { path: 'src/util.ts', status: 'M' },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitPanel', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. GitPanel renders with branch name and file changes
  // -----------------------------------------------------------------------
  test('renders with branch name and file changes', () => {
    const { getByTestId, getByText } = renderGitPanel(sampleStatus);

    expect(getByTestId('git-panel')).toBeTruthy();
    expect(getByTestId('git-branch')).toBeTruthy();
    expect(getByText('main')).toBeTruthy();
    expect(getByText('src/index.ts')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Shows current branch name
  // -----------------------------------------------------------------------
  test('shows current branch name', () => {
    const { getByTestId } = renderGitPanel({ ...sampleStatus, branch: 'feature/login' });

    expect(getByTestId('git-branch').textContent).toBe('feature/login');
  });

  // -----------------------------------------------------------------------
  // 3. Shows modified files with status indicators (M, A, D, etc.)
  // -----------------------------------------------------------------------
  test('shows modified files with status indicators', () => {
    const { getByTestId } = renderGitPanel(sampleStatus);

    const changes = getByTestId('git-changes');
    expect(changes).toBeTruthy();

    // Scope queries to the changes section to avoid matching staged items
    const statusSpans = changes.querySelectorAll('div > span:first-child');
    const statusTexts = Array.from(statusSpans).map((el) => el.textContent);
    expect(statusTexts).toContain('M');
    expect(statusTexts).toContain('A');
    expect(statusTexts).toContain('D');

    // Verify file paths are rendered within changes
    expect(changes.textContent).toContain('src/index.ts');
    expect(changes.textContent).toContain('README.md');
    expect(changes.textContent).toContain('old-file.ts');
  });

  // -----------------------------------------------------------------------
  // 3b. Status indicators have correct colors
  // -----------------------------------------------------------------------
  test('status indicators have correct colors', () => {
    const { getByTestId } = renderGitPanel(sampleStatus);

    const changes = getByTestId('git-changes');
    const rows = changes.querySelectorAll('div[style*="display: flex"]');

    // First row: src/index.ts with M status
    const modifiedStatus = rows[0]?.querySelector('span');
    expect(modifiedStatus?.textContent).toBe('M');
    expect(modifiedStatus?.style.color).toBe('#e2c08d');

    // Second row: README.md with A status
    const addedStatus = rows[1]?.querySelector('span');
    expect(addedStatus?.textContent).toBe('A');
    expect(addedStatus?.style.color).toBe('#73c991');

    // Third row: old-file.ts with D status
    const deletedStatus = rows[2]?.querySelector('span');
    expect(deletedStatus?.textContent).toBe('D');
    expect(deletedStatus?.style.color).toBe('#c74e39');
  });

  // -----------------------------------------------------------------------
  // 4. Shows staged files separately
  // -----------------------------------------------------------------------
  test('shows staged files separately from changes', () => {
    const { getByTestId, getByText } = renderGitPanel(sampleStatus);

    const staged = getByTestId('git-staged');
    expect(staged).toBeTruthy();

    // Staged section header
    expect(getByText('Staged Changes')).toBeTruthy();

    // Staged files
    expect(getByText('src/app.ts')).toBeTruthy();
    expect(getByText('src/util.ts')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 5. Empty state when no changes
  // -----------------------------------------------------------------------
  test('shows empty state when no changes', () => {
    const emptyStatus: GitStatusResponse = {
      branch: 'main',
      changes: [],
      staged: [],
    };

    const { getByText, queryByTestId } = renderGitPanel(emptyStatus);

    expect(getByText('No changes')).toBeTruthy();
    expect(queryByTestId('git-changes')).toBeNull();
    expect(queryByTestId('git-staged')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 6. Shows "Not a git repository" when gitStatus is null
  // -----------------------------------------------------------------------
  test('shows not a git repository when gitStatus is null', () => {
    const { getByText } = renderGitPanel(null);

    expect(getByText('Not a git repository')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 7. Shows only changes when no staged files
  // -----------------------------------------------------------------------
  test('shows only changes section when no staged files', () => {
    const noStaged: GitStatusResponse = {
      branch: 'develop',
      changes: [{ path: 'file.ts', status: 'M' }],
      staged: [],
    };

    const { getByTestId, queryByTestId } = renderGitPanel(noStaged);

    expect(getByTestId('git-changes')).toBeTruthy();
    expect(queryByTestId('git-staged')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 8. Shows only staged when no unstaged changes
  // -----------------------------------------------------------------------
  test('shows only staged section when no unstaged changes', () => {
    const noChanges: GitStatusResponse = {
      branch: 'develop',
      changes: [],
      staged: [{ path: 'file.ts', status: 'A' }],
    };

    const { getByTestId, queryByTestId } = renderGitPanel(noChanges);

    expect(queryByTestId('git-changes')).toBeNull();
    expect(getByTestId('git-staged')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 9. Handles untracked files with ? status
  // -----------------------------------------------------------------------
  test('handles untracked files with ? status', () => {
    const withUntracked: GitStatusResponse = {
      branch: 'main',
      changes: [{ path: 'new-file.txt', status: '?' }],
      staged: [],
    };

    const { getByText } = renderGitPanel(withUntracked);

    expect(getByText('?')).toBeTruthy();
    expect(getByText('new-file.txt')).toBeTruthy();
  });
});
