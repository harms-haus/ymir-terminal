/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock ghostty-web
// ---------------------------------------------------------------------------

const mockFit = mock(() => {});
const mockDispose = mock(() => {});
const mockOpen = mock(() => {});
const mockLoadAddon = mock(() => {});

const mockFocus = mock(() => {});

const mockTerminalInstance = {
  cols: 80,
  rows: 24,
  open: mockOpen,
  loadAddon: mockLoadAddon,
  dispose: mockDispose,
  focus: mockFocus,
  write: mock(() => {}),
  onData: mock(() => ({ dispose: mock(() => {}) })),
  onResize: mock(() => ({ dispose: mock(() => {}) })),
};

const MockTerminal = mock(() => mockTerminalInstance);
const MockFitAddon = mock(() => ({
  fit: mockFit,
  dispose: mock(() => {}),
  activate: mock(() => {}),
}));
const mockInit = mock(() => Promise.resolve());

mock.module('ghostty-web', () => ({
  Terminal: MockTerminal,
  FitAddon: MockFitAddon,
  init: mockInit,
}));

// ---------------------------------------------------------------------------
// Mock useTerminal
// ---------------------------------------------------------------------------

const mockSendData = mock(() => {});
const mockOnOutput = mock(() => () => {});
const mockResizeTerminal = mock(() => {});
const mockCreateTerminal = mock(() => Promise.resolve({ terminalId: 'test-terminal' }));
const mockCloseTerminal = mock(() => {});

mock.module('../hooks/useTerminal', () => ({
  useTerminal: mock(() => ({
    sendData: mockSendData,
    onOutput: mockOnOutput,
    createTerminal: mockCreateTerminal,
    closeTerminal: mockCloseTerminal,
    resizeTerminal: mockResizeTerminal,
  })),
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
  } = {},
) {
  const { terminalId = 'test-terminal', cols, rows } = options;

  return render(
    React.createElement(Terminal, {
      terminalId,
      ...(cols !== undefined && { cols }),
      ...(rows !== undefined && { rows }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('Terminal', () => {
  beforeEach(() => {
    mockFit.mockClear();
    mockDispose.mockClear();
    mockOpen.mockClear();
    mockLoadAddon.mockClear();
    MockTerminal.mockClear();
    MockFitAddon.mockClear();
    mockInit.mockClear();
    mockTerminalInstance.onData.mockClear();
    mockOnOutput.mockClear();
    mockSendData.mockClear();
    mockResizeTerminal.mockClear();
    mockFocus.mockClear();
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
  // 3. Wires up terminal I/O on mount
  // -----------------------------------------------------------------------
  test('wires up terminal I/O on mount', async () => {
    renderTerminal();

    await waitFor(() => {
      expect(mockTerminalInstance.onData).toHaveBeenCalled();
    });
    expect(mockOnOutput).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. Creates a Terminal instance on mount
  // -----------------------------------------------------------------------
  test('creates a Terminal instance on mount', async () => {
    renderTerminal();

    await waitFor(() => {
      expect(MockTerminal).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Disposes terminal on unmount
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
  // 6. Passes cols and rows to Terminal constructor
  // -----------------------------------------------------------------------
  test('passes cols and rows options to Terminal constructor', async () => {
    renderTerminal({ cols: 120, rows: 40 });

    await waitFor(() => {
      expect(MockTerminal).toHaveBeenCalledWith({
        cols: 120,
        rows: 40,
        fontFamily: "'Cascadia Code Variable', 'JetBrainsMono Nerd Font', monospace",
        fontSize: 11,
      });
    });
  });

  // -----------------------------------------------------------------------
  // 7. Loads FitAddon
  // -----------------------------------------------------------------------
  test('loads FitAddon', async () => {
    renderTerminal();

    await waitFor(() => {
      expect(MockFitAddon).toHaveBeenCalledTimes(1);
    });
    expect(mockLoadAddon).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 8. Uses default cols and rows when not specified
  // -----------------------------------------------------------------------
  test('uses default cols=80 and rows=24 when not specified', async () => {
    renderTerminal();

    await waitFor(() => {
      expect(MockTerminal).toHaveBeenCalledWith({
        cols: 80,
        rows: 24,
        fontFamily: "'Cascadia Code Variable', 'JetBrainsMono Nerd Font', monospace",
        fontSize: 11,
      });
    });
  });

  // -----------------------------------------------------------------------
  // 9. Exposes focus() via imperative handle
  // -----------------------------------------------------------------------
  test('exposes focus() via imperative handle that calls term.focus()', async () => {
    const ref = React.createRef<{ focus(): void }>();
    render(React.createElement(Terminal, { terminalId: 'focus-test', ref }));

    await waitFor(() => {
      expect(MockTerminal).toHaveBeenCalledTimes(1);
    });

    expect(ref.current).toBeTruthy();
    ref.current!.focus();
    expect(mockFocus).toHaveBeenCalledTimes(1);
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
