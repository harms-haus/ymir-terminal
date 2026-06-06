/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock dependencies (must come before component import)
// ---------------------------------------------------------------------------

mock.module('./ConnectionManagerPopover', () => ({
  ConnectionManagerPopover: () =>
    React.createElement('div', { 'data-testid': 'connection-manager' }),
}));

mock.module('./WindowControls', () => ({
  WindowControls: () => React.createElement('div', { 'data-testid': 'window-controls' }),
}));

// Use dynamic import so we always get a fresh copy of WindowTitleBar
// with our own mocks, rather than a cached copy from another test file.
const { WindowTitleBar } = await import('./WindowTitleBar');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('WindowTitleBar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders without crashing
  // -----------------------------------------------------------------------
  test('renders without crashing', () => {
    const { container } = render(React.createElement(WindowTitleBar));
    expect(container.firstChild).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Renders ConnectionManagerPopover
  // -----------------------------------------------------------------------
  test('renders ConnectionManagerPopover', () => {
    const { getByTestId } = render(React.createElement(WindowTitleBar));
    expect(getByTestId('connection-manager')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Does NOT render WindowControls in browser mode (no Tauri)
  // -----------------------------------------------------------------------
  test('does NOT render WindowControls in browser mode', () => {
    const { queryByTestId } = render(React.createElement(WindowTitleBar));
    expect(queryByTestId('window-controls')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 4. Has data-tauri-drag-region="deep" attribute on outer div
  // -----------------------------------------------------------------------
  test('has data-tauri-drag-region="deep" attribute on outer div', () => {
    const { container } = render(React.createElement(WindowTitleBar));
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.getAttribute('data-tauri-drag-region')).toBe('deep');
  });

  // -----------------------------------------------------------------------
  // 5. Renders children in centre when provided
  // -----------------------------------------------------------------------
  test('renders children in centre when provided', () => {
    const { getByTestId } = render(
      React.createElement(
        WindowTitleBar,
        null,
        React.createElement('span', { 'data-testid': 'centre-child' }, 'Hello'),
      ),
    );
    expect(getByTestId('centre-child')).toBeTruthy();
    expect(getByTestId('centre-child').textContent).toBe('Hello');
  });

  // -----------------------------------------------------------------------
  // 6. Does NOT render PaneToggleButtons or call usePaneVisibility
  // -----------------------------------------------------------------------
  test('does NOT render PaneToggleButtons or use pane visibility', () => {
    const { queryByTestId } = render(React.createElement(WindowTitleBar));

    // PaneToggleButtons would render buttons with data-testid patterns
    // containing pane toggle identifiers. Since we don't import the module
    // at all, there should be no such elements in the DOM.
    expect(queryByTestId('left-sidebar')).toBeNull();
    expect(queryByTestId('right-sidebar')).toBeNull();
    expect(queryByTestId('bottom-panel')).toBeNull();
  });
});
