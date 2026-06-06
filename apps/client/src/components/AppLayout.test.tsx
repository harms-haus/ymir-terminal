/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// Import the real AuthContext before any mocking so our context-aware
// useAuth mock below can reference it.
import { AuthContext } from '../hooks/useAuth';

// Mock WindowTitleBar's dependencies instead of the component itself to
// avoid cross-file mock contamination (mock.module is process-scoped).
mock.module('./ConnectionManagerPopover', () => ({
  ConnectionManagerPopover: () =>
    React.createElement('div', { 'data-testid': 'connection-manager' }),
}));

mock.module('./WindowControls', () => ({
  WindowControls: () => React.createElement('div', { 'data-testid': 'window-controls' }),
}));

// Mock useAuth to read from the real AuthContext so the component
// respects the Provider value set in each test, even when another
// test file has contaminated the useAuth module.
mock.module('../hooks/useAuth', () => ({
  useAuth: () => {
    const ctx = React.useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
  },
  AuthContext,
}));

import { AppLayout } from './AppLayout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAppLayout(
  options: {
    isAuthenticated?: boolean;
    children?: React.ReactNode;
    paneVisibility?: { left: boolean; right: boolean; bottom: boolean };
  } = {},
) {
  const {
    isAuthenticated = true,
    children = React.createElement('div', { 'data-testid': 'child-content' }, 'Child'),
    paneVisibility = { left: true, right: true, bottom: true },
  } = options;

  const contextValue = {
    isAuthenticated,
    token: isAuthenticated ? 'test-token' : null,
    login: mock(() => Promise.resolve()) as (password: string) => Promise<void>,
    logout: mock(() => {}),
    clearToken: mock(() => {}),
    suppressAutoLogin: mock(() => {}),
  };

  const result = render(
    React.createElement(
      AuthContext.Provider,
      { value: contextValue },
      React.createElement(AppLayout, { paneVisibility }, children),
    ),
  );

  return { ...result, contextValue };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('AppLayout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders left sidebar, main content area, and right sidebar
  // -----------------------------------------------------------------------
  test('renders left sidebar, main content area, and right sidebar', () => {
    const { getByTestId } = renderAppLayout();

    expect(getByTestId('left-sidebar')).toBeTruthy();
    expect(getByTestId('main-content')).toBeTruthy();
    expect(getByTestId('right-sidebar')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Main area has a bottom panel section
  // -----------------------------------------------------------------------
  test('main area has a bottom panel section', () => {
    const { getByTestId } = renderAppLayout();

    expect(getByTestId('bottom-panel')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Layout renders children in the main content area
  // -----------------------------------------------------------------------
  test('renders children in the main content area', () => {
    const { getByTestId } = renderAppLayout({
      children: React.createElement('span', { 'data-testid': 'custom-child' }, 'Hello World'),
    });

    const mainContent = getByTestId('main-content');
    const customChild = getByTestId('custom-child');
    expect(mainContent.contains(customChild)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 4. Uses Group with horizontal orientation for left/center/right
  // -----------------------------------------------------------------------
  test('uses Group with horizontal orientation for left/center/right', () => {
    const { container, getByTestId } = renderAppLayout();

    // Verify the outer group exists, has horizontal orientation, and contains
    // all three sidebar/content regions
    const groups = container.querySelectorAll('[data-group]');
    expect(groups.length).toBeGreaterThanOrEqual(1);
    const outerGroup = groups[0] as HTMLElement;
    expect(outerGroup.getAttribute('data-orientation')).toBe('horizontal');
    expect(outerGroup.contains(getByTestId('left-sidebar'))).toBe(true);
    expect(outerGroup.contains(getByTestId('main-content'))).toBe(true);
    expect(outerGroup.contains(getByTestId('right-sidebar'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 5. Bottom panel is resizable vertically
  // -----------------------------------------------------------------------
  test('bottom panel is resizable vertically', () => {
    const { container, getByTestId } = renderAppLayout();

    // Verify a nested group exists inside the center panel with vertical
    // orientation, containing content and bottom panels
    const groups = container.querySelectorAll('[data-group]');
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const innerGroup = groups[1] as HTMLElement;
    expect(innerGroup.getAttribute('data-orientation')).toBe('vertical');
    expect(innerGroup.contains(getByTestId('main-content'))).toBe(true);
    expect(innerGroup.contains(getByTestId('bottom-panel'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 6. Shows LoginPage when not authenticated
  // -----------------------------------------------------------------------
  test('shows WindowTitleBar and LoginPage when not authenticated', () => {
    const { getByTestId, queryByTestId } = renderAppLayout({ isAuthenticated: false });

    // WindowTitleBar is rendered
    expect(getByTestId('window-title-bar')).toBeTruthy();

    // LoginPage renders with its own data-testid
    expect(getByTestId('login-page')).toBeTruthy();

    // Layout panels should not be rendered
    expect(queryByTestId('left-sidebar')).toBeNull();
    expect(queryByTestId('main-content')).toBeNull();
  });
});
