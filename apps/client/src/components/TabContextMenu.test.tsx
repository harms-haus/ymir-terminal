/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Import component under test (after mock)
// ---------------------------------------------------------------------------

const { TabContextMenu } = await import('./TabContextMenu');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTabContextMenu(
  overrides: {
    canCloseRight?: boolean;
    canCloseOthers?: boolean;
    onClose?: () => void;
    onCloseRight?: () => void;
    onCloseOthers?: () => void;
    onRename?: () => void;
  } = {},
) {
  const onClose = overrides.onClose ?? mock(() => {});
  const onCloseRight = overrides.onCloseRight ?? mock(() => {});
  const onCloseOthers = overrides.onCloseOthers ?? mock(() => {});
  const onRename = overrides.onRename ?? mock(() => {});

  const result = render(
    React.createElement(
      TabContextMenu,
      {
        canCloseRight: overrides.canCloseRight ?? true,
        canCloseOthers: overrides.canCloseOthers ?? true,
        onClose,
        onCloseRight,
        onCloseOthers,
        onRename,
      } as React.Attributes & React.ComponentProps<typeof TabContextMenu>,
      React.createElement('div', { 'data-testid': 'trigger' }, 'Tab'),
    ),
  );

  return { ...result, onClose, onCloseRight, onCloseOthers, onRename };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('TabContextMenu', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders children correctly
  // -----------------------------------------------------------------------
  test('renders children correctly', () => {
    const { container } = renderTabContextMenu();

    const trigger = container.querySelector('[data-testid="trigger"]');
    expect(trigger).toBeTruthy();
    expect(trigger?.textContent).toBe('Tab');
  });

  // -----------------------------------------------------------------------
  // 2. Calls onClose when Close item is clicked
  // -----------------------------------------------------------------------
  test('calls onClose when Close item is clicked', () => {
    const onClose = mock(() => {});
    const { container } = renderTabContextMenu({ onClose });

    const item = container.querySelector('[data-testid="tab-menu-close"]') as HTMLElement;
    fireEvent.click(item);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 3. Calls onCloseRight when Close to the Right is clicked
  // -----------------------------------------------------------------------
  test('calls onCloseRight when Close to the Right is clicked', () => {
    const onCloseRight = mock(() => {});
    const { container } = renderTabContextMenu({ canCloseRight: true, onCloseRight });

    const item = container.querySelector('[data-testid="tab-menu-close-right"]') as HTMLElement;
    fireEvent.click(item);

    expect(onCloseRight).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 4. Calls onCloseOthers when Close Others is clicked
  // -----------------------------------------------------------------------
  test('calls onCloseOthers when Close Others is clicked', () => {
    const onCloseOthers = mock(() => {});
    const { container } = renderTabContextMenu({ canCloseOthers: true, onCloseOthers });

    const item = container.querySelector('[data-testid="tab-menu-close-others"]') as HTMLElement;
    fireEvent.click(item);

    expect(onCloseOthers).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 5. Calls onRename when Rename is clicked
  // -----------------------------------------------------------------------
  test('calls onRename when Rename is clicked', () => {
    const onRename = mock(() => {});
    const { container } = renderTabContextMenu({ onRename });

    const item = container.querySelector('[data-testid="tab-menu-rename"]') as HTMLElement;
    fireEvent.click(item);

    expect(onRename).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 6. Close Others has aria-disabled when canCloseOthers=false
  // -----------------------------------------------------------------------
  test('Close Others has aria-disabled when canCloseOthers=false', () => {
    const { container } = renderTabContextMenu({ canCloseOthers: false });

    const item = container.querySelector('[data-testid="tab-menu-close-others"]') as HTMLElement;
    expect(item.getAttribute('aria-disabled')).toBe('true');
  });

  // -----------------------------------------------------------------------
  // 7. Close to the Right has aria-disabled when canCloseRight=false
  // -----------------------------------------------------------------------
  test('Close to the Right has aria-disabled when canCloseRight=false', () => {
    const { container } = renderTabContextMenu({ canCloseRight: false });

    const item = container.querySelector('[data-testid="tab-menu-close-right"]') as HTMLElement;
    expect(item.getAttribute('aria-disabled')).toBe('true');
  });

  // -----------------------------------------------------------------------
  // 8. All items are enabled (no aria-disabled) when both flags are true
  // -----------------------------------------------------------------------
  test('all items are enabled when both flags are true', () => {
    const { container } = renderTabContextMenu({ canCloseRight: true, canCloseOthers: true });

    const closeOthers = container.querySelector(
      '[data-testid="tab-menu-close-others"]',
    ) as HTMLElement;
    const closeRight = container.querySelector(
      '[data-testid="tab-menu-close-right"]',
    ) as HTMLElement;

    expect(closeOthers.getAttribute('aria-disabled')).toBeNull();
    expect(closeRight.getAttribute('aria-disabled')).toBeNull();
  });
});
