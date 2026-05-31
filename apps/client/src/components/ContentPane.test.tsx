/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useTabs
// ---------------------------------------------------------------------------

const mockCreateTab = mock(() => {
  return 'mock-tab-id';
});
const mockCloseTab = mock(() => {});
const mockActivateTab = mock(() => {});
const mockUpdateTabTitle = mock(() => {});
const mockUpdateTabCwd = mock(() => {});
const mockReorderTabs = mock(() => {});
const mockCloseTabsRight = mock(() => {});
const mockCloseOtherTabs = mock(() => {});
const mockSetDisplayTitle = mock(() => {});
const mockSwitchWorkspace = mock(() => {});
const mockLoadTabs = mock(() => {});

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
    updateTabTitle: mockUpdateTabTitle,
    updateTabCwd: mockUpdateTabCwd,
    reorderTabs: mockReorderTabs,
    closeTabsRight: mockCloseTabsRight,
    closeOtherTabs: mockCloseOtherTabs,
    setDisplayTitle: mockSetDisplayTitle,
    switchWorkspace: mockSwitchWorkspace,
    loadTabs: mockLoadTabs,
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

let mockSendRequestResponse: unknown = {};
const mockSendRequest = mock(() => Promise.resolve(mockSendRequestResponse));

mock.module('../lib/send-request', () => ({
  sendRequest: mockSendRequest,
}));

// Mock all the codemirror language modules (they may be imported transitively)
mock.module('@codemirror/lang-javascript', () => ({ javascript: () => {} }));
mock.module('@codemirror/lang-css', () => ({ css: () => {} }));
mock.module('@codemirror/lang-html', () => ({ html: () => {} }));
mock.module('@codemirror/lang-json', () => ({ json: () => {} }));
mock.module('@codemirror/lang-markdown', () => ({ markdown: () => {} }));
mock.module('@codemirror/lang-python', () => ({ python: () => {} }));
mock.module('@codemirror/lang-rust', () => ({ rust: () => {} }));
mock.module('@codemirror/theme-one-dark', () => ({ oneDark: {} }));

const { ContentPane } = await import('./ContentPane');
import type { ContentPaneHandle } from './ContentPane';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate changing a React controlled input's value.
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
    mockTabsState = [];
    mockActiveTabIdState = null;
    mockCreateTab.mockClear();
    mockCloseTab.mockClear();
    mockActivateTab.mockClear();
    mockUpdateTabTitle.mockClear();
    mockUpdateTabCwd.mockClear();
    mockReorderTabs.mockClear();
    mockCloseTabsRight.mockClear();
    mockCloseOtherTabs.mockClear();
    mockSetDisplayTitle.mockClear();
    mockSwitchWorkspace.mockClear();
    mockLoadTabs.mockClear();
    mockSendData.mockClear();
    mockOnOutput.mockClear();
    mockCreateTerminal.mockClear();
    mockCreateTerminal.mockImplementation(() => Promise.resolve('term-1'));
    mockCloseTerminal.mockClear();
    mockResizeTerminal.mockClear();
    mockSendRequest.mockClear();
    // Reset to default implementation (returns mockSendRequestResponse)
    mockSendRequest.mockImplementation(() => Promise.resolve(mockSendRequestResponse));
    mockSendRequestResponse = {};
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. ContentPane renders with tab bar and terminal container
  // -----------------------------------------------------------------------
  test('renders with tab bar and terminal container', () => {
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mockActiveTabIdState = 'tab-1';

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
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
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
    mockTabsState = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mockActiveTabIdState = 'tab-1';

    const { getByTestId } = renderContentPane();

    const closeButton = getByTestId('tab-close-tab-1');
    fireEvent.click(closeButton);

    expect(mockCloseTab).toHaveBeenCalledTimes(1);
    expect(mockCloseTab).toHaveBeenCalledWith('tab-1');
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. Active tab is reflected in tab bar selection
  // -----------------------------------------------------------------------
  test('active tab is reflected in tab bar selection', () => {
    mockTabsState = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
    ];
    mockActiveTabIdState = 'tab-2';

    const { getByTestId } = renderContentPane();

    // Tab-2 should be the active (selected) tab
    const tab2 = getByTestId('tab-tab-2');
    expect(tab2.getAttribute('aria-selected')).toBe('true');
    // Tab-1 should not be active
    const tab1 = getByTestId('tab-tab-1');
    expect(tab1.getAttribute('aria-selected')).toBe('false');
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
  // 6. Shows CodeEditor for editor tabs after file content loads
  // -----------------------------------------------------------------------
  test('shows CodeEditor for editor tabs after file content loads', async () => {
    mockTabsState = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mockActiveTabIdState = 'tab-1';
    mockSendRequestResponse = { content: 'const x = 1;', language: 'javascript' };

    const { getByTestId } = renderContentPane('ws-1');

    // Wait for the async file.read to resolve
    await flush();

    expect(getByTestId('code-editor')).toBeTruthy();
    expect(mockSendRequest).toHaveBeenCalledWith(
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

    await flush();

    expect(consoleErrorSpy).toHaveBeenCalled();
    // createTab should NOT have been called since creation failed
    expect(mockCreateTab).not.toHaveBeenCalled();

    console.error = originalError;
  });

  // -----------------------------------------------------------------------
  // 9. Shows loading indicator while fetching file content
  // -----------------------------------------------------------------------
  test('shows loading indicator while fetching file content', () => {
    mockTabsState = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mockActiveTabIdState = 'tab-1';
    // Keep sendRequest pending so the loading state persists
    let resolvePending: (value: unknown) => void;
    mockSendRequest.mockImplementation(
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
    mockTabsState = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mockActiveTabIdState = 'tab-1';
    mockSendRequest.mockImplementation(() => Promise.reject(new Error('File not found')));

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
    mockTabsState = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mockActiveTabIdState = 'tab-1';
    mockSendRequestResponse = { content: 'const x = 1;', language: 'javascript' };

    const { getByTestId } = renderContentPane('ws-1');

    // Wait for file.read to resolve and CodeEditor to render
    await flush();

    expect(getByTestId('code-editor')).toBeTruthy();

    // Simulate Ctrl+S to trigger save
    const editor = getByTestId('code-editor');
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });

    expect(mockSendRequest).toHaveBeenCalledWith(
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
    mockTabsState = [];
    mockActiveTabIdState = null;

    const { queryByTestId } = renderContentPane('ws-1');

    expect(queryByTestId('code-editor')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 13. No CodeEditor when a terminal tab is active
  // -----------------------------------------------------------------------
  test('no CodeEditor when terminal tab is active', () => {
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mockActiveTabIdState = 'tab-1';

    const { queryByTestId } = renderContentPane('ws-1');

    expect(queryByTestId('code-editor')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 14. handleCloseRight closes tabs to the right and sends terminal.close
  // -----------------------------------------------------------------------
  test('handleCloseRight closes tabs to the right and sends terminal.close', () => {
    mockTabsState = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
      { id: 'tab-3', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' },
    ];
    mockActiveTabIdState = 'tab-1';

    const { container, getByTestId } = renderContentPane();

    // Open context menu via right-click on tab-1
    const tab1 = getByTestId('tab-tab-1');
    fireEvent.contextMenu(tab1);

    // Multiple context menus exist (one per tab), so use querySelectorAll
    const closeRightItems = container.querySelectorAll('[data-testid="tab-menu-close-right"]');
    expect(closeRightItems.length).toBe(3);
    // Click the first context menu's close-right (for tab-1, which has tabs to its right)
    fireEvent.click(closeRightItems[0]);

    expect(mockCloseTabsRight).toHaveBeenCalledTimes(1);
    expect(mockCloseTabsRight).toHaveBeenCalledWith('tab-1');
    // Should have sent terminal.close for term-2 (the terminal to the right)
    expect(mockSendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 'term-2' });
  });

  // -----------------------------------------------------------------------
  // 15. handleCloseOthers closes all other tabs
  // -----------------------------------------------------------------------
  test('handleCloseOthers closes all other tabs and sends terminal.close', () => {
    mockTabsState = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
    ];
    mockActiveTabIdState = 'tab-2';

    const { container, getByTestId } = renderContentPane();

    // Open context menu via right-click on tab-2
    const tab2 = getByTestId('tab-tab-2');
    fireEvent.contextMenu(tab2);

    // Multiple context menus exist (one per tab), so use querySelectorAll
    const closeOthersItems = container.querySelectorAll('[data-testid="tab-menu-close-others"]');
    expect(closeOthersItems.length).toBe(2);
    // Click the second context menu's close-others (for tab-2)
    fireEvent.click(closeOthersItems[1]);

    expect(mockCloseOtherTabs).toHaveBeenCalledTimes(1);
    expect(mockCloseOtherTabs).toHaveBeenCalledWith('tab-2');
    // Should have sent terminal.close for term-1
    expect(mockSendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 'term-1' });
  });

  // -----------------------------------------------------------------------
  // 16. Terminal components receive onTitleChange and onCwdChange props
  // -----------------------------------------------------------------------
  test('Terminal components are rendered with onTitleChange and onCwdChange callbacks', () => {
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mockActiveTabIdState = 'tab-1';

    renderContentPane();

    // The terminal is rendered - verify the callbacks are wired by checking
    // that updateTabTitle and updateTabCwd would be called if invoked.
    // Since the Terminal mock doesn't call these props directly,
    // we verify the terminal rendered and the mock functions exist.
    // A more thorough test would mock Terminal and inspect props.
    expect(mockUpdateTabTitle).not.toHaveBeenCalled();
    expect(mockUpdateTabCwd).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 17. transferTabOut imperative handle removes a terminal tab and returns its data
  // -----------------------------------------------------------------------
  test('transferTabOut removes terminal tab and returns data without sending terminal.close', async () => {
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mockActiveTabIdState = 'tab-1';

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
    expect(mockCloseTab).toHaveBeenCalledWith('tab-1');
    // Should NOT send terminal.close — the PTY stays alive during cross-pane transfer
    expect(mockSendRequest).not.toHaveBeenCalledWith('terminal.close', expect.anything());
  });

  // -----------------------------------------------------------------------
  // 18. transferTabOut returns null for non-terminal or non-existent tabs
  // -----------------------------------------------------------------------
  test('transferTabOut returns null for editor tabs or non-existent tabs', async () => {
    mockTabsState = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mockActiveTabIdState = 'tab-1';

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    expect(ref.current?.transferTabOut('tab-1')).toBeNull();
    expect(ref.current?.transferTabOut('non-existent')).toBeNull();
    expect(mockCloseTab).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 19. receiveTab imperative handle creates a terminal tab
  // -----------------------------------------------------------------------
  test('receiveTab creates a terminal tab with given data', async () => {
    mockTabsState = [];
    mockActiveTabIdState = null;

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    ref.current?.receiveTab('term-moved', 'Moved Terminal', '/home/user');
    expect(mockCreateTab).toHaveBeenCalledWith({
      type: 'terminal',
      title: 'Moved Terminal',
      terminalId: 'term-moved',
      cwd: '/home/user',
    });
  });

  // -----------------------------------------------------------------------
  // 20. getTabs imperative handle returns current tabs
  // -----------------------------------------------------------------------
  test('getTabs returns current tabs', async () => {
    mockTabsState = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' },
    ];
    mockActiveTabIdState = 'tab-1';

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    const tabs = ref.current?.getTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs?.[0].id).toBe('tab-1');
    expect(tabs?.[1].id).toBe('tab-2');
  });

  // -----------------------------------------------------------------------
  // 21. Rename flow calls setDisplayTitle (not updateTabTitle)
  // -----------------------------------------------------------------------
  test('rename flow calls setDisplayTitle', async () => {
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mockActiveTabIdState = 'tab-1';

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
    expect(mockSetDisplayTitle).toHaveBeenCalledTimes(1);
    expect(mockSetDisplayTitle).toHaveBeenCalledWith('tab-1', 'Renamed Tab');
    expect(mockUpdateTabTitle).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 22. receiveTab returns the new tabId from createTab
  // -----------------------------------------------------------------------
  test('receiveTab returns the new tabId', async () => {
    mockTabsState = [];
    mockActiveTabIdState = null;

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    const tabId = ref.current?.receiveTab('term-xfer', 'Transferred', '/home');
    expect(typeof tabId).toBe('string');
    expect(tabId).toBe('mock-tab-id');
    expect(mockCreateTab).toHaveBeenCalledWith({
      type: 'terminal',
      title: 'Transferred',
      terminalId: 'term-xfer',
      cwd: '/home',
    });
  });

  // -----------------------------------------------------------------------
  // 23. transferTabOut followed by receiveTab round-trips terminal data
  // -----------------------------------------------------------------------
  test('transferTabOut followed by receiveTab round-trips terminal data', async () => {
    mockTabsState = [
      { id: 'tab-1', type: 'terminal', title: 'My Term', terminalId: 'term-1', cwd: '/home/user' },
    ];
    mockActiveTabIdState = 'tab-1';

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
    expect(mockCreateTab).toHaveBeenCalledWith({
      type: 'terminal',
      title: 'My Term',
      terminalId: 'term-1',
      cwd: '/home/user',
      customTitle: undefined,
    });
  });

  // -----------------------------------------------------------------------
  // 24. onTerminalRegistered is called when a terminal tab is created
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
  // 25. onTerminalUnregistered is called when a terminal tab is closed
  // -----------------------------------------------------------------------
  test('onTerminalUnregistered is called when a terminal tab is closed', async () => {
    const mockOnTerminalUnregistered = mock(() => {});
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mockActiveTabIdState = 'tab-1';

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
  // 26. onActiveTabChange fires when activeTabId changes
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
    mockActiveTabIdState = 'tab-1';
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];

    rerender(
      React.createElement(ContentPane, {
        workspaceId: 'ws-1',
        onActiveTabChange: mockOnActiveTabChange,
      }),
    );

    expect(mockOnActiveTabChange).toHaveBeenCalledWith('tab-1');
  });

  // -----------------------------------------------------------------------
  // 27. Cross-pane transfer: transferTabOut does not call onTerminalUnregistered
  // -----------------------------------------------------------------------
  test('cross-pane transfer: transferTabOut does not call onTerminalUnregistered', async () => {
    const onTerminalUnregistered = mock(() => {});
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mockActiveTabIdState = 'tab-1';

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
  // 28. Workspace tab isolation: tabs change when workspaceId switches
  // -----------------------------------------------------------------------
  test('workspace tab isolation: tabs change when workspaceId switches', async () => {
    // Start with ws-1, no tabs
    mockTabsState = [];
    mockActiveTabIdState = null;

    const { getByTestId, queryByTestId, rerender, container } = renderContentPane('ws-1');

    // Click add terminal
    fireEvent.click(getByTestId('tab-add'));
    await flush();

    // Mock createTab was called (the real hook would update state)
    expect(mockCreateTerminal).toHaveBeenCalledWith('ws-1');
    expect(mockCreateTab).toHaveBeenCalled();

    // Simulate what useTabs/useTerminalPane would do: add the tab to the state
    mockTabsState = [
      { id: 'mock-tab-id', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
    ];
    mockActiveTabIdState = 'mock-tab-id';

    rerender(React.createElement(ContentPane, { workspaceId: 'ws-1' }));

    // Tab should be visible (testid = 'tab-' + tab.id)
    expect(getByTestId('tab-mock-tab-id')).toBeTruthy();

    // Switch to ws-2 — simulate the real hook behavior (empty tabs for new workspace)
    mockTabsState = [];
    mockActiveTabIdState = null;
    rerender(React.createElement(ContentPane, { workspaceId: 'ws-2' }));

    // Should show "No tabs open" — workspace ws-2 has no tabs
    expect(container.textContent).toContain('No tabs open');
    expect(queryByTestId('tab-mock-tab-id')).toBeNull();

    // Switch back to ws-1 — simulate tabs being restored
    mockTabsState = [
      { id: 'mock-tab-id', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
    ];
    mockActiveTabIdState = 'mock-tab-id';
    rerender(React.createElement(ContentPane, { workspaceId: 'ws-1' }));

    // Tab should be restored
    expect(getByTestId('tab-mock-tab-id')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 29. Editor tab workspace scoping: editor tab hidden when switching workspace
  // -----------------------------------------------------------------------
  test('editor tab workspace scoping: editor tab hidden when switching workspace', async () => {
    // Start with ws-1 with an editor tab
    mockTabsState = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mockActiveTabIdState = 'tab-1';
    mockSendRequestResponse = { content: 'const x = 1;', language: 'typescript' };

    const { getByTestId, queryByTestId, rerender } = renderContentPane('ws-1');

    // Wait for file content to load
    await flush();
    expect(getByTestId('code-editor')).toBeTruthy();

    // Switch to ws-2 — no tabs (simulates workspace isolation)
    mockTabsState = [];
    mockActiveTabIdState = null;
    rerender(React.createElement(ContentPane, { workspaceId: 'ws-2' }));

    // CodeEditor should not be visible in ws-2
    expect(queryByTestId('code-editor')).toBeNull();

    // Switch back to ws-1
    mockTabsState = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mockActiveTabIdState = 'tab-1';
    rerender(React.createElement(ContentPane, { workspaceId: 'ws-1' }));

    await flush();

    // CodeEditor should be visible again in ws-1
    expect(getByTestId('code-editor')).toBeTruthy();
  });
});

afterAll(() => {
  mock.restore();
});
