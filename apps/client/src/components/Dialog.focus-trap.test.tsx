/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, afterEach, afterAll } from 'bun:test';
import { render, within, cleanup, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { Dialog } = await import('./Dialog');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(
  overrides: {
    open?: boolean;
    onClose?: () => void;
    children?: React.ReactNode;
  } = {},
) {
  const onClose = overrides.onClose ?? (() => {});

  const children =
    overrides.children ??
    React.createElement(
      React.Fragment,
      null,
      React.createElement('button', { 'data-testid': 'btn-a' }, 'A'),
      React.createElement('button', { 'data-testid': 'btn-b' }, 'B'),
    );

  render(
    React.createElement(
      Dialog,
      {
        open: overrides.open ?? true,
        onClose,
        title: 'Test Dialog',
        testId: 'test-dialog',
      },
      children,
    ),
  );

  return { onClose };
}

/**
 * Flush pending microtasks and the Dialog's auto-focus setTimeout(0).
 * Must be awaited after render() and before any focus assertions.
 */
async function flushAutoFocus() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/**
 * Dispatch a native KeyboardEvent on window.
 *
 * When `defaultPrevented` is true, we override the `defaultPrevented` getter
 * on the event instance via `Object.defineProperty` so that the Dialog's
 * handler sees `e.defaultPrevented === true`.
 *
 * This is needed because happy-dom's `KeyboardEvent.preventDefault()` does
 * not set `defaultPrevented` to true.
 */
function dispatchKeydown(key: string, opts?: { defaultPrevented?: boolean; shiftKey?: boolean }) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    shiftKey: opts?.shiftKey ?? false,
  });

  if (opts?.defaultPrevented) {
    // happy-dom's KeyboardEvent.preventDefault() doesn't set
    // defaultPrevented. Override the getter on the instance.
    Object.defineProperty(event, 'defaultPrevented', {
      get: () => true,
      configurable: true,
    });
  }

  window.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  // No module mocks to restore in this file
});

describe('Dialog focus trap and Escape handling', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Tab still cycles focus normally
  // -----------------------------------------------------------------------
  test('Tab cycles focus from last button to first button', async () => {
    renderDialog();
    await flushAutoFocus();

    const btnA = within(document.body).getByTestId('btn-a');
    const btnB = within(document.body).getByTestId('btn-b');

    // Focus the last button
    btnB.focus();
    expect(document.activeElement).toBe(btnB);

    // Press Tab — should wrap from last to first
    dispatchKeydown('Tab');

    expect(document.activeElement).toBe(btnA);
  });

  // -----------------------------------------------------------------------
  // 2. Tab with defaultPrevented does NOT cycle focus
  // -----------------------------------------------------------------------
  test('Tab with defaultPrevented does not cycle focus', async () => {
    renderDialog();
    await flushAutoFocus();

    const _btnA = within(document.body).getByTestId('btn-a');
    void _btnA;
    const btnB = within(document.body).getByTestId('btn-b');

    // Focus the last button
    btnB.focus();
    expect(document.activeElement).toBe(btnB);

    // Press Tab with defaultPrevented — focus should stay on btnB
    dispatchKeydown('Tab', { defaultPrevented: true });

    expect(document.activeElement).toBe(btnB);
  });

  // -----------------------------------------------------------------------
  // 3. Escape still closes dialog normally
  // -----------------------------------------------------------------------
  test('Escape calls onClose', async () => {
    let callCount = 0;
    const trackingOnClose = () => {
      callCount++;
    };

    renderDialog({ onClose: trackingOnClose });
    await flushAutoFocus();

    expect(within(document.body).getByTestId('test-dialog')).toBeTruthy();

    dispatchKeydown('Escape');

    expect(callCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 4. Escape with defaultPrevented does NOT close dialog
  // -----------------------------------------------------------------------
  test('Escape with defaultPrevented does not call onClose', async () => {
    let callCount = 0;
    const trackingOnClose = () => {
      callCount++;
    };

    renderDialog({ onClose: trackingOnClose });
    await flushAutoFocus();

    expect(within(document.body).getByTestId('test-dialog')).toBeTruthy();

    dispatchKeydown('Escape', { defaultPrevented: true });

    expect(callCount).toBe(0);
  });
});
