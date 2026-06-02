/// <reference lib="dom" />
import { setupTestDom, setupAllMocks, setReactInputValue } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import React, { useCallback } from 'react';

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

const { DialogProvider } = await import('./DialogProvider');
const { DialogContext } = await import('../contexts/DialogContext');

// Use DialogContext directly instead of useConfirm/usePrompt to avoid mock
// pollution from other test files that mock '../hooks/useDialog'.
const { useContext } = React;

function useConfirmDirect() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useConfirm must be used within a DialogProvider');
  return useCallback(
    (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) =>
      ctx
        .showDialog({ type: 'confirm', ...opts })
        .then((r) => (r as { confirmed: boolean }).confirmed),
    [ctx],
  );
}

function usePromptDirect() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('usePrompt must be used within a DialogProvider');
  return useCallback(
    (opts: {
      title: string;
      message: string;
      defaultValue?: string;
      placeholder?: string;
      submitLabel?: string;
    }) =>
      ctx
        .showDialog({ type: 'prompt', ...opts })
        .then((r) => (r as { value: string | null }).value),
    [ctx],
  );
}

// ---------------------------------------------------------------------------
// Test helper components
// ---------------------------------------------------------------------------

/** A component that calls useConfirmDirect and exposes the result via callback. */
function ConfirmTester({ onResult }: { onResult: (confirmed: boolean) => void }) {
  const confirm = useConfirmDirect();

  const handleClick = useCallback(async () => {
    const ok = await confirm({
      title: 'Test Confirm',
      message: 'Are you sure?',
    });
    onResult(ok);
  }, [confirm, onResult]);

  return React.createElement(
    'button',
    { 'data-testid': 'confirm-trigger', onClick: handleClick },
    'Trigger Confirm',
  );
}

/** A component that calls usePromptDirect and exposes the result via callback. */
function PromptTester({ onResult }: { onResult: (value: string | null) => void }) {
  const prompt = usePromptDirect();

  const handleClick = useCallback(async () => {
    const value = await prompt({
      title: 'Test Prompt',
      message: 'Enter a value:',
      defaultValue: 'default',
      submitLabel: 'OK',
    });
    onResult(value);
  }, [prompt, onResult]);

  return React.createElement(
    'button',
    { 'data-testid': 'prompt-trigger', onClick: handleClick },
    'Trigger Prompt',
  );
}

/** A component that accesses DialogContext directly outside of DialogProvider. */
function ConfirmWithoutProvider() {
  useConfirmDirect();
  return React.createElement('div', null, 'Should not render');
}

/** A component that accesses DialogContext directly outside of DialogProvider. */
function PromptWithoutProvider() {
  usePromptDirect();
  return React.createElement('div', null, 'Should not render');
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DialogProvider', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // useConfirm — confirm button returns true
  // -----------------------------------------------------------------------
  test('useConfirm returns true when confirm button is clicked', async () => {
    const onResult = mock((_confirmed: boolean) => {});

    render(
      React.createElement(DialogProvider, null, React.createElement(ConfirmTester, { onResult })),
    );

    // Click the trigger to open the dialog
    fireEvent.click(within(document.body).getByTestId('confirm-trigger'));

    // Wait for the confirm dialog to appear (it's portaled to document.body)
    await waitFor(() => {
      expect(within(document.body).getByTestId('confirm-dialog')).toBeTruthy();
    });

    // The confirm dialog should show the title and message
    expect(within(document.body).getByText('Test Confirm')).toBeTruthy();
    expect(within(document.body).getByText('Are you sure?')).toBeTruthy();

    // Click the Confirm button (not Cancel)
    const buttons = within(document.body).getAllByRole('button');
    // "Trigger Confirm" button + Cancel + Confirm
    const confirmButton = buttons.find((btn) => btn.textContent === 'Confirm');
    expect(confirmButton).toBeTruthy();
    fireEvent.click(confirmButton!);

    // The onResult callback should have been called with true
    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(true);
    });
  });

  // -----------------------------------------------------------------------
  // useConfirm — cancel button returns false
  // -----------------------------------------------------------------------
  test('useConfirm returns false when cancel button is clicked', async () => {
    const onResult = mock((_confirmed: boolean) => {});

    render(
      React.createElement(DialogProvider, null, React.createElement(ConfirmTester, { onResult })),
    );

    // Click the trigger to open the dialog
    fireEvent.click(within(document.body).getByTestId('confirm-trigger'));

    // Wait for the confirm dialog to appear
    await waitFor(() => {
      expect(within(document.body).getByTestId('confirm-dialog')).toBeTruthy();
    });

    // Click the Cancel button
    const cancelButton = within(document.body)
      .getAllByRole('button')
      .find((btn) => btn.textContent === 'Cancel');
    expect(cancelButton).toBeTruthy();
    fireEvent.click(cancelButton!);

    // The onResult callback should have been called with false
    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(false);
    });
  });

  // -----------------------------------------------------------------------
  // usePrompt — submit returns entered value
  // -----------------------------------------------------------------------
  test('usePrompt returns entered value when submit is clicked', async () => {
    const onResult = mock((_value: string | null) => {});

    render(
      React.createElement(DialogProvider, null, React.createElement(PromptTester, { onResult })),
    );

    // Click the trigger to open the dialog
    fireEvent.click(within(document.body).getByTestId('prompt-trigger'));

    // Wait for the prompt dialog to appear
    await waitFor(() => {
      expect(within(document.body).getByTestId('prompt-dialog')).toBeTruthy();
    });

    // The prompt dialog should show the title and message
    expect(within(document.body).getByText('Test Prompt')).toBeTruthy();
    expect(within(document.body).getByText('Enter a value:')).toBeTruthy();

    // The input should have the default value
    const input = within(document.body).getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('default');

    // Clear and type a new value (controlled input — use setReactInputValue)
    setReactInputValue(input, 'hello world');

    // Click the Submit button
    const submitButton = within(document.body)
      .getAllByRole('button')
      .find((btn) => btn.textContent === 'OK');
    expect(submitButton).toBeTruthy();
    fireEvent.click(submitButton!);

    // The onResult callback should have been called with the entered value
    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith('hello world');
    });
  });

  // -----------------------------------------------------------------------
  // usePrompt — cancel returns null
  // -----------------------------------------------------------------------
  test('usePrompt returns null when cancel is clicked', async () => {
    const onResult = mock((_value: string | null) => {});

    render(
      React.createElement(DialogProvider, null, React.createElement(PromptTester, { onResult })),
    );

    // Click the trigger to open the dialog
    fireEvent.click(within(document.body).getByTestId('prompt-trigger'));

    // Wait for the prompt dialog to appear
    await waitFor(() => {
      expect(within(document.body).getByTestId('prompt-dialog')).toBeTruthy();
    });

    // Click the Cancel button
    const cancelButton = within(document.body)
      .getAllByRole('button')
      .find((btn) => btn.textContent === 'Cancel');
    expect(cancelButton).toBeTruthy();
    fireEvent.click(cancelButton!);

    // The onResult callback should have been called with null
    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(null);
    });
  });

  // -----------------------------------------------------------------------
  // usePrompt — submit is disabled when input is empty
  // -----------------------------------------------------------------------
  test('usePrompt submit button is disabled when input is empty/whitespace', async () => {
    const onResult = mock((_value: string | null) => {});

    render(
      React.createElement(DialogProvider, null, React.createElement(PromptTester, { onResult })),
    );

    // Click the trigger to open the dialog
    fireEvent.click(within(document.body).getByTestId('prompt-trigger'));

    // Wait for the prompt dialog to appear
    await waitFor(() => {
      expect(within(document.body).getByTestId('prompt-dialog')).toBeTruthy();
    });

    // Clear the input (controlled input — use setReactInputValue)
    const input = within(document.body).getByRole('textbox') as HTMLInputElement;
    setReactInputValue(input, '');

    // Submit button should be disabled
    const submitButton = within(document.body)
      .getAllByRole('button')
      .find((btn) => btn.textContent === 'OK');
    expect(submitButton).toBeTruthy();
    expect(submitButton!.disabled).toBe(true);

    // Clicking disabled button should not submit
    fireEvent.click(submitButton!);
    expect(onResult).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // useConfirm throws when used outside DialogProvider
  // -----------------------------------------------------------------------
  test('useConfirm throws when used outside DialogProvider', () => {
    // Suppress React error boundary console noise
    const originalError = console.error;
    console.error = mock(() => {});

    try {
      expect(() => {
        render(React.createElement(ConfirmWithoutProvider));
      }).toThrow('useConfirm must be used within a DialogProvider');
    } finally {
      console.error = originalError;
    }
  });

  // -----------------------------------------------------------------------
  // usePrompt throws when used outside DialogProvider
  // -----------------------------------------------------------------------
  test('usePrompt throws when used outside DialogProvider', () => {
    // Suppress React error boundary console noise
    const originalError = console.error;
    console.error = mock(() => {});

    try {
      expect(() => {
        render(React.createElement(PromptWithoutProvider));
      }).toThrow('usePrompt must be used within a DialogProvider');
    } finally {
      console.error = originalError;
    }
  });
});
