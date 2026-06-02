/// <reference lib="dom" />
import { setupTestDom, setupAllMocks, setReactInputValue } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { GenericPicker } from './GenericPicker';
import type { PickerItem } from './GenericPicker';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultItems: PickerItem[] = [
  { id: 'apple', label: 'Apple', description: 'A red fruit' },
  { id: 'banana', label: 'Banana', description: 'A yellow fruit' },
  { id: 'cherry', label: 'Cherry', description: 'A small red fruit' },
];

function renderPicker(overrides: Partial<Parameters<typeof GenericPicker>[0]> = {}) {
  const onClose = overrides.onClose ?? (() => {});
  const onSelect = overrides.onSelect ?? (() => {});

  return render(
    React.createElement(GenericPicker, {
      open: true,
      onClose,
      onSelect,
      title: 'Pick an item',
      items: defaultItems,
      testId: 'test-picker',
      ...overrides,
    }),
  );
}

/**
 * The Dialog component uses `createPortal(..., document.body)`, so rendered
 * content lives in document.body, NOT inside the `render()` container.
 * We must query `document.body` directly instead of using the container-
 * bound queries returned by `render()`. (screen is unusable because ES
 * module imports are hoisted before `await setupTestDom()`, so `screen`
 * sees no `document.body` at import time.)
 */
const body = () => document.body;

/**
 * Invoke React's `onKeyDown` handler directly on a DOM element.
 *
 * The Dialog component uses `createPortal(..., document.body)`. In happy-dom,
 * React's synthetic event system cannot dispatch events on portal-rendered
 * elements (it loses the internal fiber reference). Calling the handler
 * directly from React's internal props bypasses this limitation.
 */
function fireReactKeyDown(element: HTMLElement, key: string): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const reactPropsKey = Object.keys(element).find((k) => k.startsWith('__reactProps'));
  if (!reactPropsKey) throw new Error('Could not find React internal props on element');
  const props = (element as any)[reactPropsKey];
  if (typeof props?.onKeyDown !== 'function') throw new Error('onKeyDown not found on React props');
  act(() => {
    props.onKeyDown({ key, preventDefault: () => {} });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenericPicker', () => {
  // -----------------------------------------------------------------------
  // 1. Renders with title and items
  // -----------------------------------------------------------------------
  test('renders with title and items', () => {
    renderPicker();

    expect(body().querySelector('[data-testid="test-picker"]')).toBeTruthy();
    expect(body().textContent).toContain('Pick an item');
    expect(body().textContent).toContain('Apple');
    expect(body().textContent).toContain('Banana');
    expect(body().textContent).toContain('Cherry');
  });

  // -----------------------------------------------------------------------
  // 2. Filters items based on input text
  // -----------------------------------------------------------------------
  test('filters items based on input text', () => {
    renderPicker();

    const input = body().querySelector('input[placeholder="Filter..."]') as HTMLInputElement;
    expect(input).toBeTruthy();
    setReactInputValue(input, 'ban');

    expect(body().textContent).toContain('Banana');
    expect(body().textContent).not.toContain('Apple');
    expect(body().textContent).not.toContain('Cherry');
  });

  // -----------------------------------------------------------------------
  // 3. ArrowDown/ArrowUp navigation
  // -----------------------------------------------------------------------
  test('ArrowDown and ArrowUp navigate highlighted item', () => {
    renderPicker();

    const input = body().querySelector('input[placeholder="Filter..."]') as HTMLInputElement;

    // ArrowDown should highlight the second item (index 1 = Banana)
    fireReactKeyDown(input, 'ArrowDown');

    const highlighted1 = body().querySelector('[data-highlighted="true"]');
    expect(highlighted1?.textContent).toContain('Banana');
    expect(highlighted1?.getAttribute('aria-selected')).toBe('true');

    // ArrowDown again highlights the third item (index 2 = Cherry)
    fireReactKeyDown(input, 'ArrowDown');

    const highlighted2 = body().querySelector('[data-highlighted="true"]');
    expect(highlighted2?.textContent).toContain('Cherry');

    // ArrowUp goes back to second item (index 1 = Banana)
    fireReactKeyDown(input, 'ArrowUp');

    const highlighted3 = body().querySelector('[data-highlighted="true"]');
    expect(highlighted3?.textContent).toContain('Banana');
  });

  // -----------------------------------------------------------------------
  // 4. Enter selects highlighted item
  // -----------------------------------------------------------------------
  test('Enter selects highlighted item', () => {
    const onSelect = mock(() => {});
    renderPicker({ onSelect });

    const input = body().querySelector('input[placeholder="Filter..."]') as HTMLInputElement;

    // First item is highlighted by default (index 0 = Apple)
    fireReactKeyDown(input, 'Enter');

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(defaultItems[0]);
  });

  // -----------------------------------------------------------------------
  // 5. Escape closes
  // -----------------------------------------------------------------------
  test('Escape closes the picker', () => {
    const onClose = mock(() => {});
    renderPicker({ onClose });

    // The Dialog component handles Escape via window keydown listener
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 6. Shows empty message when no match
  // -----------------------------------------------------------------------
  test('shows empty message when no match', () => {
    renderPicker();

    const input = body().querySelector('input[placeholder="Filter..."]') as HTMLInputElement;
    setReactInputValue(input, 'zzzzzzz');

    expect(body().textContent).toContain('No items found.');
  });
});
