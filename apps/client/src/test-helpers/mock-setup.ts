/**
 * Shared test utilities for client-side tests.
 *
 * Provides:
 * - `setupTestDom()` — registers happy-dom's GlobalRegistrator (idempotent).
 * - `createMockAuthState()` — factory matching useAuth's return shape.
 * - `createMockTabsState()` — factory matching useTabs's return shape.
 * - `createMockTerminalState()` — factory matching useTerminal's return shape.
 * - `createMockThemeState()` — factory matching useTheme's return shape.
 * - `createMockConnectionStatus()` — factory matching useConnectionStatus's return shape.
 * - `createMockWorkspacesState()` — factory matching useWorkspaces's return shape.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { ConnectionStatus } from '../lib/ws-client';
import type { Tab } from '../hooks/useTabs';

// ---------------------------------------------------------------------------
// DOM setup
// ---------------------------------------------------------------------------

let domRegistered = false;

/**
 * Register the happy-dom global DOM environment.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function setupTestDom(): Promise<void> {
  if (domRegistered) return;
  try {
    await GlobalRegistrator.register();
    domRegistered = true;
  } catch {
    // Already registered by another test file
    domRegistered = true;
  }
}

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------

export interface MockAuthState {
  isAuthenticated: boolean;
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

export function createMockAuthState(overrides?: Partial<MockAuthState>): MockAuthState {
  return {
    isAuthenticated: false,
    token: null,
    login: async (_password: string) => {},
    logout: () => {},
    ...overrides,
  };
}

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
  }) => string;
  closeTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
}

export function createMockTabsState(overrides?: Partial<MockTabsState>): MockTabsState {
  return {
    tabs: [],
    activeTabId: null,
    createTab: (_opts) => crypto.randomUUID(),
    closeTab: (_tabId) => {},
    activateTab: (_tabId) => {},
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
    createTerminal: async (_workspaceId: string) => crypto.randomUUID(),
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
