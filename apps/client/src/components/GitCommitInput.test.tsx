/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';

await setupTestDom();
setupAllMocks();

import { describe, it, expect, mock, afterEach } from 'bun:test';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';

const { GitCommitInput } = await import('./GitCommitInput');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const onCommit = mock(() => {});

function renderInput(overrides?: { disabled?: boolean; loading?: boolean }) {
  return render(
    React.createElement(GitCommitInput, {
      onCommit,
      disabled: overrides?.disabled,
      loading: overrides?.loading,
    }),
  );
}

/**
 * Simulate typing into the controlled textarea by dispatching React's internal
 * onChange handler (happy-dom's fireEvent.change doesn't trigger it reliably).
 */
function setMessage(textarea: HTMLTextAreaElement, value: string) {
  const reactPropsKey = Object.keys(textarea).find((k) => k.startsWith('__reactProps'));
  if (!reactPropsKey) throw new Error('Could not find React internal props on textarea');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (textarea as any)[reactPropsKey];
  act(() => {
    props.onChange({
      target: {
        value,
        style: { height: 'auto' },
        scrollHeight: 30,
      },
    });
  });
}

function ctrlEnter(textarea: HTMLElement) {
  const reactPropsKey = Object.keys(textarea).find((k) => k.startsWith('__reactProps'));
  if (!reactPropsKey) throw new Error('Could not find React internal props on textarea');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (textarea as any)[reactPropsKey];
  act(() => {
    props.onKeyDown({
      key: 'Enter',
      ctrlKey: true,
      metaKey: false,
      preventDefault: () => {},
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitCommitInput', () => {
  afterEach(() => {
    cleanup();
    onCommit.mockClear();
  });

  it('renders textarea', () => {
    const { getByTestId } = renderInput();
    expect(getByTestId('git-commit-input')).toBeTruthy();
  });

  it('Ctrl+Enter calls onCommit', () => {
    const { getByTestId } = renderInput();
    const textarea = getByTestId('git-commit-input') as HTMLTextAreaElement;
    setMessage(textarea, 'feat: add new feature');

    ctrlEnter(textarea);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('feat: add new feature');
  });

  it('disabled state prevents commit', () => {
    const { getByTestId } = renderInput({ disabled: true });
    const textarea = getByTestId('git-commit-input') as HTMLTextAreaElement;
    setMessage(textarea, 'feat: add new feature');

    ctrlEnter(textarea);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('empty message prevents commit', () => {
    const { getByTestId } = renderInput();
    const textarea = getByTestId('git-commit-input') as HTMLTextAreaElement;

    // Initial state: empty message → no commit
    ctrlEnter(textarea);
    expect(onCommit).not.toHaveBeenCalled();

    // Whitespace-only message → still no commit
    setMessage(textarea, '   ');
    ctrlEnter(textarea);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
