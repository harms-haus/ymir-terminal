/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, within, cleanup, act } from '@testing-library/react';
import React from 'react';
import type { AutocompleteDirectoryEntry } from '@ymir/shared';
import { parsePathInput as realParsePathInput } from '../hooks/parsePathInput';

// ---------------------------------------------------------------------------
// Mock usePathAutocomplete (returns { directories, isLoading })
// ---------------------------------------------------------------------------

let mockDirectories: AutocompleteDirectoryEntry[] = [];

const mockUsePathAutocomplete = mock(() => ({
  directories: mockDirectories,
  isLoading: false,
}));

mock.module('../hooks/usePathAutocomplete', () => ({
  parsePathInput: realParsePathInput,
  usePathAutocomplete: mockUsePathAutocomplete,
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { PathAutocompleteInput } = await import('./PathAutocompleteInput');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderInput(
  overrides: Partial<{
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    placeholder: string;
    id: string;
  }> = {},
) {
  const onChange = overrides.onChange ?? mock(() => {});

  const result = render(
    React.createElement(PathAutocompleteInput, {
      value: overrides.value ?? '',
      onChange,
      disabled: overrides.disabled,
      placeholder: overrides.placeholder,
      id: overrides.id,
    }),
  );

  return { ...result, onChange };
}

/**
 * Read the React internal props from a DOM element.
 */
function getReactProps(el: HTMLElement): Record<string, unknown> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps'));
  if (!key) throw new Error('Could not find React internal props');
  return (el as any)[key];
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Trigger the React onFocus handler by calling it directly through React's
 * internal props. Needed because happy-dom's native focus() does not trigger
 * React's synthetic onFocus handler.
 */
function triggerFocus(input: HTMLInputElement): void {
  const props = getReactProps(input);
  if (typeof props?.onFocus !== 'function') throw new Error('onFocus not found on React props');
  act(() => {
    (props.onFocus as (e: unknown) => void)({});
  });
}

/**
 * Trigger a keyboard event by calling the React onKeyDown handler directly
 * through internal props. Avoids React 19 / happy-dom compatibility issues
 * with native KeyboardEvent dispatch.
 */
function triggerKeyDown(input: HTMLInputElement, key: string): void {
  const props = getReactProps(input);
  if (typeof props?.onKeyDown !== 'function') throw new Error('onKeyDown not found on React props');
  let defaultPrevented = false;
  act(() => {
    (props.onKeyDown as (e: unknown) => void)({
      key,
      preventDefault: () => {
        defaultPrevented = true;
      },
      get defaultPrevented() {
        return defaultPrevented;
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('PathAutocompleteInput', () => {
  beforeEach(() => {
    mockDirectories = [];
    mockUsePathAutocomplete.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders input with correct ARIA attributes
  // -----------------------------------------------------------------------
  test('renders input with correct ARIA attributes', () => {
    renderInput({ value: '' });

    const input = within(document.body).getByRole('combobox');
    expect(input).toBeTruthy();
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  // -----------------------------------------------------------------------
  // 2. Shows dropdown when directories are available
  // -----------------------------------------------------------------------
  test('shows dropdown when directories are available', () => {
    mockDirectories = [{ name: 'software' }, { name: 'photos' }, { name: 'documents' }];

    renderInput({ value: '/home/user/' });

    const input = within(document.body).getByRole('combobox') as HTMLInputElement;
    triggerFocus(input);

    const listbox = within(document.body).getByRole('listbox');
    expect(listbox).toBeTruthy();

    const options = within(document.body).getAllByRole('option');
    expect(options).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // 3. Filters directories by prefix
  // -----------------------------------------------------------------------
  test('filters directories by prefix', () => {
    mockDirectories = [{ name: 'software' }, { name: 'photos' }, { name: 'documents' }];

    renderInput({ value: '/home/user/so' });

    const input = within(document.body).getByRole('combobox') as HTMLInputElement;
    triggerFocus(input);

    const options = within(document.body).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toBe('software');
  });

  // -----------------------------------------------------------------------
  // 4. Hides dropdown when no matches
  // -----------------------------------------------------------------------
  test('hides dropdown when no matches', () => {
    mockDirectories = [{ name: 'software' }, { name: 'photos' }, { name: 'documents' }];

    renderInput({ value: '/home/user/zzz' });

    expect(within(document.body).queryByRole('listbox')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 5. Hides dropdown when directories array is empty
  // -----------------------------------------------------------------------
  test('hides dropdown when directories array is empty', () => {
    mockDirectories = [];

    renderInput({ value: '/home/user/' });

    expect(within(document.body).queryByRole('listbox')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 6. ArrowDown highlights next option
  // -----------------------------------------------------------------------
  test('ArrowDown highlights next option', () => {
    mockDirectories = [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }];

    renderInput({ value: '/home/user/' });

    const input = within(document.body).getByRole('combobox') as HTMLInputElement;
    triggerFocus(input);

    triggerKeyDown(input, 'ArrowDown');

    const firstOption = within(document.body).getAllByRole('option')[0];
    expect(firstOption.getAttribute('aria-selected')).toBe('true');

    const inputAfter = within(document.body).getByRole('combobox') as HTMLInputElement;
    expect(inputAfter.getAttribute('aria-activedescendant')).toBe(firstOption.id);
  });

  // -----------------------------------------------------------------------
  // 7. ArrowUp highlights previous option
  // -----------------------------------------------------------------------
  test('ArrowUp highlights previous option', () => {
    mockDirectories = [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }];

    renderInput({ value: '/home/user/' });

    const input = within(document.body).getByRole('combobox') as HTMLInputElement;
    triggerFocus(input);

    // Down twice
    triggerKeyDown(input, 'ArrowDown');
    triggerKeyDown(input, 'ArrowDown');
    // Up once
    triggerKeyDown(input, 'ArrowUp');

    const options = within(document.body).getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });

  // -----------------------------------------------------------------------
  // 8. Tab on highlighted option calls onChange
  // -----------------------------------------------------------------------
  test('Tab on highlighted option calls onChange', () => {
    mockDirectories = [{ name: 'software' }, { name: 'photos' }];

    const { onChange } = renderInput({ value: '/home/user/' });

    const input = within(document.body).getByRole('combobox') as HTMLInputElement;
    triggerFocus(input);

    // Highlight first option
    triggerKeyDown(input, 'ArrowDown');

    // Press Tab to accept
    triggerKeyDown(input, 'Tab');

    expect(onChange).toHaveBeenCalledWith('/home/user/software/');
  });

  // -----------------------------------------------------------------------
  // 9. Enter on highlighted option calls onChange
  // -----------------------------------------------------------------------
  test('Enter on highlighted option calls onChange', () => {
    mockDirectories = [{ name: 'software' }, { name: 'photos' }];

    const { onChange } = renderInput({ value: '/home/user/' });

    const input = within(document.body).getByRole('combobox') as HTMLInputElement;
    triggerFocus(input);

    // Highlight first option
    triggerKeyDown(input, 'ArrowDown');

    // Press Enter to accept
    triggerKeyDown(input, 'Enter');

    expect(onChange).toHaveBeenCalledWith('/home/user/software/');
  });

  // -----------------------------------------------------------------------
  // 10. Escape closes dropdown
  // -----------------------------------------------------------------------
  test('Escape closes dropdown', () => {
    mockDirectories = [{ name: 'software' }, { name: 'photos' }];

    renderInput({ value: '/home/user/' });

    const input = within(document.body).getByRole('combobox') as HTMLInputElement;
    triggerFocus(input);

    // Verify dropdown is open
    expect(within(document.body).getByRole('listbox')).toBeTruthy();

    // Press Escape
    triggerKeyDown(input, 'Escape');

    // Dropdown should be closed
    expect(within(document.body).queryByRole('listbox')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 11. Click on option calls onChange
  // -----------------------------------------------------------------------
  test('click on option calls onChange', () => {
    mockDirectories = [{ name: 'software' }, { name: 'photos' }];

    const { onChange } = renderInput({ value: '/home/user/' });

    const input = within(document.body).getByRole('combobox') as HTMLInputElement;
    triggerFocus(input);

    // Re-query option after render
    const option = within(document.body).getAllByRole('option')[0];

    // Simulate mousedown via React props
    const optionProps = getReactProps(option);
    act(() => {
      (optionProps.onMouseDown as (e: unknown) => void)({
        preventDefault: () => {},
      });
    });

    expect(onChange).toHaveBeenCalledWith('/home/user/software/');
  });

  // -----------------------------------------------------------------------
  // 12. MouseEnter updates highlight
  // -----------------------------------------------------------------------
  test('mouseEnter updates highlight', () => {
    mockDirectories = [{ name: 'alpha' }, { name: 'beta' }];

    renderInput({ value: '/home/user/' });

    const input = within(document.body).getByRole('combobox') as HTMLInputElement;
    triggerFocus(input);

    const options = within(document.body).getAllByRole('option');

    // Simulate mouseenter via React props
    const optionProps = getReactProps(options[1]);
    act(() => {
      (optionProps.onMouseEnter as () => void)();
    });

    const refreshedOptions = within(document.body).getAllByRole('option');
    expect(refreshedOptions[1].getAttribute('aria-selected')).toBe('true');
    expect(refreshedOptions[0].getAttribute('aria-selected')).toBe('false');
  });

  // -----------------------------------------------------------------------
  // 13. Does not show dropdown when input is empty
  // -----------------------------------------------------------------------
  test('does not show dropdown when input is empty', () => {
    mockDirectories = [{ name: 'software' }];

    renderInput({ value: '' });

    expect(within(document.body).queryByRole('listbox')).toBeNull();
  });
});
