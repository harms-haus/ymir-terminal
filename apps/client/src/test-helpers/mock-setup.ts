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
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../hooks/useAuth';

export * from './mock-factories';

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
 * - `@radix-ui/react-dropdown-menu` — functional components rendering children
 * - `@radix-ui/react-popover` — functional components rendering children
 * - `@dnd-kit/react` — `DndContext` as div-with-children
 * - `@dnd-kit/react/sortable` — pass-through
 * - `@dnd-kit/helpers` — empty object
 * - `ghostty-web` — no-op Terminal / FitAddon stubs
 * - `@monaco-editor/react` — `Editor` as div, `DiffEditor` as div
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

  // --- @radix-ui/react-dropdown-menu -----------------------------------------
  bunMock.module('@radix-ui/react-dropdown-menu', () => {
    const DdmRoot = ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children);

    const DdmTrigger = ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
      asChild
        ? children
        : React.createElement('div', { 'data-testid': 'dropdown-trigger' }, children);

    const DdmPortal = ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children);

    const DdmContent = ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement('div', props, children);

    const DdmItem = ({
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

    const DdmSeparator = (props: { [key: string]: unknown }) =>
      React.createElement('div', { ...props, role: 'separator' });

    const DdmSub = ({ children }: { children: React.ReactNode }) => children;

    const DdmSubTrigger = ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement('div', { ...props, 'data-subtrigger': '' }, children);

    const DdmSubContent = ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement('div', props, children);

    const DdmLabel = ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement('div', props, children);

    const DdmGroup = ({ children }: { children: React.ReactNode }) => children;

    return {
      Root: DdmRoot,
      Trigger: DdmTrigger,
      Portal: DdmPortal,
      Content: DdmContent,
      Item: DdmItem,
      Separator: DdmSeparator,
      Sub: DdmSub,
      SubTrigger: DdmSubTrigger,
      SubContent: DdmSubContent,
      Label: DdmLabel,
      Group: DdmGroup,
    };
  });

  // --- @radix-ui/react-popover ----------------------------------------------
  bunMock.module('@radix-ui/react-popover', () => {
    const PopoverRoot = ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children);

    const PopoverTrigger = ({
      children,
      asChild,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
      [key: string]: unknown;
    }) =>
      asChild
        ? children
        : React.createElement('div', { 'data-testid': 'popover-trigger' }, children);

    const PopoverPortal = ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children);

    const PopoverContent = ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement('div', props, children);

    const PopoverClose = ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement('button', props, children);

    const PopoverAnchor = ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children);

    return {
      Root: PopoverRoot,
      Trigger: PopoverTrigger,
      Portal: PopoverPortal,
      Content: PopoverContent,
      Close: PopoverClose,
      Anchor: PopoverAnchor,
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

  // --- @monaco-editor/react ------------------------------------------------
  bunMock.module('@monaco-editor/react', () => {
    const capturedSaveHandlers: Array<() => void> = [];

    const MockEditor = ({
      value,
      onChange: _onChange,
      onMount,
      defaultLanguage,
      options: _options,
      theme,
      height,
      ...rest
    }: {
      value?: string;
      onChange?: (value: string | undefined) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMount?: (editor: any, monaco: any) => void;
      defaultLanguage?: string;
      options?: Record<string, unknown>;
      theme?: string;
      height?: string;
      [key: string]: unknown;
    }) => {
      // Eagerly call onMount so tests that capture it get the callback
      // before assertions run.
      if (onMount) {
        onMount(
          {
            addCommand: (_keybinding: number, handler: () => void) => {
              capturedSaveHandlers.push(handler);
            },
          },
          { KeyMod: { CtrlCmd: 2048 }, KeyCode: { KeyS: 49 } },
        );
      }
      void rest;
      return React.createElement(
        'div',
        {
          'data-testid': 'mock-monaco-editor',
          'data-default-language': defaultLanguage ?? '',
          'data-theme': theme ?? '',
          'data-height': height ?? '',
          onKeyDown: (e: React.KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              capturedSaveHandlers.forEach((h) => h());
              e.preventDefault();
            }
          },
        },
        React.createElement('div', { 'data-testid': 'cm-content' }, value),
      );
    };

    const MockDiffEditor = ({
      original: _original,
      modified,
      height,
      ...rest
    }: {
      original?: string;
      modified?: string;
      height?: string;
      [key: string]: unknown;
    }) => {
      void rest;
      return React.createElement(
        'div',
        {
          'data-testid': 'mock-monaco-diff-editor',
          'data-height': height ?? '',
        },
        React.createElement('div', { 'data-testid': 'diff-content' }, modified ?? ''),
      );
    };

    return { default: MockEditor, Editor: MockEditor, DiffEditor: MockDiffEditor };
  });

  // --- react-intersection-observer ------------------------------------------
  bunMock.module('react-intersection-observer', () => ({
    useInView: () => ({ ref: () => {}, inView: true }),
  }));

  // --- react-resizable-panels -----------------------------------------------
  bunMock.module('react-resizable-panels', () => ({
    Group: ({
      children,
      style,
      orientation,
    }: {
      children: React.ReactNode;
      style?: React.CSSProperties;
      orientation?: 'horizontal' | 'vertical';
      [key: string]: unknown;
    }) =>
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: orientation === 'vertical' ? 'column' : 'row',
            ...style,
          },
          'data-group': '',
          'data-orientation': orientation ?? 'horizontal',
        },
        children,
      ),
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

// ---------------------------------------------------------------------------
// React controlled input helper
// ---------------------------------------------------------------------------

/**
 * Simulate changing a React controlled input's value.
 *
 * happy-dom's fireEvent.change does not trigger React's internal change
 * detection for controlled inputs. We directly invoke the onChange handler
 * from React's internal props to update the component state.
 */
export function setReactInputValue(input: HTMLInputElement, value: string): void {
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
