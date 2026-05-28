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
import { TabBar } from './TabBar';
import type { Tab } from '../hooks/useTabs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleTabs: Tab[] = [
  { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
  { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
  { id: 'tab-3', type: 'editor', title: 'index.ts', filePath: '/src/index.ts' },
];

function renderTabBar(
  overrides: {
    tabs?: Tab[];
    activeTabId?: string | null;
    onActivate?: (tabId: string) => void;
    onClose?: (tabId: string) => void;
    onAddTerminal?: () => void;
  } = {},
) {
  const onActivate = overrides.onActivate ?? mock(() => {});
  const onClose = overrides.onClose ?? mock(() => {});
  const onAddTerminal = overrides.onAddTerminal ?? mock(() => {});

  const result = render(
    React.createElement(TabBar, {
      tabs: overrides.tabs ?? sampleTabs,
      activeTabId: overrides.activeTabId ?? 'tab-1',
      onActivate,
      onClose,
      onAddTerminal,
    }),
  );

  return { onActivate, onClose, onAddTerminal, ...result };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TabBar', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders tabs with correct titles
  // -----------------------------------------------------------------------
  test('renders tabs with correct titles', () => {
    const { container } = renderTabBar();

    const tabIds = ['tab-1', 'tab-2', 'tab-3'];
    for (const id of tabIds) {
      const el = container.querySelector(`[data-testid="tab-${id}"]`);
      expect(el).toBeTruthy();
    }

    // Check titles via text content
    expect(container.textContent).toContain('Terminal 1');
    expect(container.textContent).toContain('Terminal 2');
    expect(container.textContent).toContain('index.ts');
  });

  // -----------------------------------------------------------------------
  // 2. Active tab has distinct styling (background color)
  // -----------------------------------------------------------------------
  test('active tab has distinct styling', () => {
    const { container } = renderTabBar({ activeTabId: 'tab-2' });

    const activeTab = container.querySelector('[data-testid="tab-tab-2"]') as HTMLElement;
    const inactiveTab = container.querySelector('[data-testid="tab-tab-1"]') as HTMLElement;

    expect(activeTab).toBeTruthy();
    expect(inactiveTab).toBeTruthy();

    // Active background is #1e1e1e, inactive is #2d2d2d
    expect(activeTab.style.background).toBe('#1e1e1e');
    expect(inactiveTab.style.background).toBe('#2d2d2d');

    // Active color is #fff, inactive is #aaa
    expect(activeTab.style.color).toBe('#fff');
    expect(inactiveTab.style.color).toBe('#aaa');
  });

  // -----------------------------------------------------------------------
  // 3. Clicking a tab calls onActivate with correct ID
  // -----------------------------------------------------------------------
  test('clicking a tab calls onActivate with correct ID', () => {
    const onActivate = mock(() => {});
    const { getByTestId } = renderTabBar({ onActivate });

    fireEvent.click(getByTestId('tab-tab-2'));

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith('tab-2');
  });

  // -----------------------------------------------------------------------
  // 4. Clicking close button calls onClose (stopPropagation — tab not activated)
  // -----------------------------------------------------------------------
  test('clicking close button calls onClose and does not activate tab', () => {
    const onActivate = mock(() => {});
    const onClose = mock(() => {});
    const { getByTestId } = renderTabBar({ onActivate, onClose });

    fireEvent.click(getByTestId('tab-close-tab-2'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('tab-2');

    // stopPropagation prevents the tab's onClick from firing
    expect(onActivate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. + button calls onAddTerminal
  // -----------------------------------------------------------------------
  test('+ button calls onAddTerminal', () => {
    const onAddTerminal = mock(() => {});
    const { getByTestId } = renderTabBar({ onAddTerminal });

    fireEvent.click(getByTestId('tab-add'));

    expect(onAddTerminal).toHaveBeenCalledTimes(1);
  });
});
