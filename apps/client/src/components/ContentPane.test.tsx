/// <reference lib="dom" />
import { setupTestDom, setupAllMocks, setReactInputValue } from '../test-helpers/mock-setup';
import { setupPaneMocks, resetPaneMocks } from '../test-helpers/mock-pane-helpers';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

const mocks = setupPaneMocks();

const { ContentPane } = await import('./ContentPane');
import type { TerminalPanelHandle as ContentPaneHandle } from '../hooks/useTerminalPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderContentPane(
  workspaceId: string | null = null,
  ref?: React.Ref<ContentPaneHandle>,
  extraProps?: Record<string, unknown>,
) {
  return render(React.createElement(ContentPane, { workspaceId, ref, ...extraProps }));
}

// Helper to wait for microtasks (promises) to flush
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContentPane', () => {
  beforeEach(() => {
    resetPaneMocks(mocks);
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. ContentPane renders with tab bar and terminal container
  // -----------------------------------------------------------------------
  test('renders with tab bar and terminal container', () => {
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mocks.activeTabId = 'tab-1';

    const { getByTestId } = renderContentPane();

    expect(getByTestId('content-pane')).toBeTruthy();
    expect(getByTestId('tab-bar')).toBeTruthy();
    // Terminals are now portaled into this container by TerminalManager
    expect(getByTestId('terminal-container')).toBeTruthy();
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

    expect(mocks.createTerminal).toHaveBeenCalledTimes(1);
    expect(mocks.createTerminal).toHaveBeenCalledWith('ws-1', undefined);
    expect(mocks.createTab).toHaveBeenCalledTimes(1);
    expect(mocks.createTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'terminal', terminalId: 'term-1' }),
    );
  });

  // -----------------------------------------------------------------------
  // 3. Closing tab works and sends close request for terminal tabs
  // -----------------------------------------------------------------------
  test('closing terminal tab calls sendRequest to close server PTY', () => {
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mocks.activeTabId = 'tab-1';

    const { getByTestId } = renderContentPane();

    const closeButton = getByTestId('tab-close-tab-1');
    fireEvent.click(closeButton);

    expect(mocks.closeTab).toHaveBeenCalledTimes(1);
    expect(mocks.closeTab).toHaveBeenCalledWith('tab-1');
    expect(mocks.sendRequest).toHaveBeenCalledTimes(1);
    expect(mocks.sendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 'term-1' });
  });

  // -----------------------------------------------------------------------
  // 3b. Closing a non-terminal tab does not call sendRequest
  // -----------------------------------------------------------------------
  test('closing editor tab does not call sendRequest', () => {
    mocks.tabs = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mocks.activeTabId = 'tab-1';

    const { getByTestId } = renderContentPane();

    const closeButton = getByTestId('tab-close-tab-1');
    fireEvent.click(closeButton);

    expect(mocks.closeTab).toHaveBeenCalledTimes(1);
    expect(mocks.closeTab).toHaveBeenCalledWith('tab-1');
    expect(mocks.sendRequest).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. Active tab is reflected in tab bar selection
  // -----------------------------------------------------------------------
  test('active tab is reflected in tab bar selection', () => {
    mocks.tabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
    ];
    mocks.activeTabId = 'tab-2';

    const { getByTestId } = renderContentPane();

    // Tab-2 should be the active (selected) tab
    const tab2 = getByTestId('tab-tab-2');
    expect(tab2.getAttribute('aria-selected')).toBe('true');
    // Tab-1 should not be active
    const tab1 = getByTestId('tab-tab-1');
    expect(tab1.getAttribute('aria-selected')).toBe('false');
  });

  // -----------------------------------------------------------------------
  // 5. Shows YmirLogo when no active tab
  // -----------------------------------------------------------------------
  test('shows YmirLogo when no active tab', () => {
    const { container } = renderContentPane();

    expect(container.querySelector('[data-testid="ymir-logo"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 6. Shows CodeEditor for editor tabs after file content loads
  // -----------------------------------------------------------------------
  test('shows CodeEditor for editor tabs after file content loads', async () => {
    mocks.tabs = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mocks.activeTabId = 'tab-1';
    mocks.sendRequestResponse = { content: 'const x = 1;', language: 'javascript' };

    const { getByTestId } = renderContentPane('ws-1');

    // Wait for the async file.read to resolve
    await flush();

    expect(getByTestId('code-editor')).toBeTruthy();
    expect(mocks.sendRequest).toHaveBeenCalledWith(
      'file.read',
      expect.objectContaining({ workspaceId: 'ws-1', path: '/src/foo.ts' }),
    );
  });

  // -----------------------------------------------------------------------
  // 7. Terminal creation is guarded against rapid duplicates
  // -----------------------------------------------------------------------
  test('rapid duplicate add-terminal clicks are guarded', async () => {
    let resolveCreate: (value: string) => void;
    const pendingCreate = new Promise<string>((resolve) => {
      resolveCreate = resolve;
    });
    mocks.createTerminal.mockImplementation(() => pendingCreate);

    const { getByTestId } = renderContentPane('ws-1');

    const addButton = getByTestId('tab-add');
    // Click twice rapidly
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    // Only one createTerminal call should have gone through
    expect(mocks.createTerminal).toHaveBeenCalledTimes(1);

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

    mocks.createTerminal.mockImplementation(() => Promise.reject(new Error('creation failed')));

    const { getByTestId } = renderContentPane('ws-1');

    const addButton = getByTestId('tab-add');
    fireEvent.click(addButton);

    await flush();

    expect(consoleErrorSpy).toHaveBeenCalled();
    // createTab should NOT have been called since creation failed
    expect(mocks.createTab).not.toHaveBeenCalled();

    console.error = originalError;
  });

  // -----------------------------------------------------------------------
  // 9. Shows loading indicator while fetching file content
  // -----------------------------------------------------------------------
  test('shows loading indicator while fetching file content', () => {
    mocks.tabs = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mocks.activeTabId = 'tab-1';
    // Keep sendRequest pending so the loading state persists
    let resolvePending: (value: unknown) => void;
    mocks.sendRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePending = resolve;
        }),
    );

    const { container, queryByTestId } = renderContentPane('ws-1');

    // Should show loading indicator
    expect(container.textContent).toContain('Loading...');
    // CodeEditor should NOT be rendered yet
    expect(queryByTestId('code-editor')).toBeNull();

    // Resolve the pending promise so the test doesn't hang
    resolvePending!({ content: '', language: '' });
  });

  // -----------------------------------------------------------------------
  // 10. Shows error message when file read fails
  // -----------------------------------------------------------------------
  test('shows error message when file read fails', async () => {
    mocks.tabs = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mocks.activeTabId = 'tab-1';
    mocks.sendRequest.mockImplementation(() => Promise.reject(new Error('File not found')));

    const { container, queryByTestId } = renderContentPane('ws-1');

    await flush();

    expect(container.textContent).toContain('File not found');
    // CodeEditor should NOT be rendered
    expect(queryByTestId('code-editor')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 11. Save triggers sendRequest with file.write
  // -----------------------------------------------------------------------
  test('save triggers sendRequest with file.write and correct payload', async () => {
    mocks.tabs = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mocks.activeTabId = 'tab-1';
    mocks.sendRequestResponse = { content: 'const x = 1;', language: 'javascript' };

    const { getByTestId } = renderContentPane('ws-1');

    // Wait for file.read to resolve and CodeEditor to render
    await flush();

    expect(getByTestId('code-editor')).toBeTruthy();

    // Simulate Ctrl+S to trigger save
    const editor = getByTestId('code-editor');
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });

    expect(mocks.sendRequest).toHaveBeenCalledWith(
      'file.write',
      expect.objectContaining({
        workspaceId: 'ws-1',
        path: '/src/foo.ts',
        content: 'const x = 1;',
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 12. No CodeEditor when no editor tab is active
  // -----------------------------------------------------------------------
  test('no CodeEditor when no editor tab is active', () => {
    mocks.tabs = [];
    mocks.activeTabId = null;

    const { queryByTestId } = renderContentPane('ws-1');

    expect(queryByTestId('code-editor')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 13. No CodeEditor when a terminal tab is active
  // -----------------------------------------------------------------------
  test('no CodeEditor when terminal tab is active', () => {
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mocks.activeTabId = 'tab-1';

    const { queryByTestId } = renderContentPane('ws-1');

    expect(queryByTestId('code-editor')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 14. handleCloseRight closes tabs to the right and sends terminal.close
  // -----------------------------------------------------------------------
  test('handleCloseRight closes tabs to the right and sends terminal.close', () => {
    mocks.tabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
      { id: 'tab-3', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' },
    ];
    mocks.activeTabId = 'tab-1';

    const { container, getByTestId } = renderContentPane();

    // Open context menu via right-click on tab-1
    const tab1 = getByTestId('tab-tab-1');
    fireEvent.contextMenu(tab1);

    // Multiple context menus exist (one per tab), so use querySelectorAll
    const closeRightItems = container.querySelectorAll('[data-testid="tab-menu-close-right"]');
    expect(closeRightItems.length).toBe(3);
    // Click the first context menu's close-right (for tab-1, which has tabs to its right)
    fireEvent.click(closeRightItems[0]);

    expect(mocks.closeTabsRight).toHaveBeenCalledTimes(1);
    expect(mocks.closeTabsRight).toHaveBeenCalledWith('tab-1');
    // Should have sent terminal.close for term-2 (the terminal to the right)
    expect(mocks.sendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 'term-2' });
  });

  // -----------------------------------------------------------------------
  // 15. handleCloseOthers closes all other tabs
  // -----------------------------------------------------------------------
  test('handleCloseOthers closes all other tabs and sends terminal.close', () => {
    mocks.tabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
    ];
    mocks.activeTabId = 'tab-2';

    const { container, getByTestId } = renderContentPane();

    // Open context menu via right-click on tab-2
    const tab2 = getByTestId('tab-tab-2');
    fireEvent.contextMenu(tab2);

    // Multiple context menus exist (one per tab), so use querySelectorAll
    const closeOthersItems = container.querySelectorAll('[data-testid="tab-menu-close-others"]');
    expect(closeOthersItems.length).toBe(2);
    // Click the second context menu's close-others (for tab-2)
    fireEvent.click(closeOthersItems[1]);

    expect(mocks.closeOtherTabs).toHaveBeenCalledTimes(1);
    expect(mocks.closeOtherTabs).toHaveBeenCalledWith('tab-2');
    // Should have sent terminal.close for term-1
    expect(mocks.sendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 'term-1' });
  });

  // -----------------------------------------------------------------------
  // 16. transferTabOut imperative handle removes a terminal tab and returns its data
  // -----------------------------------------------------------------------
  test('transferTabOut removes terminal tab and returns data without sending terminal.close', async () => {
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mocks.activeTabId = 'tab-1';

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    const result = ref.current?.transferTabOut('tab-1');
    expect(result).toEqual({
      terminalId: 'term-1',
      title: 'Terminal 1',
      cwd: undefined,
      customTitle: undefined,
    });
    expect(mocks.closeTab).toHaveBeenCalledWith('tab-1');
    // Should NOT send terminal.close — the PTY stays alive during cross-pane transfer
    expect(mocks.sendRequest).not.toHaveBeenCalledWith('terminal.close', expect.anything());
  });

  // -----------------------------------------------------------------------
  // 17. transferTabOut returns null for non-terminal or non-existent tabs
  // -----------------------------------------------------------------------
  test('transferTabOut returns null for editor tabs or non-existent tabs', async () => {
    mocks.tabs = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mocks.activeTabId = 'tab-1';

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    expect(ref.current?.transferTabOut('tab-1')).toBeNull();
    expect(ref.current?.transferTabOut('non-existent')).toBeNull();
    expect(mocks.closeTab).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 18. receiveTab imperative handle creates a terminal tab
  // -----------------------------------------------------------------------
  test('receiveTab creates a terminal tab with given data', async () => {
    mocks.tabs = [];
    mocks.activeTabId = null;

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    ref.current?.receiveTab('term-moved', 'Moved Terminal', '/home/user');
    expect(mocks.createTab).toHaveBeenCalledWith({
      type: 'terminal',
      title: 'Moved Terminal',
      terminalId: 'term-moved',
      cwd: '/home/user',
    });
  });

  // -----------------------------------------------------------------------
  // 19. getTabs imperative handle returns current tabs
  // -----------------------------------------------------------------------
  test('getTabs returns current tabs', async () => {
    mocks.tabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' },
    ];
    mocks.activeTabId = 'tab-1';

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    const tabs = ref.current?.getTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs?.[0].id).toBe('tab-1');
    expect(tabs?.[1].id).toBe('tab-2');
  });

  // -----------------------------------------------------------------------
  // 20. Rename flow calls setDisplayTitle (not updateTabTitle)
  // -----------------------------------------------------------------------
  test('rename flow calls setDisplayTitle', async () => {
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mocks.activeTabId = 'tab-1';

    const { container } = renderContentPane('ws-1');

    await flush();

    // Find the rename context menu item for tab-1's context menu and click it
    const renameItems = container.querySelectorAll('[data-testid="tab-menu-rename"]');
    expect(renameItems.length).toBeGreaterThan(0);
    fireEvent.click(renameItems[0]);

    // An input should appear for inline rename
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Change the value
    setReactInputValue(input, 'Renamed Tab');

    // Press Enter to commit
    fireEvent.keyDown(input, { key: 'Enter' });

    // setDisplayTitle should be called (not updateTabTitle)
    expect(mocks.setDisplayTitle).toHaveBeenCalledTimes(1);
    expect(mocks.setDisplayTitle).toHaveBeenCalledWith('tab-1', 'Renamed Tab');
    expect(mocks.updateTabTitle).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 21. receiveTab returns the new tabId from createTab
  // -----------------------------------------------------------------------
  test('receiveTab returns the new tabId', async () => {
    mocks.tabs = [];
    mocks.activeTabId = null;

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    const tabId = ref.current?.receiveTab('term-xfer', 'Transferred', '/home');
    expect(typeof tabId).toBe('string');
    expect(tabId).toBe('mock-tab-id');
    expect(mocks.createTab).toHaveBeenCalledWith({
      type: 'terminal',
      title: 'Transferred',
      terminalId: 'term-xfer',
      cwd: '/home',
    });
  });

  // -----------------------------------------------------------------------
  // 22. transferTabOut followed by receiveTab round-trips terminal data
  // -----------------------------------------------------------------------
  test('transferTabOut followed by receiveTab round-trips terminal data', async () => {
    mocks.tabs = [
      {
        id: 'tab-1',
        type: 'terminal',
        title: 'My Term',
        terminalId: 'term-1',
        workspaceId: 'ws-1',
        cwd: '/home/user',
      },
    ];
    mocks.activeTabId = 'tab-1';

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    // Transfer out
    const data = ref.current?.transferTabOut('tab-1');
    expect(data).toEqual({
      terminalId: 'term-1',
      title: 'My Term',
      cwd: '/home/user',
      customTitle: undefined,
    });

    // Receive in (simulating cross-pane transfer)
    const newTabId = ref.current?.receiveTab(
      data!.terminalId,
      data!.title,
      data!.cwd,
      data!.customTitle,
    );
    expect(typeof newTabId).toBe('string');
    expect(mocks.createTab).toHaveBeenCalledWith({
      type: 'terminal',
      title: 'My Term',
      terminalId: 'term-1',
      cwd: '/home/user',
      customTitle: undefined,
    });
  });

  // -----------------------------------------------------------------------
  // 23. onTerminalRegistered is called when a terminal tab is created
  // -----------------------------------------------------------------------
  test('onTerminalRegistered is called when a terminal tab is created', async () => {
    const mockOnTerminalRegistered = mock(() => {});

    const { getByTestId } = renderContentPane('ws-1', undefined, {
      onTerminalRegistered: mockOnTerminalRegistered,
    });

    const addButton = getByTestId('tab-add');
    fireEvent.click(addButton);

    await flush();

    expect(mockOnTerminalRegistered).toHaveBeenCalledTimes(1);
    expect(mockOnTerminalRegistered).toHaveBeenCalledWith('term-1', 'mock-tab-id', 'ws-1');
  });

  // -----------------------------------------------------------------------
  // 24. onTerminalUnregistered is called when a terminal tab is closed
  // -----------------------------------------------------------------------
  test('onTerminalUnregistered is called when a terminal tab is closed', async () => {
    const mockOnTerminalUnregistered = mock(() => {});
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mocks.activeTabId = 'tab-1';

    const { getByTestId } = renderContentPane('ws-1', undefined, {
      onTerminalUnregistered: mockOnTerminalUnregistered,
    });

    await flush();

    const closeButton = getByTestId('tab-close-tab-1');
    fireEvent.click(closeButton);

    expect(mockOnTerminalUnregistered).toHaveBeenCalledTimes(1);
    expect(mockOnTerminalUnregistered).toHaveBeenCalledWith('term-1');
  });

  // -----------------------------------------------------------------------
  // 25. onActiveTabChange fires when activeTabId changes
  // -----------------------------------------------------------------------
  test('onActiveTabChange fires when activeTabId changes', async () => {
    const mockOnActiveTabChange = mock(() => {});

    const { rerender } = renderContentPane('ws-1', undefined, {
      onActiveTabChange: mockOnActiveTabChange,
    });

    await flush();

    // Initial render: activeTabId is null
    expect(mockOnActiveTabChange).toHaveBeenCalledWith(null);

    // Change mock state and rerender
    mocks.activeTabId = 'tab-1';
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];

    rerender(
      React.createElement(ContentPane, {
        workspaceId: 'ws-1',
        onActiveTabChange: mockOnActiveTabChange,
      }),
    );

    expect(mockOnActiveTabChange).toHaveBeenCalledWith('tab-1');
  });

  // -----------------------------------------------------------------------
  // 26. Cross-pane transfer: transferTabOut does not call onTerminalUnregistered
  // -----------------------------------------------------------------------
  test('cross-pane transfer: transferTabOut does not call onTerminalUnregistered', async () => {
    const onTerminalUnregistered = mock(() => {});
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mocks.activeTabId = 'tab-1';

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref, { onTerminalUnregistered });

    await flush();

    // Transfer the tab out (simulates cross-pane drag)
    const result = ref.current?.transferTabOut('tab-1');
    expect(result).toBeTruthy();
    expect(result!.terminalId).toBe('term-1');

    // onTerminalUnregistered should NOT be called during transfer
    // (the terminal stays in the overlay; only the tab ownership changes)
    expect(onTerminalUnregistered).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 27. Workspace tab isolation: tabs change when workspaceId switches
  // -----------------------------------------------------------------------
  test('workspace tab isolation: tabs change when workspaceId switches', async () => {
    // Start with ws-1, no tabs
    mocks.tabs = [];
    mocks.activeTabId = null;

    const { getByTestId, queryByTestId, rerender, container } = renderContentPane('ws-1');

    // Click add terminal
    fireEvent.click(getByTestId('tab-add'));
    await flush();

    // Mock createTab was called (the real hook would update state)
    expect(mocks.createTerminal).toHaveBeenCalledWith('ws-1', undefined);
    expect(mocks.createTab).toHaveBeenCalled();

    // Simulate what useTabs/useTerminalPane would do: add the tab to the state
    mocks.tabs = [
      { id: 'mock-tab-id', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
    ];
    mocks.activeTabId = 'mock-tab-id';

    rerender(React.createElement(ContentPane, { workspaceId: 'ws-1' }));

    // Tab should be visible (testid = 'tab-' + tab.id)
    expect(getByTestId('tab-mock-tab-id')).toBeTruthy();

    // Switch to ws-2 — simulate the real hook behavior (empty tabs for new workspace)
    mocks.tabs = [];
    mocks.activeTabId = null;
    rerender(React.createElement(ContentPane, { workspaceId: 'ws-2' }));

    // Should show YmirLogo — workspace ws-2 has no tabs
    expect(container.querySelector('[data-testid="ymir-logo"]')).toBeTruthy();
    expect(queryByTestId('tab-mock-tab-id')).toBeNull();

    // Switch back to ws-1 — simulate tabs being restored
    mocks.tabs = [
      { id: 'mock-tab-id', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
    ];
    mocks.activeTabId = 'mock-tab-id';
    rerender(React.createElement(ContentPane, { workspaceId: 'ws-1' }));

    // Tab should be restored
    expect(getByTestId('tab-mock-tab-id')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 28. Editor tab workspace scoping: editor tab hidden when switching workspace
  // -----------------------------------------------------------------------
  test('editor tab workspace scoping: editor tab hidden when switching workspace', async () => {
    // Start with ws-1 with an editor tab
    mocks.tabs = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mocks.activeTabId = 'tab-1';
    mocks.sendRequestResponse = { content: 'const x = 1;', language: 'typescript' };

    const { getByTestId, queryByTestId, rerender } = renderContentPane('ws-1');

    // Wait for file content to load
    await flush();
    expect(getByTestId('code-editor')).toBeTruthy();

    // Switch to ws-2 — no tabs (simulates workspace isolation)
    mocks.tabs = [];
    mocks.activeTabId = null;
    rerender(React.createElement(ContentPane, { workspaceId: 'ws-2' }));

    // CodeEditor should not be visible in ws-2
    expect(queryByTestId('code-editor')).toBeNull();

    // Switch back to ws-1
    mocks.tabs = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mocks.activeTabId = 'tab-1';
    rerender(React.createElement(ContentPane, { workspaceId: 'ws-1' }));

    await flush();

    // CodeEditor should be visible again in ws-1
    expect(getByTestId('code-editor')).toBeTruthy();
  });
});

afterAll(() => {
  mock.restore();
});
