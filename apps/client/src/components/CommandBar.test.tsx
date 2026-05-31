/// <reference lib="dom" />
import { setupTestDom, setupAllMocks, setReactInputValue } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
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
    // Pre-set the query *before* rendering so the component reads it via
    // the mock getter on its first active render — no re-mount needed.
    mockQuery = 'nonexistent';
    mockSetQueryFn = mock((value: string) => {
      mockQuery = value;
    });

    const result = render(
      React.createElement(CommandBar, {
        workspaceId: 'ws-1',
        onFileSelect: () => {},
      }),
    );

    // Activate — clicking the trigger flips isActive to true; the component
    // re-renders, reads mockQuery ("nonexistent") from the hook getter,
    // and opens the dropdown because !!query is true.
    activate(result);

    // The input reflects the pre-set query
    const input = result.getByTestId('command-bar-input') as HTMLInputElement;
    expect(input.value).toBe('nonexistent');

    // With a non-empty query and empty results, dropdown shows "No files found"
    expect(result.getByText(/No files found/)).toBeTruthy();
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
