/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppContextMenu } from './AppContextMenu';
import type { ContextMenuItem } from './AppContextMenu';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderMenu(
  items: ContextMenuItem[],
  extraProps?: Partial<React.ComponentProps<typeof AppContextMenu>>,
) {
  return render(
    React.createElement(
      AppContextMenu,
      { items, testId: 'test-ctx-menu', ...extraProps },
      React.createElement('div', { 'data-testid': 'trigger' }, 'Trigger'),
    ),
  );
}

function makeItem(overrides: Partial<ContextMenuItem> & { testId: string }): ContextMenuItem {
  return {
    label: overrides.label ?? `Item ${overrides.testId}`,
    action: overrides.action ?? mock(() => {}),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppContextMenu', () => {
  // -----------------------------------------------------------------------
  // 1. Renders menu items with correct labels
  // -----------------------------------------------------------------------
  test('renders menu items with correct labels', () => {
    const items: ContextMenuItem[] = [
      makeItem({ testId: 'item-copy', label: 'Copy' }),
      makeItem({ testId: 'item-paste', label: 'Paste' }),
      makeItem({ testId: 'item-delete', label: 'Delete' }),
    ];

    const { getByText, getByTestId } = renderMenu(items);

    expect(getByText('Copy')).toBeTruthy();
    expect(getByText('Paste')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
    expect(getByTestId('item-copy')).toBeTruthy();
    expect(getByTestId('item-paste')).toBeTruthy();
    expect(getByTestId('item-delete')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Renders disabled items with correct styling
  // -----------------------------------------------------------------------
  test('renders disabled items with correct styling and aria attribute', () => {
    const items: ContextMenuItem[] = [
      makeItem({ testId: 'item-enabled', label: 'Enabled' }),
      makeItem({ testId: 'item-disabled', label: 'Disabled', disabled: true }),
    ];

    const { getByTestId } = renderMenu(items);

    const disabledEl = getByTestId('item-disabled');
    expect(disabledEl.getAttribute('aria-disabled')).toBe('true');

    // Verify inline styles for disabled state
    const disabledStyle = (disabledEl as HTMLElement).style;
    expect(disabledStyle.opacity).toBe('0.4');
    expect(disabledStyle.cursor).toBe('not-allowed');

    // Enabled item should not have disabled styles
    const enabledEl = getByTestId('item-enabled');
    expect(enabledEl.getAttribute('aria-disabled')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. Renders destructive items with correct styling
  // -----------------------------------------------------------------------
  test('renders destructive items with error color', () => {
    const items: ContextMenuItem[] = [
      makeItem({ testId: 'item-normal', label: 'Normal' }),
      makeItem({ testId: 'item-destructive', label: 'Delete', destructive: true }),
    ];

    const { getByTestId } = renderMenu(items);

    const destructiveEl = getByTestId('item-destructive');
    const style = (destructiveEl as HTMLElement).style;
    // COLOR_ERROR is '#e06050'
    expect(style.color).toBe('#e06050');

    // Normal item should not have error color
    const normalEl = getByTestId('item-normal');
    expect((normalEl as HTMLElement).style.color).not.toBe('#e06050');
  });

  // -----------------------------------------------------------------------
  // 4. Renders shortcut hints
  // -----------------------------------------------------------------------
  test('renders shortcut hint text next to the item label', () => {
    const items: ContextMenuItem[] = [
      makeItem({ testId: 'item-copy', label: 'Copy', shortcutHint: '⌘C' }),
      makeItem({ testId: 'item-no-hint', label: 'Plain' }),
    ];

    const { getByText } = renderMenu(items);

    const hint = getByText('⌘C');
    expect(hint).toBeTruthy();
    expect((hint as HTMLElement).tagName.toLowerCase()).toBe('span');

    // Verify the hint is rendered within the item that has the shortcut
    const hintParent = hint.parentElement;
    expect(hintParent?.textContent).toContain('Copy');
    expect(hintParent?.textContent).toContain('⌘C');
  });

  // -----------------------------------------------------------------------
  // 5. Fires action callback on item click
  // -----------------------------------------------------------------------
  test('fires action callback on item click', () => {
    const actionA = mock(() => {});
    const actionB = mock(() => {});
    const items: ContextMenuItem[] = [
      makeItem({ testId: 'item-a', label: 'Action A', action: actionA }),
      makeItem({ testId: 'item-b', label: 'Action B', action: actionB }),
    ];

    const { getByTestId } = renderMenu(items);

    fireEvent.click(getByTestId('item-a'));
    expect(actionA).toHaveBeenCalledTimes(1);
    expect(actionB).not.toHaveBeenCalled();

    fireEvent.click(getByTestId('item-b'));
    expect(actionB).toHaveBeenCalledTimes(1);
    expect(actionA).toHaveBeenCalledTimes(1); // still only once
  });

  // -----------------------------------------------------------------------
  // 6. Handles empty items array
  // -----------------------------------------------------------------------
  test('handles empty items array without crashing', () => {
    const { getByTestId } = renderMenu([]);

    const menu = getByTestId('test-ctx-menu');
    expect(menu).toBeTruthy();
    // The menu should contain only the <style> element, no items
    expect(menu.children.length).toBe(1); // just the <style> tag
  });

  // -----------------------------------------------------------------------
  // 7. Handles custom content rendering (replaces label + shortcut)
  // -----------------------------------------------------------------------
  test('renders custom content inside a menu item', () => {
    const customContent = React.createElement(
      'span',
      { 'data-testid': 'custom-content' },
      '🎨 Custom Label',
    );
    const items: ContextMenuItem[] = [
      makeItem({ testId: 'item-custom', label: 'Accessible label', content: customContent }),
      makeItem({ testId: 'item-normal', label: 'Normal' }),
    ];

    const { getByTestId, queryByText } = renderMenu(items);

    // Custom content is rendered
    expect(getByTestId('custom-content')).toBeTruthy();
    expect(getByTestId('custom-content').textContent).toBe('🎨 Custom Label');

    // The plain text label should NOT appear as text content since content replaces it
    expect(queryByText('Accessible label')).toBeNull();

    // Normal item still renders its label
    expect(queryByText('Normal')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 8. Renders separators when separatorAfter is set
  // -----------------------------------------------------------------------
  test('renders separator after an item with separatorAfter', () => {
    const items: ContextMenuItem[] = [
      makeItem({ testId: 'item-a', label: 'Above', separatorAfter: true }),
      makeItem({ testId: 'item-b', label: 'Below' }),
    ];

    const { getByTestId } = renderMenu(items);

    const separator = getByTestId('test-ctx-menu').querySelector('[role="separator"]');
    expect(separator).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 9. Applies custom style prop on menu items
  // -----------------------------------------------------------------------
  test('merges custom style prop onto menu item', () => {
    const items: ContextMenuItem[] = [
      makeItem({
        testId: 'item-styled',
        label: 'Styled',
        style: { backgroundColor: 'red', fontSize: '20px' },
      }),
    ];

    const { getByTestId } = renderMenu(items);

    const el = getByTestId('item-styled') as HTMLElement;
    expect(el.style.backgroundColor).toBe('red');
    expect(el.style.fontSize).toBe('20px');
  });

  // -----------------------------------------------------------------------
  // 10. Renders extraContent alongside the menu
  // -----------------------------------------------------------------------
  test('renders extraContent as sibling of the menu', () => {
    const extra = React.createElement('div', { 'data-testid': 'extra-dialog' }, 'Dialog');
    const items: ContextMenuItem[] = [makeItem({ testId: 'item-a', label: 'A' })];

    const { getByTestId } = renderMenu(items, { extraContent: extra });

    expect(getByTestId('extra-dialog')).toBeTruthy();
    expect(getByTestId('extra-dialog').textContent).toBe('Dialog');
  });

  // -----------------------------------------------------------------------
  // 11. Renders icon inside menu item
  // -----------------------------------------------------------------------
  test('renders icon inside menu item', () => {
    const icon = React.createElement('span', { 'data-testid': 'icon-star' }, '★');
    const items: ContextMenuItem[] = [makeItem({ testId: 'item-icon', label: 'Starred', icon })];

    const { getByTestId } = renderMenu(items);

    expect(getByTestId('icon-star')).toBeTruthy();
    expect(getByTestId('icon-star').textContent).toBe('★');
  });

  // -----------------------------------------------------------------------
  // 12. Uses custom testId for the content wrapper
  // -----------------------------------------------------------------------
  test('applies custom testId to menu content element', () => {
    const items: ContextMenuItem[] = [makeItem({ testId: 'item-a', label: 'A' })];

    const { getByTestId } = renderMenu(items, { testId: 'my-custom-menu' });

    expect(getByTestId('my-custom-menu')).toBeTruthy();
  });
});
