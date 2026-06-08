/**
 * Factory functions that create mock state objects for tests.
 *
 * Each factory returns a sensible default that can be partially overridden
 * via an optional `overrides` argument.
 *
 * Usage:
 * ```ts
 * import { createMockTabsState } from '../test-helpers/mock-factories';
 *
 * const tabs = createMockTabsState({ tabs: [fakeTab], activeTabId: 'tab-1' });
 * ```
 */

import { generateId } from '@ymir/shared';
import type { Tab } from '../hooks/useTabs';
import type { ConnectionStatus } from '../lib/ws-client';

// ---------------------------------------------------------------------------
// Tabs state
// ---------------------------------------------------------------------------

export interface MockTabsState {
  tabs: Tab[];
  activeTabId: string | null;
  createTab: (opts: {
    type: 'terminal' | 'editor';
    title: string;
    terminalId?: string;
    filePath?: string;
    cwd?: string;
    customTitle?: string;
  }) => string;
  closeTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  updateTabCwd: (tabId: string, cwd: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  closeTabsRight: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  setDisplayTitle: (tabId: string, customTitle: string | undefined) => void;
}

export function createMockTabsState(overrides?: Partial<MockTabsState>): MockTabsState {
  return {
    tabs: [],
    activeTabId: null,
    createTab: (_opts) => generateId(),
    closeTab: (_tabId) => {},
    activateTab: (_tabId) => {},
    updateTabTitle: (_tabId, _title) => {},
    updateTabCwd: (_tabId, _cwd) => {},
    reorderTabs: (_from, _to) => {},
    closeTabsRight: (_tabId) => {},
    closeOtherTabs: (_tabId) => {},
    setDisplayTitle: (_tabId, _customTitle) => {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Terminal state
// ---------------------------------------------------------------------------

export interface MockTerminalState {
  sendData: (data: string) => void;
  onOutput: (handler: (data: string) => void) => () => void;
  createTerminal: (workspaceId: string) => Promise<string>;
  closeTerminal: () => Promise<void>;
  resizeTerminal: (cols: number, rows: number) => void;
}

export function createMockTerminalState(overrides?: Partial<MockTerminalState>): MockTerminalState {
  return {
    sendData: (_data: string) => {},
    onOutput: (_handler: (data: string) => void) => () => {},
    createTerminal: async (_workspaceId: string) => generateId(),
    closeTerminal: async () => {},
    resizeTerminal: (_cols: number, _rows: number) => {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Theme state
// ---------------------------------------------------------------------------

export interface MockThemeState {
  accentColor: string;
  setAccentColor: (color: string) => void;
  themeVars: Record<string, string>;
}

export function createMockThemeState(overrides?: Partial<MockThemeState>): MockThemeState {
  const accentColor = overrides?.accentColor ?? '#007acc';
  return {
    accentColor,
    setAccentColor: (_color: string) => {},
    themeVars: {
      '--accent': accentColor,
      '--accent-hover': accentColor + 'cc',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

export interface MockConnectionStatusState {
  status: ConnectionStatus;
  isConnected: boolean;
  isReconnecting: boolean;
}

export function createMockConnectionStatus(
  overrides?: Partial<MockConnectionStatusState>,
): MockConnectionStatusState {
  const status = overrides?.status ?? 'disconnected';
  return {
    status,
    isConnected: status === 'connected',
    isReconnecting: status === 'reconnecting',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Workspaces state
// ---------------------------------------------------------------------------

/**
 * Represents the shape returned by useWorkspaces (a TanStack Query result).
 */
export interface MockWorkspacesState {
  data: unknown[] | undefined;
  isLoading: boolean;
  error: Error | null;
  isError: boolean;
  isSuccess: boolean;
  isPending: boolean;
}

export function createMockWorkspacesState(
  overrides?: Partial<MockWorkspacesState>,
): MockWorkspacesState {
  return {
    data: undefined,
    isLoading: true,
    error: null,
    isError: false,
    isSuccess: false,
    isPending: true,
    ...overrides,
  };
}
