/// <reference lib="dom" />
import { setupTestDom, setupAllMocks, setReactInputValue } from '../test-helpers/mock-setup';
import { setupPaneMocks, resetPaneMocks } from '../test-helpers/mock-pane-helpers';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const mocks = setupPaneMocks();

const { BottomPanel } = await import('./BottomPanel');
import type { TerminalPanelHandle as BottomPanelHandle } from '../hooks/useTerminalPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBottomPanel(
  workspaceId: string | null = 'ws-1',
  ref?: React.Ref<BottomPanelHandle>,
  extraProps?: Record<string, unknown>,
) {
  return render(React.createElement(BottomPanel, { workspaceId, ref, ...extraProps }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BottomPanel', () => {
  beforeEach(() => {
    resetPaneMocks(mocks);

    // Smart state-mutating implementations for tab management
    mocks.createTab.mockImplementation(
      (opts: { type: 'terminal' | 'editor'; title: string; terminalId?: string }) => {
        const id = `tab-${mocks.tabs.length + 1}`;
        const tab = { id, ...opts };
        mocks.tabs = [...mocks.tabs, tab];
        mocks.activeTabId = id;
        return id;
      },
    );
    mocks.closeTab.mockImplementation((tabId: string) => {
      const idx = mocks.tabs.findIndex((t) => t.id === tabId);
      const next = mocks.tabs.filter((t) => t.id !== tabId);
      if (mocks.activeTabId === tabId) {
        mocks.activeTabId = next[Math.max(0, idx - 1)]?.id || next[0]?.id || null;
      }
      mocks.tabs = next;
    });
    mocks.closeTabsRight.mockImplementation((tabId: string) => {
      const idx = mocks.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return;
      mocks.tabs = mocks.tabs.slice(0, idx + 1);
    });
    mocks.closeOtherTabs.mockImplementation((tabId: string) => {
      mocks.tabs = mocks.tabs.filter((t) => t.id === tabId);
      mocks.activeTabId = tabId;
    });
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

    // Tab bar and add button exist (from shared TabBar component)
    expect(getByTestId('tab-bar')).toBeTruthy();
    expect(getByTestId('tab-add')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. 'Add terminal' button creates a new terminal tab
  // -----------------------------------------------------------------------
  test("'Add terminal' button creates a new terminal tab", async () => {
    const { getByTestId } = renderBottomPanel();

    const addBtn = getByTestId('tab-add');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mocks.createTerminal).toHaveBeenCalledTimes(1);
      expect(mocks.createTerminal).toHaveBeenCalledWith('ws-1', undefined);
      expect(mocks.createTab).toHaveBeenCalledTimes(1);
      expect(mocks.createTab).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'terminal', title: 'Terminal 1', terminalId: 'term-1' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 3. Closing a tab sends PTY close request and switches to previous
  // -----------------------------------------------------------------------
  test('closing a tab sends PTY close request and switches to previous', () => {
    // Simulate two tabs
    mocks.tabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 't2' },
    ];
    mocks.activeTabId = 'tab-2';

    const { getByTestId } = renderBottomPanel();

    // Find the close button for tab-2 using TabBar's testid pattern
    const closeBtn = getByTestId('tab-close-tab-2');
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);

    expect(mocks.closeTab).toHaveBeenCalledWith('tab-2');
    expect(mocks.sendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 't2' });
  });

  // -----------------------------------------------------------------------
  // 4. Terminal container is present for active bottom tab
  // -----------------------------------------------------------------------
  test('terminal container is present for active bottom tab', () => {
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' }];
    mocks.activeTabId = 'tab-1';

    const { getByTestId } = renderBottomPanel();

    // Terminals are now portaled into this container by TerminalManager
    expect(getByTestId('terminal-container')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 5. Rapid duplicate clicks are prevented by the creating guard
  // -----------------------------------------------------------------------
  test('rapid duplicate clicks are prevented by the creating guard', async () => {
    let resolveCreate: (id: string) => void;
    mocks.createTerminal.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const { getByTestId } = renderBottomPanel();

    const addBtn = getByTestId('tab-add');
    // First click starts creation
    fireEvent.click(addBtn);
    // Second click while still creating should be ignored
    fireEvent.click(addBtn);

    // Only one call should have been made
    expect(mocks.createTerminal).toHaveBeenCalledTimes(1);

    // Resolve the pending creation
    resolveCreate!('term-guarded');

    await waitFor(() => {
      expect(mocks.createTab).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Failed terminal creation does not create a tab
  // -----------------------------------------------------------------------
  test('failed terminal creation does not create a tab', async () => {
    mocks.createTerminal.mockImplementation(() => Promise.reject(new Error('creation failed')));

    const { getByTestId } = renderBottomPanel();

    const addBtn = getByTestId('tab-add');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mocks.createTerminal).toHaveBeenCalledTimes(1);
    });

    // createTab should never have been called
    expect(mocks.createTab).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 7. Terminal container is present for multiple tabs
  // -----------------------------------------------------------------------
  test('terminal container is present for multiple tabs', () => {
    mocks.tabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 't2' },
    ];
    mocks.activeTabId = 'tab-1';

    const { getByTestId } = renderBottomPanel();

    // Terminals are now portaled into this container by TerminalManager
    expect(getByTestId('terminal-container')).toBeTruthy();
    // Both tabs should be visible in the tab bar
    expect(getByTestId('tab-tab-1')).toBeTruthy();
    expect(getByTestId('tab-tab-2')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 8. Closing tabs to the right sends PTY close for each
  // -----------------------------------------------------------------------
  test('closeTabsRight sends PTY close for each closed tab', async () => {
    mocks.tabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 't2' },
      { id: 'tab-3', type: 'terminal', title: 'Terminal 3', terminalId: 't3' },
    ];
    mocks.activeTabId = 'tab-1';

    const { container } = renderBottomPanel();

    // Each tab has a context menu with tab-menu-close-right.
    // Click the first one (tab-1's context menu "close right" item).
    const closeRightItems = container.querySelectorAll('[data-testid="tab-menu-close-right"]');
    expect(closeRightItems.length).toBe(3);
    // Click the first context menu's close-right (for tab-1, which has tabs to its right)
    fireEvent.click(closeRightItems[0]);

    // The confirm dialog is async, so we need to wait for the effects
    await waitFor(() => {
      expect(mocks.sendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 't2' });
      expect(mocks.sendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 't3' });
      expect(mocks.closeTabsRight).toHaveBeenCalledWith('tab-1');
    });
  });

  // -----------------------------------------------------------------------
  // 9. Closing other tabs sends PTY close for each
  // -----------------------------------------------------------------------
  test('closeOtherTabs sends PTY close for each closed tab', () => {
    mocks.tabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 't2' },
    ];
    mocks.activeTabId = 'tab-1';

    const { container } = renderBottomPanel();

    const closeOthersItems = container.querySelectorAll('[data-testid="tab-menu-close-others"]');
    expect(closeOthersItems.length).toBe(2);
    // Click the first context menu's close-others (for tab-1)
    fireEvent.click(closeOthersItems[0]);

    // Should send terminal.close for t2 (the other tab)
    expect(mocks.sendRequest).toHaveBeenCalledWith('terminal.close', { terminalId: 't2' });
    expect(mocks.closeOtherTabs).toHaveBeenCalledWith('tab-1');
  });

  // -----------------------------------------------------------------------
  // 10. Rename tab calls setDisplayTitle
  // -----------------------------------------------------------------------
  test('rename tab calls setDisplayTitle', () => {
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' }];
    mocks.activeTabId = 'tab-1';

    const { container } = renderBottomPanel();

    // Click the rename context menu item — this triggers inline rename in TabBar
    const renameItems = container.querySelectorAll('[data-testid="tab-menu-rename"]');
    expect(renameItems.length).toBe(1);
    fireEvent.click(renameItems[0]);

    // After clicking rename, an input should appear inside the tab element
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Use React internal props to set value (fireEvent.change doesn't work in happy-dom)
    setReactInputValue(input, 'My Terminal');

    // Press Enter to commit
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mocks.setDisplayTitle).toHaveBeenCalledWith('tab-1', 'My Terminal');
  });

  // -----------------------------------------------------------------------
  // 11. transferTabOut imperative handle removes a terminal tab and returns data
  // -----------------------------------------------------------------------
  test('transferTabOut removes terminal tab and returns data without sending terminal.close', async () => {
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' }];
    mocks.activeTabId = 'tab-1';

    const ref = React.createRef<BottomPanelHandle>();
    renderBottomPanel('ws-1', ref);

    await waitFor(() => {
      expect(ref.current).toBeTruthy();
    });

    const result = ref.current?.transferTabOut('tab-1');
    expect(result).toEqual({
      terminalId: 't1',
      title: 'Terminal 1',
      cwd: undefined,
      customTitle: undefined,
    });
    expect(mocks.closeTab).toHaveBeenCalledWith('tab-1');
    // Should NOT send terminal.close — the PTY stays alive during cross-pane transfer
    expect(mocks.sendRequest).not.toHaveBeenCalledWith('terminal.close', expect.anything());
  });

  // -----------------------------------------------------------------------
  // 12. transferTabOut returns null for non-existent tabs
  // -----------------------------------------------------------------------
  test('transferTabOut returns null for non-existent tabs', async () => {
    const ref = React.createRef<BottomPanelHandle>();
    renderBottomPanel('ws-1', ref);

    await waitFor(() => {
      expect(ref.current).toBeTruthy();
    });

    expect(ref.current?.transferTabOut('non-existent')).toBeNull();
    expect(mocks.closeTab).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 13. receiveTab imperative handle creates a terminal tab
  // -----------------------------------------------------------------------
  test('receiveTab creates a terminal tab with given data', async () => {
    const ref = React.createRef<BottomPanelHandle>();
    renderBottomPanel('ws-1', ref);

    await waitFor(() => {
      expect(ref.current).toBeTruthy();
    });

    ref.current?.receiveTab('term-moved', 'Moved Terminal', '/home/user');
    expect(mocks.createTab).toHaveBeenCalledWith({
      type: 'terminal',
      title: 'Moved Terminal',
      terminalId: 'term-moved',
      cwd: '/home/user',
    });
  });

  // -----------------------------------------------------------------------
  // 14. getTabs imperative handle returns current tabs
  // -----------------------------------------------------------------------
  test('getTabs returns current tabs', async () => {
    mocks.tabs = [
      { id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' },
      { id: 'tab-2', type: 'terminal', title: 'Terminal 2', terminalId: 't2' },
    ];
    mocks.activeTabId = 'tab-1';

    const ref = React.createRef<BottomPanelHandle>();
    renderBottomPanel('ws-1', ref);

    await waitFor(() => {
      expect(ref.current).toBeTruthy();
    });

    const tabs = ref.current?.getTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs?.[0].id).toBe('tab-1');
    expect(tabs?.[1].id).toBe('tab-2');
  });

  // -----------------------------------------------------------------------
  // 15. receiveTab returns the new tabId
  // -----------------------------------------------------------------------
  test('receiveTab returns the new tabId', async () => {
    const ref = React.createRef<BottomPanelHandle>();
    renderBottomPanel('ws-1', ref);

    await waitFor(() => {
      expect(ref.current).toBeTruthy();
    });

    const tabId = ref.current?.receiveTab('term-xfer', 'Transferred', '/home');
    expect(typeof tabId).toBe('string');
    expect(tabId).toBe('tab-1');
    expect(mocks.createTab).toHaveBeenCalledWith({
      type: 'terminal',
      title: 'Transferred',
      terminalId: 'term-xfer',
      cwd: '/home',
    });
  });

  // -----------------------------------------------------------------------
  // 16. transferTabOut followed by receiveTab round-trips terminal data
  // -----------------------------------------------------------------------
  test('transferTabOut followed by receiveTab round-trips terminal data', async () => {
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'My Term', terminalId: 't1' }];
    mocks.activeTabId = 'tab-1';

    const ref = React.createRef<BottomPanelHandle>();
    renderBottomPanel('ws-1', ref);

    await waitFor(() => {
      expect(ref.current).toBeTruthy();
    });

    // Transfer out
    const data = ref.current?.transferTabOut('tab-1');
    expect(data).toEqual({
      terminalId: 't1',
      title: 'My Term',
      cwd: undefined,
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
    expect(newTabId).toBeTruthy();
    expect(mocks.createTab).toHaveBeenCalledWith({
      type: 'terminal',
      title: 'My Term',
      terminalId: 't1',
      cwd: undefined,
      customTitle: undefined,
    });
  });

  // -----------------------------------------------------------------------
  // 17. onTerminalRegistered is called when a terminal tab is created
  // -----------------------------------------------------------------------
  test('onTerminalRegistered is called when a terminal tab is created', async () => {
    const mockOnTerminalRegistered = mock(() => {});

    const { getByTestId } = renderBottomPanel('ws-1', undefined, {
      onTerminalRegistered: mockOnTerminalRegistered,
    });

    const addButton = getByTestId('tab-add');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockOnTerminalRegistered).toHaveBeenCalledTimes(1);
    });

    expect(mockOnTerminalRegistered).toHaveBeenCalledWith('term-1', 'tab-1', 'ws-1');
  });

  // -----------------------------------------------------------------------
  // 18. onTerminalUnregistered is called when a terminal tab is closed
  // -----------------------------------------------------------------------
  test('onTerminalUnregistered is called when a terminal tab is closed', () => {
    const mockOnTerminalUnregistered = mock(() => {});
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' }];
    mocks.activeTabId = 'tab-1';

    const { getByTestId } = renderBottomPanel('ws-1', undefined, {
      onTerminalUnregistered: mockOnTerminalUnregistered,
    });

    const closeButton = getByTestId('tab-close-tab-1');
    fireEvent.click(closeButton);

    expect(mockOnTerminalUnregistered).toHaveBeenCalledTimes(1);
    expect(mockOnTerminalUnregistered).toHaveBeenCalledWith('t1');
  });

  // -----------------------------------------------------------------------
  // 19. onActiveTabChange fires when activeTabId changes
  // -----------------------------------------------------------------------
  test('onActiveTabChange fires when activeTabId changes', async () => {
    const mockOnActiveTabChange = mock(() => {});

    const { rerender } = renderBottomPanel('ws-1', undefined, {
      onActiveTabChange: mockOnActiveTabChange,
    });

    await waitFor(() => {
      expect(mockOnActiveTabChange).toHaveBeenCalled();
    });

    // Initial render: activeTabId is null
    expect(mockOnActiveTabChange).toHaveBeenCalledWith(null);

    // Change mock state and rerender
    mocks.activeTabId = 'tab-1';
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' }];

    rerender(
      React.createElement(BottomPanel, {
        workspaceId: 'ws-1',
        onActiveTabChange: mockOnActiveTabChange,
      }),
    );

    expect(mockOnActiveTabChange).toHaveBeenCalledWith('tab-1');
  });

  // -----------------------------------------------------------------------
  // 20. Cross-pane transfer: transferTabOut does not call onTerminalUnregistered
  // -----------------------------------------------------------------------
  test('cross-pane transfer: transferTabOut does not call onTerminalUnregistered', async () => {
    const onTerminalUnregistered = mock(() => {});
    mocks.tabs = [{ id: 'tab-1', type: 'terminal', title: 'Terminal 1', terminalId: 't1' }];
    mocks.activeTabId = 'tab-1';

    const ref = React.createRef<BottomPanelHandle>();
    renderBottomPanel('ws-1', ref, { onTerminalUnregistered });

    await waitFor(() => {
      expect(ref.current).toBeTruthy();
    });

    // Transfer the tab out (simulates cross-pane drag)
    const result = ref.current?.transferTabOut('tab-1');
    expect(result).toBeTruthy();
    expect(result!.terminalId).toBe('t1');

    // onTerminalUnregistered should NOT be called during transfer
    // (the terminal stays in the overlay; only the tab ownership changes)
    expect(onTerminalUnregistered).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cleanup: restore all mocked modules so other test files see the originals
// ---------------------------------------------------------------------------
afterAll(() => {
  mock.restore();
});
