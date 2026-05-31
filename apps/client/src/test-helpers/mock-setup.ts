/**
 * Shared test utilities for client-side tests.
 *
 * Provides:
 * - `setupTestDom()` — registers happy-dom's GlobalRegistrator (idempotent).
 * - State factory functions — create mock context/hook return values.
 * - `setupAllMocks()` — registers common `Bun.mock.module()` mocks for
 *   heavy external dependencies.
 * - `renderWithProviders()` — wraps `@testing-library/react`'s `render`
 *   with `QueryClientProvider` and `AuthContext.Provider`.
 *
 * Usage in a test file:
 * ```ts
 * import { setupTestDom, setupAllMocks, renderWithProviders } from '../test-helpers/mock-setup';
 *
 * setupTestDom();
 * setupAllMocks();
 *
 * const { getByTestId } = renderWithProviders(<MyComponent />);
 * ```
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ConnectionStatus } from '../lib/ws-client';
import type { Tab } from '../hooks/useTabs';
import { AuthContext } from '../hooks/useAuth';

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
    createTab: (_opts) => crypto.randomUUID(),
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

// ---------------------------------------------------------------------------
// setupAllMocks — register common module mocks
// ---------------------------------------------------------------------------

/**
 * Register `Bun.mock.module()` mocks for common heavy external dependencies.
 *
 * **Must be called at module scope** (before any dynamic `await import()`
 * of the components under test).
 *
 * Mocked modules:
 * - `@radix-ui/react-context-menu` — functional components rendering children
 * - `@dnd-kit/react` — `DndContext` as div-with-children
 * - `@dnd-kit/react/sortable` — pass-through
 * - `@dnd-kit/helpers` — empty object
 * - `ghostty-web` — no-op Terminal / FitAddon stubs
 * - `@uiw/react-codemirror` — `CodeMirror` as div
 * - `react-intersection-observer` — `useInView` returning `{ ref: () => {}, inView: true }`
 * - `react-resizable-panels` — `Group`, `Panel`, `Separator` as divs
 */
export function setupAllMocks(): void {
  // --- @radix-ui/react-context-menu -----------------------------------------
  // NOTE: `mock` is imported from 'bun:test' via require() at runtime to avoid
  // pulling in bun:test when this module is analysed by the type checker.
  // Cast through unknown to satisfy both tsc and eslint.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mock: bunMock } = require('bun:test') as unknown as {
    mock: { module: (id: string, factory: () => unknown) => void };
  };
  bunMock.module('@radix-ui/react-context-menu', () => {
    const CtxRoot = ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'ctx-root' }, children);

    const CtxTrigger = ({ children }: { children: React.ReactNode; asChild?: boolean }) =>
      React.createElement('div', { 'data-testid': 'ctx-trigger' }, children);

    const CtxPortal = ({ children }: { children: React.ReactNode }) => children;

    const CtxContent = ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement('div', props, children);

    const CtxItem = ({
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
        {
          ...props,
          onClick: disabled ? undefined : onSelect,
          'aria-disabled': disabled || undefined,
        },
        children,
      );

    const CtxSeparator = (props: { [key: string]: unknown }) =>
      React.createElement('div', { ...props, role: 'separator' });

    return {
      Root: CtxRoot,
      Trigger: CtxTrigger,
      Portal: CtxPortal,
      Content: CtxContent,
      Item: CtxItem,
      Separator: CtxSeparator,
    };
  });

  // --- @dnd-kit/react -------------------------------------------------------
  bunMock.module('@dnd-kit/react', () => ({
    DragDropProvider: ({ children }: { children: React.ReactNode }) => children,
    DragOverlay: ({ children }: { children: React.ReactNode }) => children,
    useDroppable: () => ({ ref: () => {}, droppable: {}, isDropTarget: false }),
  }));

  // --- @dnd-kit/react/sortable ----------------------------------------------
  bunMock.module('@dnd-kit/react/sortable', () => ({
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

  // --- @dnd-kit/helpers -----------------------------------------------------
  bunMock.module('@dnd-kit/helpers', () => ({
    move: (items: unknown[]) => items,
  }));

  // --- ghostty-web ----------------------------------------------------------
  bunMock.module('ghostty-web', () => {
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
      onTitleChange() {
        return { dispose() {} };
      }
      onResize() {
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

  // --- @uiw/react-codemirror ------------------------------------------------
  bunMock.module('@uiw/react-codemirror', () => {
    const MockCodeMirror = ({
      value,
      ...props
    }: {
      value: string;
      onChange?: (value: string) => void;
      extensions?: unknown[];
      theme?: unknown;
      height?: string;
      [key: string]: unknown;
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'mock-codemirror',
          'data-extensions-count': props.extensions?.length ?? 0,
          'data-theme': props.theme ? 'set' : 'unset',
          'data-height': props.height ?? '',
        },
        React.createElement('div', { 'data-testid': 'cm-content' }, value),
      );
    return { default: MockCodeMirror };
  });

  // --- react-intersection-observer ------------------------------------------
  bunMock.module('react-intersection-observer', () => ({
    useInView: () => ({ ref: () => {}, inView: true }),
  }));

  // --- react-resizable-panels -----------------------------------------------
  bunMock.module('react-resizable-panels', () => ({
    Group: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) =>
      React.createElement('div', { style, 'data-group': '' }, children),
    Panel: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) =>
      React.createElement('div', { style }, children),
    Separator: ({ style }: { style?: React.CSSProperties }) =>
      React.createElement('div', { style, 'data-separator': '' }),
  }));
}

// ---------------------------------------------------------------------------
// renderWithProviders
// ---------------------------------------------------------------------------

/** Options for {@link renderWithProviders}. */
export interface RenderWithProvidersOptions {
  /** Auth context value. Defaults to an unauthenticated state. */
  authState?: MockAuthState;
  /** Custom QueryClient. A fresh one is created by default. */
  queryClient?: QueryClient;
}

/**
 * Render a React element wrapped in the providers needed by the app:
 * `QueryClientProvider` and `AuthContext.Provider`.
 *
 * Returns whatever `@testing-library/react`'s `render()` returns.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {},
): ReturnType<typeof render> {
  const {
    authState = createMockAuthState(),
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
  } = options;

  // AuthContext is imported at the top of this module as a value import.
  return render(
    React.createElement(
      AuthContext.Provider,
      { value: authState },
      React.createElement(QueryClientProvider, { client: queryClient }, ui),
    ),
  );
}
