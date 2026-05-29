/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock @radix-ui/react-context-menu
// ---------------------------------------------------------------------------

const Root = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'context-menu-root' }, children);

const Trigger = ({ children }: { children: React.ReactNode; asChild?: boolean }) =>
  React.createElement('div', { 'data-testid': 'context-menu-trigger' }, children);

const Portal = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', null, children);

const Content = ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
  React.createElement('div', props, children);

const Item = ({
  children,
  onSelect,
  disabled,
  ...props
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  [key: string]: unknown;
}) =>
  React.createElement(
    'div',
    { ...props, onClick: disabled ? undefined : onSelect, disabled },
    children,
  );

const Separator = (props: { [key: string]: unknown }) =>
  React.createElement('div', { ...props, role: 'separator' });

mock.module('@radix-ui/react-context-menu', () => ({
  Root,
  Trigger,
  Portal,
  Content,
  Item,
  Separator,
}));

// ---------------------------------------------------------------------------
// Import component under test (after mock)
// ---------------------------------------------------------------------------

const { PaneContextMenu } = await import('./PaneContextMenu');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPaneContextMenu(
  overrides: {
    paneId?: string;
    isOnlyPane?: boolean;
    onSplitRight?: (paneId: string) => void;
    onSplitDown?: (paneId: string) => void;
    onClosePane?: (paneId: string) => void;
  } = {},
) {
  const onSplitRight = overrides.onSplitRight ?? mock(() => {});
  const onSplitDown = overrides.onSplitDown ?? mock(() => {});
  const onClosePane = overrides.onClosePane ?? mock(() => {});

  const result = render(
    React.createElement(
      PaneContextMenu,
      {
        paneId: overrides.paneId ?? 'pane-1',
        isOnlyPane: overrides.isOnlyPane ?? false,
        onSplitRight,
        onSplitDown,
        onClosePane,
      } as React.Attributes & React.ComponentProps<typeof PaneContextMenu>,
      React.createElement('div', { 'data-testid': 'trigger' }, 'Trigger'),
    ),
  );

  return { ...result, onSplitRight, onSplitDown, onClosePane };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaneContextMenu', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Right-clicking a pane shows context menu with split options
  // -----------------------------------------------------------------------
  test('renders context menu with split options', () => {
    const { container } = renderPaneContextMenu();

    const menu = container.querySelector('[data-testid="pane-context-menu"]');
    expect(menu).toBeTruthy();

    expect(container.querySelector('[data-testid="split-right"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="split-down"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Menu has: Split Right, Split Down, Close Pane
  // -----------------------------------------------------------------------
  test('menu contains Split Right, Split Down, and Close Pane options', () => {
    const { container } = renderPaneContextMenu();

    expect(container.querySelector('[data-testid="split-right"]')?.textContent).toBe('Split Right');
    expect(container.querySelector('[data-testid="split-down"]')?.textContent).toBe('Split Down');
    expect(container.querySelector('[data-testid="close-pane"]')?.textContent).toBe('Close Pane');
  });

  // -----------------------------------------------------------------------
  // 3. Each option calls appropriate callback with paneId
  // -----------------------------------------------------------------------
  test('Split Right calls onSplitRight with paneId', () => {
    const onSplitRight = mock(() => {});
    const { container } = renderPaneContextMenu({ paneId: 'pane-42', onSplitRight });

    const item = container.querySelector('[data-testid="split-right"]') as HTMLElement;
    fireEvent.click(item);

    expect(onSplitRight).toHaveBeenCalledWith('pane-42');
  });

  test('Split Down calls onSplitDown with paneId', () => {
    const onSplitDown = mock(() => {});
    const { container } = renderPaneContextMenu({ paneId: 'pane-99', onSplitDown });

    const item = container.querySelector('[data-testid="split-down"]') as HTMLElement;
    fireEvent.click(item);

    expect(onSplitDown).toHaveBeenCalledWith('pane-99');
  });

  test('Close Pane calls onClosePane with paneId', () => {
    const onClosePane = mock(() => {});
    const { container } = renderPaneContextMenu({
      paneId: 'pane-7',
      isOnlyPane: false,
      onClosePane,
    });

    const item = container.querySelector('[data-testid="close-pane"]') as HTMLElement;
    fireEvent.click(item);

    expect(onClosePane).toHaveBeenCalledWith('pane-7');
  });

  // -----------------------------------------------------------------------
  // 4. Close Pane is disabled for the last remaining pane
  // -----------------------------------------------------------------------
  test('Close Pane is disabled when it is the only pane', () => {
    const onClosePane = mock(() => {});
    const { container } = renderPaneContextMenu({ isOnlyPane: true, onClosePane });

    const closeItem = container.querySelector('[data-testid="close-pane"]') as HTMLElement;
    expect(closeItem.hasAttribute('disabled')).toBe(true);

    // Clicking disabled Close Pane should NOT call onClosePane
    fireEvent.click(closeItem);
    expect(onClosePane).not.toHaveBeenCalled();
  });

  test('Close Pane is enabled when there are multiple panes', () => {
    const { container } = renderPaneContextMenu({ isOnlyPane: false });

    const closeItem = container.querySelector('[data-testid="close-pane"]') as HTMLElement;
    expect(closeItem.hasAttribute('disabled')).toBe(false);
  });
});
