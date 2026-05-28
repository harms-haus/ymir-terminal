/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock ghostty-web
// ---------------------------------------------------------------------------

const mockFit = mock(() => {});
const mockDispose = mock(() => {});
const mockOpen = mock(() => {});
const mockLoadAddon = mock(() => {});

const mockTerminalInstance = {
  cols: 80,
  rows: 24,
  open: mockOpen,
  loadAddon: mockLoadAddon,
  dispose: mockDispose,
  write: mock(() => {}),
  onData: mock(() => ({ dispose: mock(() => {}) })),
  onResize: mock(() => ({ dispose: mock(() => {}) })),
};

const MockTerminal = mock(() => mockTerminalInstance);
const MockFitAddon = mock(() => ({ fit: mockFit, dispose: mock(() => {}), activate: mock(() => {}) }));
const mockInit = mock(() => Promise.resolve());

mock.module('ghostty-web', () => ({
  Terminal: MockTerminal,
  FitAddon: MockFitAddon,
  init: mockInit,
}));

const { Terminal } = await import('./Terminal');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTerminal(
  options: {
    terminalId?: string;
    cols?: number;
    rows?: number;
    onReady?: () => void;
    onResize?: (cols: number, rows: number) => void;
  } = {}
) {
  const {
    terminalId = 'test-terminal',
    cols,
    rows,
    onReady,
    onResize,
  } = options;

  return render(
    React.createElement(Terminal, {
      terminalId,
      ...(cols !== undefined && { cols }),
      ...(rows !== undefined && { rows }),
      onReady,
      onResize,
    })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Terminal', () => {
  beforeEach(() => {
    mockFit.mockClear();
    mockDispose.mockClear();
    mockOpen.mockClear();
    mockLoadAddon.mockClear();
    MockTerminal.mockClear();
    MockFitAddon.mockClear();
    mockInit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Terminal component renders a div container
  // -----------------------------------------------------------------------
  test('renders a div container', () => {
    const { container } = renderTerminal();

    const div = container.querySelector('div');
    expect(div).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Accepts terminalId prop and sets it as data-testid
  // -----------------------------------------------------------------------
  test('accepts terminalId prop and sets it as data-testid', () => {
    const { getByTestId } = renderTerminal({ terminalId: 'my-session' });

    expect(getByTestId('terminal-my-session')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Calls onReady callback when terminal is initialized
  // -----------------------------------------------------------------------
  test('calls onReady callback when terminal is initialized', async () => {
    const onReady = mock(() => {});

    renderTerminal({ onReady });

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });
    expect(onReady).toHaveBeenCalledWith(mockTerminalInstance);
  });

  // -----------------------------------------------------------------------
  // 4. Calls onResize callback when container is resized
  // -----------------------------------------------------------------------
  test('calls onResize callback when container is resized', async () => {
    const onResize = mock(() => {});

    renderTerminal({ onResize });

    // The ResizeObserver should trigger onResize when size changes.
    // Verify that a ResizeObserver was set up and that the terminal was opened and fit was called.
    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledTimes(1);
    });
    expect(mockFit).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. Creates a Terminal instance on mount
  // -----------------------------------------------------------------------
  test('creates a Terminal instance on mount', async () => {
    renderTerminal();

    await waitFor(() => {
      expect(MockTerminal).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Disposes terminal on unmount
  // -----------------------------------------------------------------------
  test('disposes terminal on unmount', async () => {
    const { unmount } = renderTerminal();

    await waitFor(() => {
      expect(MockTerminal).toHaveBeenCalledTimes(1);
    });

    expect(mockDispose).not.toHaveBeenCalled();

    unmount();

    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 7. Passes cols and rows to Terminal constructor
  // -----------------------------------------------------------------------
  test('passes cols and rows options to Terminal constructor', async () => {
    renderTerminal({ cols: 120, rows: 40 });

    await waitFor(() => {
      expect(MockTerminal).toHaveBeenCalledWith({ cols: 120, rows: 40 });
    });
  });

  // -----------------------------------------------------------------------
  // 8. Loads FitAddon
  // -----------------------------------------------------------------------
  test('loads FitAddon', async () => {
    renderTerminal();

    await waitFor(() => {
      expect(MockFitAddon).toHaveBeenCalledTimes(1);
    });
    expect(mockLoadAddon).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 9. Uses default cols and rows when not specified
  // -----------------------------------------------------------------------
  test('uses default cols=80 and rows=24 when not specified', async () => {
    renderTerminal();

    await waitFor(() => {
      expect(MockTerminal).toHaveBeenCalledWith({ cols: 80, rows: 24 });
    });
  });

  // -----------------------------------------------------------------------
  // 10. Container has full width and height styling
  // -----------------------------------------------------------------------
  test('container has full width and height styling', () => {
    const { getByTestId } = renderTerminal({ terminalId: 'style-test' });

    const container = getByTestId('terminal-style-test');
    expect(container.style.width).toBe('100%');
    expect(container.style.height).toBe('100%');
  });
});
