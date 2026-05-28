/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useTabs
// ---------------------------------------------------------------------------

type Tab = {
  id: string;
  type: 'terminal' | 'editor';
  title: string;
  terminalId?: string;
};

let mockTabs: Tab[] = [];
let mockActiveTabId: string | null = null;
let mockCreateTab: (opts: { type: 'terminal' | 'editor'; title: string; terminalId?: string }) => string;
let mockCloseTab: (id: string) => void;
let mockActivateTab: (id: string) => void;

mock.module('../hooks/useTabs', () => ({
  useTabs: () => ({
    tabs: mockTabs,
    activeTabId: mockActiveTabId,
    createTab: mockCreateTab,
    closeTab: mockCloseTab,
    activateTab: mockActivateTab,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Tab: {} as any,
}));

// ---------------------------------------------------------------------------
// Mock useTerminal
// ---------------------------------------------------------------------------

let mockSendData: (data: string) => void;
let mockOnOutput: (handler: (data: string) => void) => () => void;
let mockCreateTerminalFn: (workspaceId: string) => Promise<string>;
let mockCloseTerminal: () => Promise<void>;
let mockResizeTerminal: (cols: number, rows: number) => void;

mock.module('../hooks/useTerminal', () => ({
  useTerminal: () => ({
    sendData: mockSendData,
    onOutput: mockOnOutput,
    createTerminal: mockCreateTerminalFn,
    closeTerminal: mockCloseTerminal,
    resizeTerminal: mockResizeTerminal,
  }),
}));

// ---------------------------------------------------------------------------
// Mock sendRequest
// ---------------------------------------------------------------------------

let mockSendRequest: (channel: string, payload: unknown) => Promise<unknown>;

mock.module('../lib/send-request', () => ({
  sendRequest: (...args: [string, unknown]) => mockSendRequest(...args),
}));

// ---------------------------------------------------------------------------
// Mock Terminal component
// ---------------------------------------------------------------------------

mock.module('./Terminal', () => ({
  Terminal: ({ terminalId }: { terminalId: string; onReady?: (t: unknown) => void; onResize?: (c: number, r: number) => void }) =>
    React.createElement('div', { 'data-testid': `terminal-instance-${terminalId}` }, `Terminal: ${terminalId}`),
}));

const { BottomPanel } = await import('./BottomPanel');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBottomPanel(workspaceId: string | null = 'ws-1') {
  return render(
    React.createElement(BottomPanel, { workspaceId })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BottomPanel', () => {
  beforeEach(() => {
    mockTabs = [];
    mockActiveTabId = null;
    mockCreateTab = mock((opts: { type: 'terminal' | 'editor'; title: string; terminalId?: string }) => {
      const id = `tab-${mockTabs.length + 1}`;
      const tab: Tab = { id, ...opts };
      mockTabs = [...mockTabs, tab];
      mockActiveTabId = id;
      return id;
    });
    mockCloseTab = mock((tabId: string) => {
      const idx = mockTabs.findIndex(t => t.id === tabId);
      const next = mockTabs.filter(t => t.id !== tabId);
      if (mockActiveTabId === tabId) {
        mockActiveTabId = next[Math.max(0, idx - 1)]?.id || next[0]?.id || null;
      }
      mockTabs = next;
    });
    mockActivateTab = mock((tabId: string) => {
      mockActiveTabId = tabId;
    });

    mockSendData = mock(() => {});
    mockOnOutput = mock(() => () => {});
    mockCreateTerminalFn = mock(() => Promise.resolve('term-1'));
    mockCloseTerminal = mock(() => Promise.resolve());
    mockResizeTerminal = mock(() => {});
    mockSendRequest = mock(() => Promise.resolve(undefined));
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. BottomPanel renders with its own tab bar for terminal tabs
  // -----------------------------------------------------------------------
  test('renders with its own tab bar for terminal tabs', () => {
    const { getByTestId } = renderBottomPanel();

    // Panel container exists
    expect(getByTestId('bottom-panel')).toBeTruthy();

    // Add terminal button exists
    expect(getByTestId('add-bottom-terminal')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. 'Add terminal' button creates a new terminal tab
  // -----------------------------------------------------------------------
  test("'Add terminal' button creates a new terminal tab", async () => {
    const { getByTestId } = renderBottomPanel();

    const addBtn = getByTestId('add-bottom-terminal');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockCreateTerminalFn).toHaveBeenCalledTimes(1);
      expect(mockCreateTerminalFn).toHaveBeenCalledWith('ws-1');
      expect(mockCreateTab).toHaveBeenCalledTimes(1);
      expect(mockCreateTab).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' })
      );
    });
  });

  // -----------------------------------------------------------------------
  // 3. Closing a tab sends PTY close request and switches to previous
  // -----------------------------------------------------------------------
  test('closing a tab sends PTY close request and switches to previous', () => {
    // Simulate two tabs
    mockTabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 't2' },
    ];
    mockActiveTabId = 'tab-2';

    const { container } = renderBottomPanel();

    // Find the close button for tab-2 (inside the tab element)
    const tab2 = getByTestId(container, 'bottom-tab-tab-2');
    const closeBtn = tab2.querySelector('button');
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);

    expect(mockCloseTab).toHaveBeenCalledWith('tab-2');
    expect(mockSendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 't2' });
  });

  // -----------------------------------------------------------------------
  // 4. Terminal content renders in the active bottom tab
  // -----------------------------------------------------------------------
  test('terminal content renders in the active bottom tab', () => {
    mockTabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' },
    ];
    mockActiveTabId = 'tab-1';

    const { getByTestId } = renderBottomPanel();

    // Terminal component should be rendered with the active tab's terminalId
    expect(getByTestId('terminal-instance-t1')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 5. Rapid duplicate clicks are prevented by the creating guard
  // -----------------------------------------------------------------------
  test('rapid duplicate clicks are prevented by the creating guard', async () => {
    let resolveCreate: (id: string) => void;
    mockCreateTerminalFn = mock(() => new Promise<string>((resolve) => { resolveCreate = resolve; }));

    const { getByTestId } = renderBottomPanel();

    const addBtn = getByTestId('add-bottom-terminal');
    // First click starts creation
    fireEvent.click(addBtn);
    // Second click while still creating should be ignored
    fireEvent.click(addBtn);

    // Only one call should have been made
    expect(mockCreateTerminalFn).toHaveBeenCalledTimes(1);

    // Resolve the pending creation
    resolveCreate!('term-guarded');

    await waitFor(() => {
      expect(mockCreateTab).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Failed terminal creation does not create a tab
  // -----------------------------------------------------------------------
  test('failed terminal creation does not create a tab', async () => {
    mockCreateTerminalFn = mock(() => Promise.reject(new Error('creation failed')));

    const { getByTestId } = renderBottomPanel();

    const addBtn = getByTestId('add-bottom-terminal');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockCreateTerminalFn).toHaveBeenCalledTimes(1);
    });

    // createTab should never have been called
    expect(mockCreateTab).not.toHaveBeenCalled();
  });
});

// Helper to query by test id from container (since we need it in some tests)
function getByTestId(container: HTMLElement | Document, testId: string): HTMLElement {
  const el = (container instanceof Document ? container : container.ownerDocument).querySelector(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`Could not find element with data-testid="${testId}"`);
  return el as HTMLElement;
}
