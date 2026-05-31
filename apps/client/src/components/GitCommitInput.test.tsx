/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';

await setupTestDom();
setupAllMocks();

import { describe, it, expect, mock, afterEach } from 'bun:test';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitCommitInput', () => {
  afterEach(() => {
    cleanup();
    onCommit.mockClear();
  });

  it('renders textarea and commit button', () => {
    const { getByTestId } = renderInput();
    expect(getByTestId('git-commit-input')).toBeTruthy();
    expect(getByTestId('git-commit-button')).toBeTruthy();
  });

  it('button click calls onCommit', () => {
    const { getByTestId } = renderInput();
    const textarea = getByTestId('git-commit-input') as HTMLTextAreaElement;
    setMessage(textarea, 'feat: add new feature');

    const button = getByTestId('git-commit-button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('feat: add new feature');
  });

  it('disabled state prevents commit', () => {
    const { getByTestId } = renderInput({ disabled: true });
    const button = getByTestId('git-commit-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('empty message disables button', () => {
    const { getByTestId } = renderInput();
    const button = getByTestId('git-commit-button') as HTMLButtonElement;
    // Initial state: empty message → button disabled
    expect(button.disabled).toBe(true);

    // Set whitespace-only message → still disabled
    const textarea = getByTestId('git-commit-input') as HTMLTextAreaElement;
    setMessage(textarea, '   ');
    expect(button.disabled).toBe(true);
  });
});
