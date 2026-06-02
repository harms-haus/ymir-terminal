/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppDropdownMenu } from './AppDropdownMenu';
import type { DropdownMenuEntry } from './AppDropdownMenu';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderMenu(items: DropdownMenuEntry[], testId = 'test-dropdown') {
  return render(
    React.createElement(
      AppDropdownMenu,
      { items, testId },
      React.createElement('button', { 'data-testid': 'trigger-btn' }, 'Open'),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppDropdownMenu', () => {
  // -----------------------------------------------------------------------
  // 1. Renders trigger element
  // -----------------------------------------------------------------------
  test('renders trigger element', () => {
    const { getByTestId } = renderMenu([]);

    expect(getByTestId('trigger-btn')).toBeTruthy();
    expect(getByTestId('trigger-btn').textContent).toBe('Open');
  });

  // -----------------------------------------------------------------------
  // 2. Renders menu items after clicking trigger
  // -----------------------------------------------------------------------
  test('renders menu items', () => {
    const items: DropdownMenuEntry[] = [
      { label: 'Item A', testId: 'item-a' },
      { label: 'Item B', testId: 'item-b' },
    ];

    const { getByTestId, getByText } = renderMenu(items);

    // The mocked radix dropdown-menu renders content directly (no need to click open)
    expect(getByTestId('test-dropdown')).toBeTruthy();
    expect(getByText('Item A')).toBeTruthy();
    expect(getByText('Item B')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Clicking a menu item calls its action callback
  // -----------------------------------------------------------------------
  test('clicking a menu item calls its action callback', () => {
    const action = mock(() => {});
    const items: DropdownMenuEntry[] = [
      { label: 'Click Me', testId: 'click-me', action },
    ];

    const { getByText } = renderMenu(items);

    fireEvent.click(getByText('Click Me'));
    expect(action).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 4. Disabled items don't call action
  // -----------------------------------------------------------------------
  test('disabled items do not call action', () => {
    const action = mock(() => {});
    const items: DropdownMenuEntry[] = [
      { label: 'Disabled Item', testId: 'disabled-item', action, disabled: true },
    ];

    const { getByText } = renderMenu(items);

    // The mock sets aria-disabled and skips onClick for disabled items
    const el = getByText('Disabled Item');
    expect(el.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(el);
    expect(action).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. Submenu items render with SubTrigger label
  // -----------------------------------------------------------------------
  test('submenu items render with SubTrigger label', () => {
    const items: DropdownMenuEntry[] = [
      {
        label: 'My Submenu',
        testId: 'my-submenu',
        items: [
          { label: 'Sub Item 1', testId: 'sub-item-1' },
          { label: 'Sub Item 2', testId: 'sub-item-2' },
        ],
      },
    ];

    const { getByText, getByTestId } = renderMenu(items);

    // SubTrigger renders the submenu label
    expect(getByTestId('my-submenu')).toBeTruthy();
    expect(getByText('My Submenu')).toBeTruthy();
    // Sub items are also rendered inside SubContent
    expect(getByText('Sub Item 1')).toBeTruthy();
    expect(getByText('Sub Item 2')).toBeTruthy();
  });
});
