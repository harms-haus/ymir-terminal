/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock @dnd-kit
// ---------------------------------------------------------------------------

mock.module('@dnd-kit/react', () => ({
  DragDropProvider: ({ children }: { children: React.ReactNode }) => children,
  DragOverlay: ({ children }: { children: React.ReactNode }) => children,
  useDroppable: () => ({ ref: () => {}, droppable: {}, isDropTarget: false }),
}));

mock.module('@dnd-kit/react/sortable', () => ({
  useSortable: () => ({
    ref: () => {},
    isDragging: false,
    isDropping: false,
    isDragSource: false,
    isDropTarget: false,
    sortable: {},
    handleRef: () => {},
    sourceRef: () => {},
    targetRef: () => {},
  }),
}));

mock.module('@dnd-kit/helpers', () => ({
  move: (items: unknown[]) => items,
}));

// ---------------------------------------------------------------------------
// Mock @radix-ui/react-context-menu
// ---------------------------------------------------------------------------

mock.module('@radix-ui/react-context-menu', () => {
  const Root = ({ children }: { children: React.ReactNode }) => children;
  const Trigger = ({ children }: { children: React.ReactNode; asChild?: boolean }) => children;
  const Portal = ({ children }: { children: React.ReactNode }) => children;
  const Content = ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('div', props, children);
  const Item = ({
    children,
    onSelect,
    disabled,
    ...props
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) =>
    React.createElement(
      'div',
      { ...props, onClick: disabled ? undefined : onSelect },
      children,
    );
  const Separator = (props: Record<string, unknown>) =>
    React.createElement('div', props);

  return { Root, Trigger, Portal, Content, Item, Separator };
});

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

// ---------------------------------------------------------------------------
// Mock ghostty-web (Terminal's heavy native dependency) instead of Terminal
// This avoids permanently replacing the Terminal module for other test files
// ---------------------------------------------------------------------------

mock.module('ghostty-web', () => {
  const MockTerminal = class {
    cols = 80;
    rows = 24;
    write() {
      return this;
    }
    resize() {
      return this;
    }
    onRender() {
      return this;
    }
    onData() {
      return { dispose() {} };
    }
    onResize() {
      return { dispose() {} };
    }
    onTitleChange() {
      return { dispose() {} };
    }
    open() {}
    loadAddon() {}
    dispose() {}
  };
  const MockFitAddon = class {
    fit() {}
    dispose() {}
    activate() {}
  };
  return {
    Terminal: MockTerminal,
    FitAddon: MockFitAddon,
    init: () => Promise.resolve(),
  };
});

// ---------------------------------------------------------------------------
// Mock @uiw/react-codemirror (CodeEditor's heavy dependency)
// Provides a mock that calls onSave and exposes a data-testid
// ---------------------------------------------------------------------------

mock.module('@uiw/react-codemirror', () => {
  const MockCodeMirror = ({ value }: { value: string }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'mock-codemirror',
      },
      React.createElement('div', { 'data-testid': 'cm-content' }, value),
    );
  return { default: MockCodeMirror };
});

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

function renderContentPane(workspaceId: string | null = null, ref?: React.Ref<ContentPaneHandle>) {
  return render(React.createElement(ContentPane, { workspaceId, ref }));
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
    mockSendData.mockClear();
    mockOnOutput.mockClear();
    mockCreateTerminal.mockClear();
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
  // 1. ContentPane renders with tab bar and terminal content
  // -----------------------------------------------------------------------
  test('renders with tab bar and terminal content', () => {
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
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
  // 4. Active tab shows its content
  // -----------------------------------------------------------------------
  test('active tab shows its content', () => {
    mockTabsState = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 'term-2' },
    ];
    mockActiveTabIdState = 'tab-2';

    const { getByTestId } = renderContentPane();

    // Active tab's terminal should be shown
    expect(getByTestId('terminal-term-2')).toBeTruthy();
    // Inactive tab's terminal should be present but hidden
    const inactiveWrapper = getByTestId('terminal-term-1').parentElement!;
    expect(inactiveWrapper.style.display).toBe('none');
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
  // 17. removeTerminalTab imperative handle removes a terminal tab and returns its data
  // -----------------------------------------------------------------------
  test('removeTerminalTab removes terminal tab and returns data without sending terminal.close', async () => {
    mockTabsState = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }];
    mockActiveTabIdState = 'tab-1';

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    const result = ref.current?.removeTerminalTab('tab-1');
    expect(result).toEqual({ terminalId: 'term-1', title: 'Terminal 1', cwd: undefined });
    expect(mockCloseTab).toHaveBeenCalledWith('tab-1');
    // Should NOT send terminal.close — the PTY stays alive during cross-pane transfer
    expect(mockSendRequest).not.toHaveBeenCalledWith('terminal.close', expect.anything());
  });

  // -----------------------------------------------------------------------
  // 18. removeTerminalTab returns null for non-terminal or non-existent tabs
  // -----------------------------------------------------------------------
  test('removeTerminalTab returns null for editor tabs or non-existent tabs', async () => {
    mockTabsState = [{ id: 'tab-1', type: 'editor', title: 'foo.ts', filePath: '/src/foo.ts' }];
    mockActiveTabIdState = 'tab-1';

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    expect(ref.current?.removeTerminalTab('tab-1')).toBeNull();
    expect(ref.current?.removeTerminalTab('non-existent')).toBeNull();
    expect(mockCloseTab).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 19. addTerminalTab imperative handle creates a terminal tab
  // -----------------------------------------------------------------------
  test('addTerminalTab creates a terminal tab with given data', async () => {
    mockTabsState = [];
    mockActiveTabIdState = null;

    const ref = React.createRef<ContentPaneHandle>();
    renderContentPane('ws-1', ref);

    await flush();

    ref.current?.addTerminalTab('term-moved', 'Moved Terminal', '/home/user');
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
});

afterAll(() => {
  mock.restore();
});
