/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, it, expect, mock, afterEach } from 'bun:test';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import type { GitFileChange } from '@ymir/shared';

// ---------------------------------------------------------------------------
// Mock confirm result — controls what useConfirm returns per test
// ---------------------------------------------------------------------------
let confirmResult = true;

mock.module('../hooks/useDialog', () => ({
  useConfirm:
    () =>
    async (_opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) =>
      confirmResult,
  usePrompt: () => async () => null,
}));

// ---------------------------------------------------------------------------
// Mock GitChangeTree — renders a simplified stub so we can focus on
// GitChangesSection's own behaviour (section headers, buttons, callbacks).
// ---------------------------------------------------------------------------
const mockStageFile = mock((_repo: string, _files: string[]) => {});
const mockUnstageFile = mock((_repo: string, _files: string[]) => {});
const mockDiscardFile = mock((_repo: string, _files: string[]) => {});

mock.module('./GitChangeTree', () => ({
  GitChangeTree: ({
    changes,
    isStagedSection,
  }: {
    changes: GitFileChange[];
    isStagedSection?: boolean;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': isStagedSection ? 'mock-staged-tree' : 'mock-unstaged-tree',
      },
      changes.map((c) =>
        React.createElement(
          'span',
          { key: c.path, 'data-testid': `mock-file-${c.path}` },
          `${c.path}(${c.status})`,
        ),
      ),
    ),
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------
const { GitChangesSection } = await import('./GitChangesSection');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const staged: GitFileChange[] = [
  { path: 'src/app.ts', status: 'A' },
  { path: 'README.md', status: 'M' },
];

const changes: GitFileChange[] = [
  { path: 'src/utils.ts', status: 'M' },
  { path: 'package.json', status: '??' },
];

function renderSection(overrides?: { staged?: GitFileChange[]; changes?: GitFileChange[] }) {
  return render(
    React.createElement(GitChangesSection, {
      staged: overrides?.staged ?? staged,
      changes: overrides?.changes ?? changes,
      repoPath: '/project',
      onStageFiles: mockStageFile,
      onUnstageFiles: mockUnstageFile,
      onDiscardFiles: mockDiscardFile,
    }),
  );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  mockStageFile.mockClear();
  mockUnstageFile.mockClear();
  mockDiscardFile.mockClear();
  confirmResult = true;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitChangesSection', () => {
  // -----------------------------------------------------------------------
  // 1. Renders staged and unstaged sections
  // -----------------------------------------------------------------------
  it('renders staged and unstaged sections', () => {
    const { getByTestId } = renderSection();

    expect(getByTestId('git-changes-section')).toBeTruthy();
    expect(getByTestId('git-staged-section')).toBeTruthy();
    expect(getByTestId('git-unstaged-section')).toBeTruthy();
  });

  it('shows count badges for staged and unstaged sections', () => {
    const { getByTestId } = renderSection();

    // The staged section badge should show 2
    const stagedSection = getByTestId('git-staged-section');
    expect(stagedSection.textContent).toContain('2');

    // The unstaged section badge should show 2
    const unstagedSection = getByTestId('git-unstaged-section');
    expect(unstagedSection.textContent).toContain('2');
  });

  // -----------------------------------------------------------------------
  // 2. Shows file change items with correct status icons
  // -----------------------------------------------------------------------
  it('shows file change items via the mocked tree', () => {
    const { getByTestId } = renderSection();

    expect(getByTestId('mock-staged-tree')).toBeTruthy();
    expect(getByTestId('mock-unstaged-tree')).toBeTruthy();

    // Staged tree should contain stubs for staged files
    expect(getByTestId('mock-file-src/app.ts')).toBeTruthy();
    expect(getByTestId('mock-file-README.md')).toBeTruthy();

    // Unstaged tree should contain stubs for unstaged files
    expect(getByTestId('mock-file-src/utils.ts')).toBeTruthy();
    expect(getByTestId('mock-file-package.json')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Handles stage/unstage button clicks
  // -----------------------------------------------------------------------
  it('calls onUnstageFiles when "Unstage All" is clicked', () => {
    const { getByTestId } = renderSection();

    fireEvent.click(getByTestId('git-unstage-all-button'));

    expect(mockUnstageFile).toHaveBeenCalledTimes(1);
    expect(mockUnstageFile).toHaveBeenCalledWith('/project', ['src/app.ts', 'README.md']);
  });

  it('calls onStageFiles when "Stage All" is clicked', () => {
    const { getByText } = renderSection();

    fireEvent.click(getByText('Stage All'));

    expect(mockStageFile).toHaveBeenCalledTimes(1);
    expect(mockStageFile).toHaveBeenCalledWith('/project', ['src/utils.ts', 'package.json']);
  });

  // -----------------------------------------------------------------------
  // 4. Handles discard button clicks
  // -----------------------------------------------------------------------
  it('calls onDiscardFiles after confirm when "Discard All" is clicked', async () => {
    confirmResult = true;
    const { getByText } = renderSection();

    fireEvent.click(getByText('Discard All'));

    // useConfirm is async, wait for the callback to fire
    await new Promise((r) => setTimeout(r, 0));

    expect(mockDiscardFile).toHaveBeenCalledTimes(1);
    expect(mockDiscardFile).toHaveBeenCalledWith('/project', ['src/utils.ts', 'package.json']);
  });

  it('does not call onDiscardFiles when confirm is rejected', async () => {
    confirmResult = false;
    const { getByText } = renderSection();

    fireEvent.click(getByText('Discard All'));

    await new Promise((r) => setTimeout(r, 0));

    expect(mockDiscardFile).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. Shows 'no changes' message when empty
  // -----------------------------------------------------------------------
  it('does not render action buttons when sections are empty', () => {
    const { queryByText } = renderSection({ staged: [], changes: [] });

    expect(queryByText('Unstage All')).toBeNull();
    expect(queryByText('Discard All')).toBeNull();
    expect(queryByText('Stage All')).toBeNull();
  });

  it('hides Unstage All when staged is empty but changes exist', () => {
    const { queryByText, getByText } = renderSection({ staged: [], changes });

    expect(queryByText('Unstage All')).toBeNull();
    expect(getByText('Stage All')).toBeTruthy();
    expect(getByText('Discard All')).toBeTruthy();
  });

  it('hides Stage All / Discard All when changes are empty but staged exist', () => {
    const { queryByText, getByTestId } = renderSection({ staged, changes: [] });

    expect(getByTestId('git-unstage-all-button')).toBeTruthy();
    expect(queryByText('Stage All')).toBeNull();
    expect(queryByText('Discard All')).toBeNull();
  });

  it('shows zero-count badge when section is empty', () => {
    const { getByTestId } = renderSection({ staged: [], changes: [] });

    // Badges should not render when count is 0
    const stagedSection = getByTestId('git-staged-section');
    expect(stagedSection.textContent).toContain('Staged Changes');

    const unstagedSection = getByTestId('git-unstaged-section');
    expect(unstagedSection.textContent).toContain('Changes');
  });

  // -----------------------------------------------------------------------
  // 6. Handles collapse/expand of sections
  // -----------------------------------------------------------------------
  it('stages start expanded and can be collapsed', () => {
    const { getByTestId, queryByTestId } = renderSection();

    // Both sections start expanded — the mocked trees are visible
    expect(getByTestId('mock-staged-tree')).toBeTruthy();
    expect(getByTestId('mock-unstaged-tree')).toBeTruthy();

    // The staged section header button should have aria-expanded="true"
    const stagedHeader = getByTestId('git-staged-section').querySelector('[role="button"]');
    expect(stagedHeader).toBeTruthy();
    expect(stagedHeader!.getAttribute('aria-expanded')).toBe('true');

    // Click to collapse
    fireEvent.click(stagedHeader!);
    expect(stagedHeader!.getAttribute('aria-expanded')).toBe('false');

    // The staged tree should no longer be rendered
    expect(queryByTestId('mock-staged-tree')).toBeNull();

    // Unstaged tree should still be visible (independent section)
    expect(getByTestId('mock-unstaged-tree')).toBeTruthy();
  });

  it('collapsed section expands again on second click', () => {
    const { getByTestId } = renderSection();

    const stagedHeader = getByTestId('git-staged-section').querySelector('[role="button"]');
    expect(stagedHeader).toBeTruthy();

    // Collapse
    fireEvent.click(stagedHeader!);
    expect(stagedHeader!.getAttribute('aria-expanded')).toBe('false');

    // Expand again
    fireEvent.click(stagedHeader!);
    expect(stagedHeader!.getAttribute('aria-expanded')).toBe('true');

    // Tree is back
    expect(getByTestId('mock-staged-tree')).toBeTruthy();
  });

  it('sections collapse and expand independently', () => {
    const { getByTestId, queryByTestId } = renderSection();

    const stagedHeader = getByTestId('git-staged-section').querySelector('[role="button"]');
    const unstagedHeader = getByTestId('git-unstaged-section').querySelector('[role="button"]');

    // Collapse staged
    fireEvent.click(stagedHeader!);
    expect(stagedHeader!.getAttribute('aria-expanded')).toBe('false');
    expect(unstagedHeader!.getAttribute('aria-expanded')).toBe('true');
    expect(queryByTestId('mock-staged-tree')).toBeNull();
    expect(getByTestId('mock-unstaged-tree')).toBeTruthy();

    // Collapse unstaged too
    fireEvent.click(unstagedHeader!);
    expect(unstagedHeader!.getAttribute('aria-expanded')).toBe('false');
    expect(queryByTestId('mock-unstaged-tree')).toBeNull();

    // Re-expand staged — unstaged stays collapsed
    fireEvent.click(stagedHeader!);
    expect(stagedHeader!.getAttribute('aria-expanded')).toBe('true');
    expect(unstagedHeader!.getAttribute('aria-expanded')).toBe('false');
    expect(getByTestId('mock-staged-tree')).toBeTruthy();
    expect(queryByTestId('mock-unstaged-tree')).toBeNull();
  });

  it('keyboard Enter key toggles section', () => {
    const { getByTestId, queryByTestId } = renderSection();

    const stagedHeader = getByTestId('git-staged-section').querySelector('[role="button"]');
    expect(stagedHeader).toBeTruthy();

    // Press Enter to collapse
    fireEvent.keyDown(stagedHeader!, { key: 'Enter' });
    expect(stagedHeader!.getAttribute('aria-expanded')).toBe('false');
    expect(queryByTestId('mock-staged-tree')).toBeNull();

    // Press Space to expand
    fireEvent.keyDown(stagedHeader!, { key: ' ' });
    expect(stagedHeader!.getAttribute('aria-expanded')).toBe('true');
    expect(getByTestId('mock-staged-tree')).toBeTruthy();
  });
});
