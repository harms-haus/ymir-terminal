/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
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
    terminalId: overrides.terminalId ?? `term-${crypto.randomUUID().slice(0, 8)}`,
    tabId: overrides.tabId ?? `tab-${crypto.randomUUID().slice(0, 8)}`,
    owningPane: overrides.owningPane ?? ('content' as const),
    isActive: overrides.isActive ?? true,
    onTitleChange: mock(() => {}),
    onCwdChange: mock(() => {}),
  };
}

function renderManager(
  options: {
    terminals?: ReturnType<typeof makeTerminalEntry>[];
    contentBounds?: { top: number; left: number; width: number; height: number } | null;
    bottomBounds?: { top: number; left: number; width: number; height: number } | null;
  } = {},
) {
  const {
    terminals = [],
    contentBounds = { top: 0, left: 0, width: 800, height: 600 },
    bottomBounds = { top: 600, left: 0, width: 800, height: 200 },
  } = options;

  capturedTerminalRefs = new Map();

  const result = render(
    React.createElement(TerminalManager, {
      terminals,
      contentBounds,
      bottomBounds,
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

    const contentBounds = { top: 10, left: 20, width: 500, height: 400 };
    const bottomBounds = { top: 420, left: 20, width: 500, height: 150 };

    const { getByTestId } = renderManager({
      terminals: [entry1, entry2],
      contentBounds,
      bottomBounds,
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
  // 3. Handles null bounds gracefully — terminal is not rendered
  // -----------------------------------------------------------------------
  test('does not render a terminal when its owning pane bounds are null', () => {
    const entry = makeTerminalEntry({
      terminalId: 'term-null-bounds',
      tabId: 'tab-null',
      owningPane: 'content',
      isActive: true,
    });

    // contentBounds is null — the content terminal should not be rendered
    const { queryByTestId } = renderManager({
      terminals: [entry],
      contentBounds: null,
      bottomBounds: { top: 0, left: 0, width: 800, height: 200 },
    });

    expect(queryByTestId('mock-terminal-term-null-bounds')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 4. Handles both bounds null
  // -----------------------------------------------------------------------
  test('does not render any terminals when both contentBounds and bottomBounds are null', () => {
    const entry1 = makeTerminalEntry({ owningPane: 'content' });
    const entry2 = makeTerminalEntry({ owningPane: 'bottom' });

    const { getByTestId, queryByTestId } = renderManager({
      terminals: [entry1, entry2],
      contentBounds: null,
      bottomBounds: null,
    });

    // Overlay container still exists
    const overlay = getByTestId('terminal-overlay');
    expect(overlay).toBeTruthy();

    // No terminals rendered
    expect(queryByTestId(`mock-terminal-${entry1.terminalId}`)).toBeNull();
    expect(queryByTestId(`mock-terminal-${entry2.terminalId}`)).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 5. Only renders active terminal as visible (display: block vs none)
  // -----------------------------------------------------------------------
  test('only the active terminal has display: block; inactive terminals have display: none', () => {
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
      contentBounds: { top: 0, left: 0, width: 800, height: 600 },
      bottomBounds: null,
    });

    const activeWrapper = getByTestId('mock-terminal-term-active').parentElement!;
    expect(activeWrapper.style.display).toBe('block');
    expect(activeWrapper.style.pointerEvents).toBe('auto');

    const inactiveWrapper = getByTestId('mock-terminal-term-inactive').parentElement!;
    expect(inactiveWrapper.style.display).toBe('none');
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
      contentBounds: { top: 0, left: 0, width: 800, height: 600 },
      bottomBounds: null,
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
      contentBounds: { top: 0, left: 0, width: 800, height: 600 },
      bottomBounds: null,
    });

    // Both refs should be registered
    expect(terminalRefs.has('tab-1')).toBe(true);
    expect(terminalRefs.has('tab-2')).toBe(true);

    // Re-render with only entry1 — entry2 is removed
    rerender(
      React.createElement(TerminalManager, {
        terminals: [entry1],
        contentBounds: { top: 0, left: 0, width: 800, height: 600 },
        bottomBounds: null,
        terminalRefs: { current: terminalRefs } as React.MutableRefObject<
          Map<string, { focus(): void }>
        >,
      }),
    );

    // tab-2 ref should be cleaned up
    expect(terminalRefs.has('tab-1')).toBe(true);
    expect(terminalRefs.has('tab-2')).toBe(false);
  });
});
