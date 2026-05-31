/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { TabBar } from './TabBar';
import type { Tab } from '../hooks/useTabs';

// ---------------------------------------------------------------------------
// Mock TabContextMenu — captures callbacks via ref + data attributes
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
mock.module('./TabContextMenu', () => ({
  TabContextMenu: ({
    children,
    onClose,
    onCloseRight,
    onCloseOthers,
    onRename,
  }: {
    children: React.ReactNode;
    canCloseRight: boolean;
    canCloseOthers: boolean;
    onClose: () => void;
    onCloseRight: () => void;
    onCloseOthers: () => void;
    onRename: () => void;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'mock-tab-context-menu',
        'data-has-close': 'true',
        'data-has-close-right': typeof onCloseRight === 'function' ? 'true' : 'false',
        'data-has-close-others': typeof onCloseOthers === 'function' ? 'true' : 'false',
        'data-has-rename': typeof onRename === 'function' ? 'true' : 'false',
        ref: (el: HTMLElement | null) => {
          if (el) {
            (el as any).__onRename = onRename;
            (el as any).__onClose = onClose;
            (el as any).__onCloseRight = onCloseRight;
            (el as any).__onCloseOthers = onCloseOthers;
          }
        },
      },
      children,
    ),
}));
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleTabs: Tab[] = [
  { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
  { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
  { id: 'tab-3', type: 'editor', title: 'index.ts', filePath: '/src/index.ts' },
];

const sampleTabsWithCwd: Tab[] = [
  {
    id: 'tab-1',
    type: 'terminal',
    title: 'Terminal 1',
    terminalId: 'term-1',
    cwd: '/home/user/project',
  },
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
    variant?: 'content' | 'bottom';
    onCloseRight?: (tabId: string) => void;
    onCloseOthers?: (tabId: string) => void;
    onRename?: (tabId: string, newTitle: string) => void;
  } = {},
) {
  const onActivate = overrides.onActivate ?? mock(() => {});
  const onClose = overrides.onClose ?? mock(() => {});
  const onAddTerminal = overrides.onAddTerminal ?? mock(() => {});
  const onCloseRight = overrides.onCloseRight ?? mock(() => {});
  const onCloseOthers = overrides.onCloseOthers ?? mock(() => {});
  const onRename = overrides.onRename ?? mock(() => {});

  const result = render(
    React.createElement(TabBar, {
      tabs: overrides.tabs ?? sampleTabs,
      activeTabId: overrides.activeTabId ?? 'tab-1',
      onActivate,
      onClose,
      onAddTerminal,
      variant: overrides.variant,
      onCloseRight,
      onCloseOthers,
      onRename,
    }),
  );

  return { onActivate, onClose, onAddTerminal, onCloseRight, onCloseOthers, onRename, ...result };
}

/**
 * React's style renderer expands all border shorthand properties into
 * individual longhands when rendered in happy-dom.  For example:
 *   border-top: 2px solid var(--accent)
 * becomes:
 *   border-top-width: var(--accent); border-top-style: var(--accent); border-top-color: var(--accent);
 *
 * This helper checks that all three longhands of a given shorthand are
 * present in the raw style attribute and match the expected value.
 */
function styleHasBorderLonghands(
  el: HTMLElement,
  shorthand: string,
  expectedValue: string,
): boolean {
  const raw = el.getAttribute('style') ?? '';
  const escaped = expectedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const longhands = ['width', 'style', 'color'];
  return longhands.every((lh) => {
    const re = new RegExp(`${shorthand}-${lh}:\\s*${escaped}`);
    return re.test(raw);
  });
}

/**
 * React's style renderer also expands non-custom-property border shorthands
 * into longhands.  This checks that the longhands have the expected components
 * (e.g. width=2px, style=solid, color=transparent).
 */
function styleHasBorderParts(
  el: HTMLElement,
  shorthand: string,
  width: string,
  style_: string,
  color: string,
): boolean {
  const raw = el.getAttribute('style') ?? '';
  return (
    new RegExp(`${shorthand}-width:\\s*${width}\\b`).test(raw) &&
    new RegExp(`${shorthand}-style:\\s*${style_}\\b`).test(raw) &&
    new RegExp(`${shorthand}-color:\\s*${color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(
      raw,
    )
  );
}

/**
 * Simulate changing a React controlled input's value.
 *
 * happy-dom's fireEvent.change does not trigger React's internal change
 * detection for controlled inputs. We directly invoke the onChange handler
 * from React's internal props to update the component state.
 */
function setReactInputValue(input: HTMLInputElement, value: string) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const reactPropsKey = Object.keys(input).find((k) => k.startsWith('__reactProps'));
  if (!reactPropsKey) throw new Error('Could not find React internal props on input');
  const props = (input as any)[reactPropsKey];
  if (typeof props?.onChange !== 'function') throw new Error('onChange not found on React props');
  act(() => {
    props.onChange({ target: { value } });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

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
  // 2. Active tab has distinct styling (background color) — content variant
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

  // -----------------------------------------------------------------------
  // 6. Variant 'bottom' renders with bottom styling
  // -----------------------------------------------------------------------
  test('variant bottom renders with bottom styling', () => {
    const { container } = renderTabBar({ variant: 'bottom', activeTabId: 'tab-2' });

    const activeTab = container.querySelector('[data-testid="tab-tab-2"]') as HTMLElement;
    const inactiveTab = container.querySelector('[data-testid="tab-tab-1"]') as HTMLElement;

    expect(activeTab).toBeTruthy();
    expect(inactiveTab).toBeTruthy();

    // Active: COLOR_BG_PRIMARY, inactive: transparent
    expect(activeTab.style.background).toBe('#1e1e1e');
    expect(inactiveTab.style.background).toBe('transparent');

    // Active text: COLOR_TEXT_BRIGHT (#fff), inactive: COLOR_TEXT_MUTED (#888)
    expect(activeTab.style.color).toBe('#fff');
    expect(inactiveTab.style.color).toBe('#888');

    // Font size 12px
    expect(activeTab.style.fontSize).toBe('12px');
    expect(inactiveTab.style.fontSize).toBe('12px');

    // Active border-bottom is transparent (no accent line at bottom for bottom panel)
    expect(styleHasBorderParts(activeTab, 'border-bottom', '1px', 'solid', 'transparent')).toBe(
      true,
    );
    // Inactive border-bottom is transparent — also expanded to longhands
    expect(styleHasBorderParts(inactiveTab, 'border-bottom', '1px', 'solid', 'transparent')).toBe(
      true,
    );
  });

  // -----------------------------------------------------------------------
  // 7. Middle-click (auxClick with button 1) calls onClose
  // -----------------------------------------------------------------------
  test('middle-click calls onClose', () => {
    const onClose = mock(() => {});
    const { getByTestId } = renderTabBar({ onClose });

    fireEvent(getByTestId('tab-tab-2'), new MouseEvent('auxclick', { bubbles: true, button: 1 }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('tab-2');
  });

  // -----------------------------------------------------------------------
  // 8. Active tab has accent color border at top
  // -----------------------------------------------------------------------
  test('active tab has accent border at top', () => {
    const { container } = renderTabBar({ activeTabId: 'tab-2' });

    const activeTab = container.querySelector('[data-testid="tab-tab-2"]') as HTMLElement;
    const inactiveTab = container.querySelector('[data-testid="tab-tab-1"]') as HTMLElement;

    expect(activeTab).toBeTruthy();
    expect(inactiveTab).toBeTruthy();

    // Active border-top uses var(--accent) — expanded to longhands
    expect(styleHasBorderLonghands(activeTab, 'border-top', 'var(--accent)')).toBe(true);
    // Inactive border-top is transparent — expanded to longhands
    expect(styleHasBorderParts(inactiveTab, 'border-top', '2px', 'solid', 'transparent')).toBe(
      true,
    );
  });

  // -----------------------------------------------------------------------
  // 9. TabContextMenu wraps each tab
  // -----------------------------------------------------------------------
  test('TabContextMenu wraps each tab', () => {
    const { container } = renderTabBar();

    const contextMenus = container.querySelectorAll('[data-testid="mock-tab-context-menu"]');
    expect(contextMenus.length).toBe(3);

    // Each context menu contains a tab
    for (let i = 0; i < contextMenus.length; i++) {
      const tabEl = contextMenus[i].querySelector(`[data-testid="tab-${sampleTabs[i].id}"]`);
      expect(tabEl).toBeTruthy();
    }
  });

  // -----------------------------------------------------------------------
  // 10. Close Others callback is wired
  // -----------------------------------------------------------------------
  test('Close Others callback is wired', () => {
    const onCloseOthers = mock(() => {});
    const { container } = renderTabBar({ onCloseOthers });

    const contextMenus = container.querySelectorAll('[data-testid="mock-tab-context-menu"]');
    expect(contextMenus.length).toBeGreaterThan(0);

    for (const menu of contextMenus) {
      expect((menu as HTMLElement).dataset.hasCloseOthers).toBe('true');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (menu as any).__onCloseOthers).toBe('function');
    }
  });

  // -----------------------------------------------------------------------
  // 11. Close Right callback is wired
  // -----------------------------------------------------------------------
  test('Close Right callback is wired', () => {
    const onCloseRight = mock(() => {});
    const { container } = renderTabBar({ onCloseRight });

    const contextMenus = container.querySelectorAll('[data-testid="mock-tab-context-menu"]');
    expect(contextMenus.length).toBeGreaterThan(0);

    for (const menu of contextMenus) {
      expect((menu as HTMLElement).dataset.hasCloseRight).toBe('true');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (menu as any).__onCloseRight).toBe('function');
    }
  });

  // -----------------------------------------------------------------------
  // 12. Rename triggers inline editing mode
  // -----------------------------------------------------------------------
  test('rename triggers inline editing mode', () => {
    const onRenameMock = mock((_tabId: string, _newTitle: string) => {});
    const { container } = renderTabBar({
      onRename: onRenameMock,
      tabs: [{ id: 't1', type: 'terminal', title: 'My Term', terminalId: 'tr1' }],
      activeTabId: 't1',
    });

    // Initially no input
    expect(container.querySelectorAll('input').length).toBe(0);

    // Get the context menu mock element and trigger rename
    const contextMenuEl = container.querySelector(
      '[data-testid="mock-tab-context-menu"]',
    ) as HTMLElement;
    expect(contextMenuEl).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (contextMenuEl as any).__onRename).toBe('function');

    // Trigger rename — this causes a React state update
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contextMenuEl as any).__onRename();
    });

    // Now an input should appear
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBe(1);
    expect((inputs[0] as HTMLInputElement).value).toBe('My Term');
  });

  // -----------------------------------------------------------------------
  // 13. Inline rename commits on Enter and calls onRename
  // -----------------------------------------------------------------------
  test('inline rename commits on Enter and calls onRename', () => {
    const onRenameMock = mock((_tabId: string, _newTitle: string) => {});
    const { container } = renderTabBar({
      onRename: onRenameMock,
      tabs: [{ id: 't1', type: 'terminal', title: 'My Term', terminalId: 'tr1' }],
      activeTabId: 't1',
    });

    // Trigger rename
    const contextMenuEl = container.querySelector(
      '[data-testid="mock-tab-context-menu"]',
    ) as HTMLElement;
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contextMenuEl as any).__onRename();
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Change the value via React's internal onChange (fireEvent.change
    // doesn't work for controlled inputs in happy-dom)
    setReactInputValue(input, 'New Name');

    // Press Enter to commit
    fireEvent.keyDown(input, { key: 'Enter' });

    // onRename should be called
    expect(onRenameMock).toHaveBeenCalledTimes(1);
    expect(onRenameMock).toHaveBeenCalledWith('t1', 'New Name');

    // Input should be gone
    expect(container.querySelectorAll('input').length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 14. Inline rename cancels on Escape
  // -----------------------------------------------------------------------
  test('inline rename cancels on Escape', () => {
    const onRenameMock = mock((_tabId: string, _newTitle: string) => {});
    const { container } = renderTabBar({
      onRename: onRenameMock,
      tabs: [{ id: 't1', type: 'terminal', title: 'My Term', terminalId: 'tr1' }],
      activeTabId: 't1',
    });

    // Trigger rename
    const contextMenuEl = container.querySelector(
      '[data-testid="mock-tab-context-menu"]',
    ) as HTMLElement;
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contextMenuEl as any).__onRename();
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Change the value
    setReactInputValue(input, 'Changed');

    // Press Escape to cancel
    fireEvent.keyDown(input, { key: 'Escape' });

    // onRename should NOT be called
    expect(onRenameMock).not.toHaveBeenCalled();

    // Input should be gone
    expect(container.querySelectorAll('input').length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 15. Inline rename does not call onRename when value is empty
  // -----------------------------------------------------------------------
  test('inline rename does not call onRename when value is empty', () => {
    const onRenameMock = mock((_tabId: string, _newTitle: string) => {});
    const { container } = renderTabBar({
      onRename: onRenameMock,
      tabs: [{ id: 't1', type: 'terminal', title: 'My Term', terminalId: 'tr1' }],
      activeTabId: 't1',
    });

    // Trigger rename
    const contextMenuEl = container.querySelector(
      '[data-testid="mock-tab-context-menu"]',
    ) as HTMLElement;
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contextMenuEl as any).__onRename();
    });

    const input = container.querySelector('input') as HTMLInputElement;

    // Clear the value
    setReactInputValue(input, '   ');

    // Press Enter
    fireEvent.keyDown(input, { key: 'Enter' });

    // onRename IS called with empty string so useTabs can clear customTitle
    expect(onRenameMock).toHaveBeenCalledWith('t1', '');
  });

  // -----------------------------------------------------------------------
  // 16. Inline rename does not call onRename when value unchanged
  // -----------------------------------------------------------------------
  test('inline rename does not call onRename when value unchanged', () => {
    const onRenameMock = mock((_tabId: string, _newTitle: string) => {});
    const { container } = renderTabBar({
      onRename: onRenameMock,
      tabs: [{ id: 't1', type: 'terminal', title: 'My Term', terminalId: 'tr1' }],
      activeTabId: 't1',
    });

    // Trigger rename
    const contextMenuEl = container.querySelector(
      '[data-testid="mock-tab-context-menu"]',
    ) as HTMLElement;
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contextMenuEl as any).__onRename();
    });

    const input = container.querySelector('input') as HTMLInputElement;

    // Don't change the value, just press Enter
    fireEvent.keyDown(input, { key: 'Enter' });

    // onRename IS called with same value so useTabs can decide
    expect(onRenameMock).toHaveBeenCalledWith('t1', 'My Term');
  });

  // -----------------------------------------------------------------------
  // 17. Terminal tab with cwd shows title attribute
  // -----------------------------------------------------------------------
  test('terminal tab with cwd shows title attribute', () => {
    const { container } = renderTabBar({ tabs: sampleTabsWithCwd });

    const tab1 = container.querySelector('[data-testid="tab-tab-1"]') as HTMLElement;
    expect(tab1.title).toBe('/home/user/project');
  });

  // -----------------------------------------------------------------------
  // 18. Terminal tab without cwd shows Terminal as title attribute
  // -----------------------------------------------------------------------
  test('terminal tab without cwd shows Terminal as title attribute', () => {
    const { container } = renderTabBar({ tabs: sampleTabsWithCwd });

    const tab2 = container.querySelector('[data-testid="tab-tab-2"]') as HTMLElement;
    expect(tab2.title).toBe('Terminal');
  });

  // -----------------------------------------------------------------------
  // 19. Editor tab shows filePath as title attribute
  // -----------------------------------------------------------------------
  test('editor tab shows filePath as title attribute', () => {
    const { container } = renderTabBar({ tabs: sampleTabsWithCwd });

    const tab3 = container.querySelector('[data-testid="tab-tab-3"]') as HTMLElement;
    expect(tab3.title).toBe('/src/index.ts');
  });

  // -----------------------------------------------------------------------
  // 20. Tab shows customTitle when set, falls back to title
  // -----------------------------------------------------------------------
  test('tab shows customTitle when set, falls back to title when not set', () => {
    const tabsWithCustomTitle: Tab[] = [
      {
        id: 'tab-1',
        type: 'terminal',
        title: 'Terminal 1',
        terminalId: 'term-1',
        customTitle: 'My Custom Tab',
      },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
    ];

    const { container } = renderTabBar({ tabs: tabsWithCustomTitle, activeTabId: 'tab-1' });

    // Tab with customTitle should display the custom title
    const tab1 = container.querySelector('[data-testid="tab-tab-1"]') as HTMLElement;
    const span1 = tab1.querySelector('span') as HTMLElement;
    expect(span1.textContent).toBe('My Custom Tab');

    // Tab without customTitle should fall back to title
    const tab2 = container.querySelector('[data-testid="tab-tab-2"]') as HTMLElement;
    const span2 = tab2.querySelector('span') as HTMLElement;
    expect(span2.textContent).toBe('Terminal 2');
  });

  // -----------------------------------------------------------------------
  // 21. Rename input pre-fills with customTitle if set
  // -----------------------------------------------------------------------
  test('rename input pre-fills with customTitle when set', () => {
    const onRenameMock = mock((_tabId: string, _newTitle: string) => {});
    const { container } = renderTabBar({
      onRename: onRenameMock,
      tabs: [
        {
          id: 't1',
          type: 'terminal',
          title: 'Terminal 1',
          terminalId: 'tr1',
          customTitle: 'Custom Name',
        },
      ],
      activeTabId: 't1',
    });

    // Trigger rename
    const contextMenuEl = container.querySelector(
      '[data-testid="mock-tab-context-menu"]',
    ) as HTMLElement;
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contextMenuEl as any).__onRename();
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    // Input should be pre-filled with customTitle, not title
    expect(input.value).toBe('Custom Name');
  });
});
