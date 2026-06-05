/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
import { generateId } from '@ymir/shared';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Capture Terminal ref callback registrations via the imperative handle
// ---------------------------------------------------------------------------

let capturedTerminalRefs: Map<string, { focus(): void }> | null = null;

// Mock Terminal component — renders a minimal div so we can verify it mounts
mock.module('./Terminal', () => ({
  Terminal: React.forwardRef(function MockTerminal(
    {
      terminalId,
    }: {
      terminalId: string;
      onTitleChange?: (title: string) => void;
      onCwdChange?: (cwd: string) => void;
    },
    ref: React.Ref<{ focus(): void }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      focus: mock(() => {}),
    }));
    return React.createElement('div', { 'data-testid': `mock-terminal-${terminalId}` });
  }),
}));

const { TerminalManager } = await import('./TerminalManager');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTerminalEntry(
  overrides: Partial<{
    terminalId: string;
    tabId: string;
    owningPane: 'content' | 'bottom';
    isActive: boolean;
  }> = {},
) {
  return {
    terminalId: overrides.terminalId ?? `term-${generateId().slice(0, 8)}`,
    tabId: overrides.tabId ?? `tab-${generateId().slice(0, 8)}`,
    owningPane: overrides.owningPane ?? ('content' as const),
    isActive: overrides.isActive ?? true,
    onTitleChange: mock(() => {}),
    onCwdChange: mock(() => {}),
  };
}

function makeGetPaneBounds(
  bounds: Record<string, { top: number; left: number; width: number; height: number } | null>,
): (paneId: string) => { top: number; left: number; width: number; height: number } | null {
  const map = new Map(Object.entries(bounds));
  return (paneId: string) => map.get(paneId) ?? null;
}

function renderManager(
  options: {
    terminals?: ReturnType<typeof makeTerminalEntry>[];
    paneBounds?: Record<
      string,
      { top: number; left: number; width: number; height: number } | null
    >;
  } = {},
) {
  const { terminals = [], paneBounds } = options;

  capturedTerminalRefs = new Map();

  const getPaneBounds = makeGetPaneBounds(
    paneBounds ?? {
      content: { top: 0, left: 0, width: 800, height: 600 },
      bottom: { top: 600, left: 0, width: 800, height: 200 },
    },
  );

  const result = render(
    React.createElement(TerminalManager, {
      terminals,
      getPaneBounds,
      terminalRefs: { current: capturedTerminalRefs } as React.MutableRefObject<
        Map<string, { focus(): void }>
      >,
    }),
  );

  return { ...result, terminalRefs: capturedTerminalRefs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('TerminalManager', () => {
  beforeEach(() => {
    capturedTerminalRefs = null;
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders nothing meaningful when terminals array is empty
  // -----------------------------------------------------------------------
  test('renders the overlay container but no terminal children when terminals is empty', () => {
    const { container, getByTestId } = renderManager({ terminals: [] });

    // The outer overlay container exists
    const overlay = getByTestId('terminal-overlay');
    expect(overlay).toBeTruthy();

    // No terminal children rendered inside the overlay
    const terminalDivs = overlay.querySelectorAll('[data-testid^="mock-terminal-"]');
    expect(terminalDivs.length).toBe(0);

    // Confirm the container has no child elements other than the overlay
    expect(container.children.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 2. Renders terminal overlays at correct positions for given bounds
  // -----------------------------------------------------------------------
  test('positions each terminal overlay at the correct bounds', () => {
    const entry1 = makeTerminalEntry({
      terminalId: 'term-content',
      tabId: 'tab-content',
      owningPane: 'content',
      isActive: true,
    });
    const entry2 = makeTerminalEntry({
      terminalId: 'term-bottom',
      tabId: 'tab-bottom',
      owningPane: 'bottom',
      isActive: true,
    });

    const { getByTestId } = renderManager({
      terminals: [entry1, entry2],
      paneBounds: {
        content: { top: 10, left: 20, width: 500, height: 400 },
        bottom: { top: 420, left: 20, width: 500, height: 150 },
      },
    });

    // Content terminal should use contentBounds
    const contentWrapper = getByTestId('mock-terminal-term-content').parentElement!;
    expect(contentWrapper.style.top).toBe('10px');
    expect(contentWrapper.style.left).toBe('20px');
    expect(contentWrapper.style.width).toBe('500px');
    expect(contentWrapper.style.height).toBe('400px');

    // Bottom terminal should use bottomBounds
    const bottomWrapper = getByTestId('mock-terminal-term-bottom').parentElement!;
    expect(bottomWrapper.style.top).toBe('420px');
    expect(bottomWrapper.style.left).toBe('20px');
    expect(bottomWrapper.style.width).toBe('500px');
    expect(bottomWrapper.style.height).toBe('150px');
  });

  // -----------------------------------------------------------------------
  // 3. Handles null bounds gracefully — terminal is rendered in hidden zero-size div
  // -----------------------------------------------------------------------
  test('renders terminal in hidden zero-size div when pane bounds are null', () => {
    const entry = makeTerminalEntry({
      terminalId: 'term-null-bounds',
      tabId: 'tab-null',
      owningPane: 'content',
      isActive: true,
    });

    // content pane bounds are null — the terminal is rendered but hidden in a zero-size div
    const { queryByTestId } = renderManager({
      terminals: [entry],
      paneBounds: {
        content: null,
        bottom: { top: 0, left: 0, width: 800, height: 200 },
      },
    });

    const terminal = queryByTestId('mock-terminal-term-null-bounds');
    expect(terminal).not.toBeNull();

    const wrapper = terminal!.parentElement!;
    expect(wrapper.style.width).toBe('0px');
    expect(wrapper.style.height).toBe('0px');
    expect(wrapper.style.overflow).toBe('hidden');
    expect(wrapper.style.pointerEvents).toBe('none');
  });

  // -----------------------------------------------------------------------
  // 4. Handles both bounds null — both terminals rendered in hidden zero-size divs
  // -----------------------------------------------------------------------
  test('renders both terminals in hidden zero-size divs when both contentBounds and bottomBounds are null', () => {
    const entry1 = makeTerminalEntry({ owningPane: 'content' });
    const entry2 = makeTerminalEntry({ owningPane: 'bottom' });

    const { getByTestId, queryByTestId } = renderManager({
      terminals: [entry1, entry2],
      paneBounds: { content: null, bottom: null },
    });

    // Overlay container still exists
    const overlay = getByTestId('terminal-overlay');
    expect(overlay).toBeTruthy();

    // Both terminals are rendered but hidden in zero-size divs
    const term1 = queryByTestId(`mock-terminal-${entry1.terminalId}`);
    expect(term1).not.toBeNull();
    expect(term1!.parentElement!.style.width).toBe('0px');
    expect(term1!.parentElement!.style.height).toBe('0px');

    const term2 = queryByTestId(`mock-terminal-${entry2.terminalId}`);
    expect(term2).not.toBeNull();
    expect(term2!.parentElement!.style.width).toBe('0px');
    expect(term2!.parentElement!.style.height).toBe('0px');
  });

  // -----------------------------------------------------------------------
  // 5. Only renders active terminal as visible (visibility: visible vs hidden)
  // -----------------------------------------------------------------------
  test('only the active terminal has visibility: visible; inactive terminals have visibility: hidden', () => {
    const active = makeTerminalEntry({
      terminalId: 'term-active',
      tabId: 'tab-active',
      owningPane: 'content',
      isActive: true,
    });
    const inactive = makeTerminalEntry({
      terminalId: 'term-inactive',
      tabId: 'tab-inactive',
      owningPane: 'content',
      isActive: false,
    });

    const { getByTestId } = renderManager({
      terminals: [active, inactive],
      paneBounds: {
        content: { top: 0, left: 0, width: 800, height: 600 },
        bottom: null,
      },
    });

    const activeWrapper = getByTestId('mock-terminal-term-active').parentElement!;
    expect(activeWrapper.style.display).not.toBe('none');
    expect(activeWrapper.style.visibility).not.toBe('hidden');
    expect(activeWrapper.style.pointerEvents).toBe('auto');

    const inactiveWrapper = getByTestId('mock-terminal-term-inactive').parentElement!;
    expect(inactiveWrapper.style.display).not.toBe('none');
    expect(inactiveWrapper.style.visibility).toBe('hidden');
    expect(inactiveWrapper.style.pointerEvents).toBe('none');
  });

  // -----------------------------------------------------------------------
  // 6. Registers terminal refs for active entries
  // -----------------------------------------------------------------------
  test('registers terminal refs via the ref callback', () => {
    const entry = makeTerminalEntry({
      terminalId: 'term-ref',
      tabId: 'tab-ref',
      owningPane: 'content',
      isActive: true,
    });

    const { terminalRefs } = renderManager({
      terminals: [entry],
      paneBounds: {
        content: { top: 0, left: 0, width: 800, height: 600 },
        bottom: null,
      },
    });

    // The terminal ref should have been registered with the tabId as key
    expect(terminalRefs.has('tab-ref')).toBe(true);
    expect(typeof terminalRefs.get('tab-ref')!.focus).toBe('function');
  });

  // -----------------------------------------------------------------------
  // 7. Overlay container has pointer-events: none
  // -----------------------------------------------------------------------
  test('overlay container has pointer-events: none', () => {
    const { getByTestId } = renderManager({ terminals: [] });

    const overlay = getByTestId('terminal-overlay');
    expect(overlay.style.pointerEvents).toBe('none');
  });

  // -----------------------------------------------------------------------
  // 8. Cleans up stale ref entries when terminals change
  // -----------------------------------------------------------------------
  test('cleans up stale ref entries for removed terminals on re-render', () => {
    const entry1 = makeTerminalEntry({
      terminalId: 'term-1',
      tabId: 'tab-1',
      owningPane: 'content',
      isActive: true,
    });
    const entry2 = makeTerminalEntry({
      terminalId: 'term-2',
      tabId: 'tab-2',
      owningPane: 'content',
      isActive: false,
    });

    const { terminalRefs, rerender } = renderManager({
      terminals: [entry1, entry2],
      paneBounds: {
        content: { top: 0, left: 0, width: 800, height: 600 },
        bottom: null,
      },
    });

    // Both refs should be registered
    expect(terminalRefs.has('tab-1')).toBe(true);
    expect(terminalRefs.has('tab-2')).toBe(true);

    // Re-render with only entry1 — entry2 is removed
    const getPaneBounds = makeGetPaneBounds({
      content: { top: 0, left: 0, width: 800, height: 600 },
      bottom: null,
    });
    rerender(
      React.createElement(TerminalManager, {
        terminals: [entry1],
        getPaneBounds,
        terminalRefs: { current: terminalRefs } as React.MutableRefObject<
          Map<string, { focus(): void }>
        >,
      }),
    );

    // tab-2 ref should be cleaned up
    expect(terminalRefs.has('tab-1')).toBe(true);
    expect(terminalRefs.has('tab-2')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 9. Uses last known bounds instead of 0×0 when pane bounds become null
  // -----------------------------------------------------------------------
  test('uses last known bounds instead of 0×0 when pane bounds become null', () => {
    const entry = makeTerminalEntry({
      terminalId: 'term-lkb',
      tabId: 'tab-lkb',
      owningPane: 'content',
      isActive: true,
    });

    const { getByTestId, rerender } = renderManager({
      terminals: [entry],
      paneBounds: {
        content: { top: 10, left: 20, width: 500, height: 400 },
        bottom: null,
      },
    });

    // Initially positioned at the real bounds
    const wrapper = getByTestId('mock-terminal-term-lkb').parentElement!;
    expect(wrapper.style.width).toBe('500px');
    expect(wrapper.style.height).toBe('400px');
    expect(wrapper.style.top).toBe('10px');
    expect(wrapper.style.left).toBe('20px');

    // Re-render with bounds returning null for 'content'
    const getPaneBoundsNull = makeGetPaneBounds({
      content: null,
      bottom: null,
    });
    rerender(
      React.createElement(TerminalManager, {
        terminals: [entry],
        getPaneBounds: getPaneBoundsNull,
        terminalRefs: { current: capturedTerminalRefs! } as React.MutableRefObject<
          Map<string, { focus(): void }>
        >,
      }),
    );

    // The wrapper should STILL have the last known bounds, not 0×0
    const wrapperAfter = getByTestId('mock-terminal-term-lkb').parentElement!;
    expect(wrapperAfter.style.width).toBe('500px');
    expect(wrapperAfter.style.height).toBe('400px');
    expect(wrapperAfter.style.top).toBe('10px');
    expect(wrapperAfter.style.left).toBe('20px');
  });

  // -----------------------------------------------------------------------
  // 10. Inactive terminal uses visibility:hidden instead of display:none
  // -----------------------------------------------------------------------
  test('inactive terminal uses visibility:hidden instead of display:none', () => {
    const active = makeTerminalEntry({
      terminalId: 'term-active-vis',
      tabId: 'tab-active-vis',
      owningPane: 'content',
      isActive: true,
    });
    const inactive = makeTerminalEntry({
      terminalId: 'term-inactive-vis',
      tabId: 'tab-inactive-vis',
      owningPane: 'content',
      isActive: false,
    });

    const { getByTestId } = renderManager({
      terminals: [active, inactive],
      paneBounds: {
        content: { top: 0, left: 0, width: 800, height: 600 },
        bottom: null,
      },
    });

    // Active terminal: visibility visible, no display:none
    const activeWrapper = getByTestId('mock-terminal-term-active-vis').parentElement!;
    expect(activeWrapper.style.display).not.toBe('none');
    expect(activeWrapper.style.visibility).not.toBe('hidden');
    expect(activeWrapper.style.width).toBe('800px');
    expect(activeWrapper.style.height).toBe('600px');

    // Inactive terminal: must use visibility:hidden, NOT display:none
    const inactiveWrapper = getByTestId('mock-terminal-term-inactive-vis').parentElement!;
    expect(inactiveWrapper.style.display).not.toBe('none');
    expect(inactiveWrapper.style.visibility).toBe('hidden');
    // The inactive terminal should still have correct dimensions
    expect(inactiveWrapper.style.width).toBe('800px');
    expect(inactiveWrapper.style.height).toBe('600px');
  });

  // -----------------------------------------------------------------------
  // 11. Terminal that never had bounds still renders in a 0×0 div as fallback
  // -----------------------------------------------------------------------
  test('terminal that never had bounds still renders in a 0×0 div as fallback', () => {
    const entry = makeTerminalEntry({
      terminalId: 'term-nobounds',
      tabId: 'tab-nobounds',
      owningPane: 'newpane',
      isActive: true,
    });

    // 'newpane' is not in the bounds map at all — getPaneBounds returns null
    const { queryByTestId } = renderManager({
      terminals: [entry],
      paneBounds: {
        content: { top: 0, left: 0, width: 800, height: 600 },
        bottom: null,
      },
    });

    const terminal = queryByTestId('mock-terminal-term-nobounds');
    expect(terminal).not.toBeNull();

    const wrapper = terminal!.parentElement!;
    // No prior render for 'newpane' → 0×0 fallback
    expect(wrapper.style.width).toBe('0px');
    expect(wrapper.style.height).toBe('0px');
  });

  // -----------------------------------------------------------------------
  // 12. Bounds are restored when a pane returns after being null
  // -----------------------------------------------------------------------
  test('bounds are restored when a pane returns after being null', () => {
    const entry = makeTerminalEntry({
      terminalId: 'term-restore',
      tabId: 'tab-restore',
      owningPane: 'content',
      isActive: true,
    });

    const { getByTestId, rerender } = renderManager({
      terminals: [entry],
      paneBounds: {
        content: { top: 0, left: 0, width: 800, height: 600 },
        bottom: null,
      },
    });

    // Phase 1: valid bounds
    let wrapper = getByTestId('mock-terminal-term-restore').parentElement!;
    expect(wrapper.style.width).toBe('800px');
    expect(wrapper.style.height).toBe('600px');

    // Phase 2: bounds become null → should preserve last known (800×600)
    rerender(
      React.createElement(TerminalManager, {
        terminals: [entry],
        getPaneBounds: makeGetPaneBounds({ content: null, bottom: null }),
        terminalRefs: { current: capturedTerminalRefs! } as React.MutableRefObject<
          Map<string, { focus(): void }>
        >,
      }),
    );
    wrapper = getByTestId('mock-terminal-term-restore').parentElement!;
    expect(wrapper.style.width).toBe('800px');
    expect(wrapper.style.height).toBe('600px');

    // Phase 3: bounds come back with NEW dimensions → should use the new values
    rerender(
      React.createElement(TerminalManager, {
        terminals: [entry],
        getPaneBounds: makeGetPaneBounds({
          content: { top: 50, left: 50, width: 700, height: 500 },
          bottom: null,
        }),
        terminalRefs: { current: capturedTerminalRefs! } as React.MutableRefObject<
          Map<string, { focus(): void }>
        >,
      }),
    );
    wrapper = getByTestId('mock-terminal-term-restore').parentElement!;
    expect(wrapper.style.width).toBe('700px');
    expect(wrapper.style.height).toBe('500px');
    expect(wrapper.style.top).toBe('50px');
    expect(wrapper.style.left).toBe('50px');
  });
});
