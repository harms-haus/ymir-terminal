/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useFileSearch
// ---------------------------------------------------------------------------

let mockQuery = '';
let mockSetQueryFn = (_value: string) => {};
const mockResults: never[] = [];

mock.module('../hooks/useFileSearch', () => ({
  useFileSearch: (_workspaceId: string | null) => ({
    get query() {
      return mockQuery;
    },
    get setQuery() {
      return mockSetQueryFn;
    },
    results: mockResults,
  }),
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

const { CommandBar } = await import('./CommandBar');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate changing a React controlled input's value.
 *
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

function renderCommandBar(
  props: {
    workspaceId?: string | null;
    workspaceName?: string;
    onFileSelect?: (path: string) => void;
  } = {},
) {
  mockQuery = '';
  mockSetQueryFn = mock((value: string) => {
    mockQuery = value;
  });

  return render(
    React.createElement(CommandBar, {
      workspaceId: props.workspaceId ?? null,
      workspaceName: props.workspaceName,
      onFileSelect: props.onFileSelect ?? (() => {}),
    }),
  );
}

/** Activate the command bar by clicking the trigger */
function activate(result: ReturnType<typeof render>) {
  fireEvent.click(result.getByTestId('command-bar-trigger'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('CommandBar', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders input when activated
  // -----------------------------------------------------------------------
  test('renders input when activated', () => {
    const result = renderCommandBar();

    // Initially shows the trigger, not the input
    expect(result.queryByTestId('command-bar-input')).toBeNull();
    expect(result.getByTestId('command-bar-trigger')).toBeTruthy();

    // Activate
    activate(result);

    // Now input should be present
    expect(result.getByTestId('command-bar-input')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Empty results — no files found text
  // -----------------------------------------------------------------------
  test('shows no results text when query yields no matches', () => {
    const result = renderCommandBar({ workspaceId: 'ws-1' });
    activate(result);

    const input = result.getByTestId('command-bar-input') as HTMLInputElement;

    // Type a non-command query (no leading /)
    setReactInputValue(input, 'nonexistent');

    // Verify the mock setter was invoked
    expect(mockSetQueryFn).toHaveBeenCalledWith('nonexistent');

    // The mock updates mockQuery, but React doesn't re-render because our
    // hook mock doesn't trigger a state update. Force a re-render by
    // re-mounting so the component reads the updated mockQuery.
    cleanup();
    const result2 = render(
      React.createElement(CommandBar, {
        workspaceId: 'ws-1',
        onFileSelect: () => {},
      }),
    );
    activate(result2);

    // With non-empty query and empty results, dropdown shows "No files found"
    expect(result2.getByText(/No files found/)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Escape key deactivates the command bar
  // -----------------------------------------------------------------------
  test('pressing Escape deactivates the command bar', () => {
    const result = renderCommandBar();
    activate(result);

    // Confirm input is visible
    expect(result.getByTestId('command-bar-input')).toBeTruthy();

    // Press Escape
    fireEvent.keyDown(result.getByTestId('command-bar-input'), { key: 'Escape' });

    // Should be back to showing the trigger, not the input
    expect(result.queryByTestId('command-bar-input')).toBeNull();
    expect(result.getByTestId('command-bar-trigger')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 4. Typing updates the search query
  // -----------------------------------------------------------------------
  test('typing updates the search query', () => {
    const result = renderCommandBar();
    activate(result);

    const input = result.getByTestId('command-bar-input') as HTMLInputElement;

    // Type into the input via React's internal onChange
    setReactInputValue(input, 'hello');

    // The setQuery callback should have been called with the typed value
    expect(mockSetQueryFn).toHaveBeenCalledWith('hello');
  });
});
