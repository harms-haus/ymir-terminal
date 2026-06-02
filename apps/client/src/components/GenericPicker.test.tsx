/// <reference lib="dom" />
import { setupTestDom, setupAllMocks, setReactInputValue } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenericPicker', () => {
  // -----------------------------------------------------------------------
  // 1. Renders with title and items
  // -----------------------------------------------------------------------
  test('renders with title and items', () => {
    renderPicker();

    expect(screen.getByText('Pick an item')).toBeTruthy();
    expect(screen.getByTestId('test-picker')).toBeTruthy();
    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('Banana')).toBeTruthy();
    expect(screen.getByText('Cherry')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Filters items based on input text
  // -----------------------------------------------------------------------
  test('filters items based on input text', () => {
    renderPicker();

    // Dialog portals to document.body; use screen to find the input
    const input = screen.getByPlaceholderText('Filter...');
    setReactInputValue(input, 'ban');

    expect(screen.getByText('Banana')).toBeTruthy();
    expect(screen.queryByText('Apple')).toBeNull();
    expect(screen.queryByText('Cherry')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. ArrowDown/ArrowUp navigation
  // -----------------------------------------------------------------------
  test('ArrowDown and ArrowUp navigate highlighted item', () => {
    renderPicker();

    const input = screen.getByPlaceholderText('Filter...');

    // ArrowDown should highlight the second item (index 1)
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const highlighted1 = document.querySelector('[data-highlighted="true"]');
    expect(highlighted1).toBeTruthy();
    expect(highlighted1?.getAttribute('aria-selected')).toBe('true');

    // ArrowDown again highlights the third item (index 2)
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const highlighted2 = document.querySelector('[data-highlighted="true"]');
    expect(highlighted2).toBeTruthy();

    // ArrowUp goes back to second item (index 1)
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    const highlighted3 = document.querySelector('[data-highlighted="true"]');
    expect(highlighted3).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 4. Enter selects highlighted item
  // -----------------------------------------------------------------------
  test('Enter selects highlighted item', () => {
    const onSelect = mock(() => {});
    renderPicker({ onSelect });

    const input = screen.getByPlaceholderText('Filter...');

    // First item is highlighted by default (index 0 = Apple)
    fireEvent.keyDown(input, { key: 'Enter' });

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

    const input = screen.getByPlaceholderText('Filter...');
    setReactInputValue(input, 'zzzzzzz');

    expect(screen.getByText('No items found.')).toBeTruthy();
  });
});
