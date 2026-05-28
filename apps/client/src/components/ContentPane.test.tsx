/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useTabs
// ---------------------------------------------------------------------------

const mockCreateTab = mock((_opts: { type: 'terminal' | 'editor'; title: string; terminalId?: string; filePath?: string }) => {
  return 'mock-tab-id';
});
const mockCloseTab = mock(() => {});
const mockActivateTab = mock(() => {});

let mockTabsState: Array<{
  id: string;
  type: 'terminal' | 'editor';
  title: string;
  terminalId?: string;
  filePath?: string;
}> = [];
let mockActiveTabIdState: string | null = null;

mock.module('../hooks/useTabs', () => ({
  useTabs: () => ({
    tabs: mockTabsState,
    activeTabId: mockActiveTabIdState,
    createTab: mockCreateTab,
    closeTab: mockCloseTab,
    activateTab: mockActivateTab,
  }),
  Tab: null, // type export, not used at runtime
}));

// ---------------------------------------------------------------------------
// Mock useTerminal
// ---------------------------------------------------------------------------

const mockSendData = mock(() => {});
const mockOnOutput = mock(() => () => {});
const mockCreateTerminal = mock(() => Promise.resolve('term-1'));
const mockCloseTerminal = mock(() => Promise.resolve());
const mockResizeTerminal = mock(() => {});

mock.module('../hooks/useTerminal', () => ({
  useTerminal: () => ({
    sendData: mockSendData,
    onOutput: mockOnOutput,
    createTerminal: mockCreateTerminal,
    closeTerminal: mockCloseTerminal,
    resizeTerminal: mockResizeTerminal,
  }),
}));

// ---------------------------------------------------------------------------
// Mock sendRequest
// ---------------------------------------------------------------------------

const mockSendRequest = mock(() => Promise.resolve({}));

mock.module('../lib/send-request', () => ({
  sendRequest: mockSendRequest,
}));

// ---------------------------------------------------------------------------
// Mock Terminal component
// ---------------------------------------------------------------------------

mock.module('./Terminal', () => ({
  Terminal: ({ terminalId }: { terminalId: string }) =>
    React.createElement('div', { 'data-testid': `terminal-${terminalId}` }, `Terminal: ${terminalId}`),
}));

const { ContentPane } = await import('./ContentPane');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderContentPane(workspaceId: string | null = null) {
  return render(
    React.createElement(ContentPane, { workspaceId })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContentPane', () => {
  beforeEach(() => {
    mockTabsState = [];
    mockActiveTabIdState = null;
    mockCreateTab.mockClear();
    mockCloseTab.mockClear();
    mockActivateTab.mockClear();
    mockSendData.mockClear();
    mockOnOutput.mockClear();
    mockCreateTerminal.mockClear();
    mockCloseTerminal.mockClear();
    mockResizeTerminal.mockClear();
    mockSendRequest.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. ContentPane renders with tab bar and terminal content
  // -----------------------------------------------------------------------
  test('renders with tab bar and terminal content', () => {
    mockTabsState = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
    ];
    mockActiveTabIdState = 'tab-1';

    const { getByTestId } = renderContentPane();

    expect(getByTestId('content-pane')).toBeTruthy();
    expect(getByTestId('tab-bar')).toBeTruthy();
    expect(getByTestId('terminal-term-1')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Add terminal tab button works
  // -----------------------------------------------------------------------
  test('add terminal tab button works', async () => {
    const { getByTestId } = renderContentPane('ws-1');

    const addButton = getByTestId('tab-add');
    fireEvent.click(addButton);

    // Wait for the async createTerminal + createTab to complete
    await new Promise((r) => setTimeout(r, 0));

    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);
    expect(mockCreateTerminal).toHaveBeenCalledWith('ws-1');
    expect(mockCreateTab).toHaveBeenCalledTimes(1);
    expect(mockCreateTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'terminal', terminalId: 'term-1' }),
    );
  });

  // -----------------------------------------------------------------------
  // 3. Closing tab works and sends close request for terminal tabs
  // -----------------------------------------------------------------------
  test('closing terminal tab calls sendRequest to close server PTY', () => {
    mockTabsState = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
    ];
    mockActiveTabIdState = 'tab-1';

    const { getByTestId } = renderContentPane();

    const closeButton = getByTestId('tab-close-tab-1');
    fireEvent.click(closeButton);

    expect(mockCloseTab).toHaveBeenCalledTimes(1);
    expect(mockCloseTab).toHaveBeenCalledWith('tab-1');
    expect(mockSendRequest).toHaveBeenCalledTimes(1);
    expect(mockSendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 'term-1' });
  });

  // -----------------------------------------------------------------------
  // 3b. Closing a non-terminal tab does not call sendRequest
  // -----------------------------------------------------------------------
  test('closing editor tab does not call sendRequest', () => {
    mockTabsState = [
      { id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' },
    ];
    mockActiveTabIdState = 'tab-1';

    const { getByTestId } = renderContentPane();

    const closeButton = getByTestId('tab-close-tab-1');
    fireEvent.click(closeButton);

    expect(mockCloseTab).toHaveBeenCalledTimes(1);
    expect(mockCloseTab).toHaveBeenCalledWith('tab-1');
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. Active tab shows its content
  // -----------------------------------------------------------------------
  test('active tab shows its content', () => {
    mockTabsState = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
    ];
    mockActiveTabIdState = 'tab-2';

    const { getByTestId, queryByTestId } = renderContentPane();

    // Active tab's terminal should be shown
    expect(getByTestId('terminal-term-2')).toBeTruthy();
    // Inactive tab's terminal should NOT be shown
    expect(queryByTestId('terminal-term-1')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 5. Shows "No tabs open" when no active tab
  // -----------------------------------------------------------------------
  test('shows no tabs message when no active tab', () => {
    const { container } = renderContentPane();

    const content = container.textContent;
    expect(content).toContain('No tabs open');
  });

  // -----------------------------------------------------------------------
  // 6. Shows editor placeholder for editor tabs
  // -----------------------------------------------------------------------
  test('shows editor placeholder for editor tabs', () => {
    mockTabsState = [
      { id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' },
    ];
    mockActiveTabIdState = 'tab-1';

    const { getByTestId } = renderContentPane();

    expect(getByTestId('editor-placeholder')).toBeTruthy();
    expect(getByTestId('editor-placeholder').textContent).toContain('/src/foo.ts');
  });

  // -----------------------------------------------------------------------
  // 7. Terminal creation is guarded against rapid duplicates
  // -----------------------------------------------------------------------
  test('rapid duplicate add-terminal clicks are guarded', async () => {
    let resolveCreate: (value: string) => void;
    const pendingCreate = new Promise<string>((resolve) => {
      resolveCreate = resolve;
    });
    mockCreateTerminal.mockImplementation(() => pendingCreate);

    const { getByTestId } = renderContentPane('ws-1');

    const addButton = getByTestId('tab-add');
    // Click twice rapidly
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    // Only one createTerminal call should have gone through
    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);

    // Resolve the pending create
    resolveCreate!('term-new');
    await new Promise((r) => setTimeout(r, 0));
  });

  // -----------------------------------------------------------------------
  // 8. handleAddTerminal catches errors gracefully
  // -----------------------------------------------------------------------
  test('handleAddTerminal catches errors without throwing', async () => {
    const consoleErrorSpy = mock(() => {});
    const originalError = console.error;
    console.error = consoleErrorSpy;

    mockCreateTerminal.mockImplementation(() => Promise.reject(new Error('creation failed')));

    const { getByTestId } = renderContentPane('ws-1');

    const addButton = getByTestId('tab-add');
    fireEvent.click(addButton);

    await new Promise((r) => setTimeout(r, 0));

    expect(consoleErrorSpy).toHaveBeenCalled();
    // createTab should NOT have been called since creation failed
    expect(mockCreateTab).not.toHaveBeenCalled();

    console.error = originalError;
  });
});
