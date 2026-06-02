/**
 * Shared mock setup for "pane" test files (ContentPane, BottomPanel).
 *
 * The three modules mocked here — `useTabs`, `useTerminal`, `sendRequest`,
 * and `TabContextMenu` — are identically stubbed in both pane test suites.
 * This module centralises the `mock.module()` registrations and provides
 * a single `resetPaneMocks()` that replaces the per-test `beforeEach` reset
 * logic.
 *
 * Usage (at module scope, **before** any `await import()` of the component):
 *
 * ```ts
 * import { setupPaneMocks, resetPaneMocks } from '../test-helpers/mock-pane-helpers';
 * const mocks = setupPaneMocks();
 *
 * // In a test:
 * resetPaneMocks(mocks);
 * mocks.tabs = [{ id: 't1', type: 'terminal', title: 'T1', terminalId: 'x' }];
 * ```
 *
 * **Important** — `setupPaneMocks()` calls `mock.module()` which must happen
 * at module scope (top-level) so that Bun registers the stubs before the
 * dynamic import of the component under test.
 */

import { mock } from 'bun:test';
import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MockTab = {
  id: string;
  type: 'terminal' | 'editor';
  title: string;
  workspaceId?: string;
  terminalId?: string;
  filePath?: string;
};

export interface PaneMockHandle {
  /** Mutable tab state — tests can push/replace to simulate hook updates. */
  tabs: MockTab[];
  activeTabId: string | null;

  /** useTabs mock functions (each is a `bun:test` mock). */
  createTab: ReturnType<typeof mock<(opts: Record<string, unknown>) => string>>;
  closeTab: ReturnType<typeof mock<(id: string) => void>>;
  activateTab: ReturnType<typeof mock<(id: string) => void>>;
  updateTabTitle: ReturnType<typeof mock<(tabId: string, title: string) => void>>;
  updateTabCwd: ReturnType<typeof mock<(tabId: string, cwd: string) => void>>;
  reorderTabs: ReturnType<typeof mock<(fromIndex: number, toIndex: number) => void>>;
  closeTabsRight: ReturnType<typeof mock<(tabId: string) => void>>;
  closeOtherTabs: ReturnType<typeof mock<(tabId: string) => void>>;
  setDisplayTitle: ReturnType<typeof mock<(tabId: string, customTitle: string) => void>>;
  switchWorkspace: ReturnType<typeof mock<(workspaceId: string | null) => void>>;
  loadTabs: ReturnType<typeof mock<(workspaceId: string, tabs: unknown[]) => void>>;

  /** useTerminal mock functions. */
  sendData: ReturnType<typeof mock<(data: string) => void>>;
  onOutput: ReturnType<typeof mock<(handler: (data: string) => void) => () => void>>;
  createTerminal: ReturnType<typeof mock<(workspaceId: string) => Promise<string>>>;
  closeTerminal: ReturnType<typeof mock<() => Promise<void>>>;
  resizeTerminal: ReturnType<typeof mock<(cols: number, rows: number) => void>>;

  /** sendRequest mock. */
  sendRequest: ReturnType<typeof mock<(channel: string, payload: unknown) => Promise<unknown>>>;
  /** Default response returned by sendRequest. Reset per-test as needed. */
  sendRequestResponse: unknown;
}

// ---------------------------------------------------------------------------
// setupPaneMocks — register mock.module() stubs and return handle
// ---------------------------------------------------------------------------

/**
 * Register `mock.module()` for `useTabs`, `useTerminal`, `sendRequest`,
 * and `TabContextMenu`.
 *
 * Returns a mutable handle whose properties the test can read/write.
 * The mock module factories close over the handle so writes are reflected
 * in the component under test.
 */
export function setupPaneMocks(): PaneMockHandle {
  const handle: PaneMockHandle = {
    tabs: [],
    activeTabId: null,

    // useTabs stubs — created with mock() so callers can use mockClear(),
    // mockImplementation(), etc.
    createTab: mock(() => 'mock-tab-id'),
    closeTab: mock(() => {}),
    activateTab: mock(() => {}),
    updateTabTitle: mock(() => {}),
    updateTabCwd: mock(() => {}),
    reorderTabs: mock(() => {}),
    closeTabsRight: mock(() => {}),
    closeOtherTabs: mock(() => {}),
    setDisplayTitle: mock(() => {}),
    switchWorkspace: mock(() => {}),
    loadTabs: mock(() => {}),

    // useTerminal stubs
    sendData: mock(() => {}),
    onOutput: mock(() => () => {}),
    createTerminal: mock(() => Promise.resolve('term-1')),
    closeTerminal: mock(() => Promise.resolve()),
    resizeTerminal: mock(() => {}),

    // sendRequest
    sendRequest: mock(() => Promise.resolve({ tabs: [] })),
    sendRequestResponse: { tabs: [] },
  };

  // --- useTabs ---------------------------------------------------------------
  mock.module('../hooks/useTabs', () => ({
    useTabs: () => ({
      tabs: handle.tabs,
      activeTabId: handle.activeTabId,
      createTab: handle.createTab,
      closeTab: handle.closeTab,
      activateTab: handle.activateTab,
      updateTabTitle: handle.updateTabTitle,
      updateTabCwd: handle.updateTabCwd,
      reorderTabs: handle.reorderTabs,
      closeTabsRight: handle.closeTabsRight,
      closeOtherTabs: handle.closeOtherTabs,
      setDisplayTitle: handle.setDisplayTitle,
      switchWorkspace: handle.switchWorkspace,
      loadTabs: handle.loadTabs,
    }),
    // Type-only export, not used at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Tab: {} as any,
  }));

  // --- useTerminal -----------------------------------------------------------
  mock.module('../hooks/useTerminal', () => ({
    useTerminal: () => ({
      sendData: handle.sendData,
      onOutput: handle.onOutput,
      createTerminal: handle.createTerminal,
      closeTerminal: handle.closeTerminal,
      resizeTerminal: handle.resizeTerminal,
    }),
  }));

  // --- sendRequest -----------------------------------------------------------
  mock.module('../lib/send-request', () => ({
    sendRequest: (..._args: [string, unknown]) => handle.sendRequest(..._args),
  }));

  // --- TabContextMenu --------------------------------------------------------
  mock.module('./TabContextMenu', () => ({
    TabContextMenu: ({
      canCloseRight,
      canCloseOthers,
      onClose,
      onCloseRight,
      onCloseOthers,
      onRename,
      children,
    }: {
      canCloseRight: boolean;
      canCloseOthers: boolean;
      onClose: () => void;
      onCloseRight: () => void;
      onCloseOthers: () => void;
      onRename: () => void;
      children: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        null,
        children,
        React.createElement(
          'div',
          { 'data-testid': 'tab-menu-close', onClick: () => onClose() },
          'Close',
        ),
        React.createElement(
          'div',
          {
            'data-testid': 'tab-menu-close-others',
            onClick: canCloseOthers ? () => onCloseOthers() : undefined,
            'aria-disabled': !canCloseOthers || undefined,
          },
          'Close Others',
        ),
        React.createElement(
          'div',
          {
            'data-testid': 'tab-menu-close-right',
            onClick: canCloseRight ? () => onCloseRight() : undefined,
            'aria-disabled': !canCloseRight || undefined,
          },
          'Close to the Right',
        ),
        React.createElement(
          'div',
          { 'data-testid': 'tab-menu-rename', onClick: () => onRename() },
          'Rename',
        ),
      ),
  }));

  return handle;
}

// ---------------------------------------------------------------------------
// resetPaneMocks — clear all mock state for a fresh test
// ---------------------------------------------------------------------------

/**
 * Clear all mock call counts, reset implementations to defaults, and reset
 * tab/sendRequest state. Call in `beforeEach`.
 */
export function resetPaneMocks(handle: PaneMockHandle): void {
  // State
  handle.tabs = [];
  handle.activeTabId = null;
  handle.sendRequestResponse = { tabs: [] };

  // useTabs mocks
  handle.createTab.mockClear();
  handle.createTab.mockImplementation(() => 'mock-tab-id');
  handle.closeTab.mockClear();
  handle.activateTab.mockClear();
  handle.updateTabTitle.mockClear();
  handle.updateTabCwd.mockClear();
  handle.reorderTabs.mockClear();
  handle.closeTabsRight.mockClear();
  handle.closeOtherTabs.mockClear();
  handle.setDisplayTitle.mockClear();
  handle.switchWorkspace.mockClear();
  handle.loadTabs.mockClear();

  // useTerminal mocks
  handle.sendData.mockClear();
  handle.onOutput.mockClear();
  handle.createTerminal.mockClear();
  handle.createTerminal.mockImplementation(() => Promise.resolve('term-1'));
  handle.closeTerminal.mockClear();
  handle.resizeTerminal.mockClear();

  // sendRequest
  handle.sendRequest.mockClear();
  handle.sendRequest.mockImplementation(() => Promise.resolve(handle.sendRequestResponse));
}
