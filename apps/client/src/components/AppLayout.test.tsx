/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { AppLayout } from './AppLayout';
import { AuthContext } from '../hooks/useAuth';

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
    const { container } = renderAppLayout();

    // react-resizable-panels v4 renders data-group attribute and uses flexDirection
    const groups = container.querySelectorAll('[data-group]');
    // First (outer) group should be horizontal (flex-direction: row)
    expect(groups.length).toBeGreaterThanOrEqual(1);
    const outerGroup = groups[0] as HTMLElement;
    expect(outerGroup.style.flexDirection).toBe('row');
  });

  // -----------------------------------------------------------------------
  // 5. Bottom panel is resizable vertically
  // -----------------------------------------------------------------------
  test('bottom panel is resizable vertically', () => {
    const { container } = renderAppLayout();

    // The nested Group inside the center panel should be vertical (flex-direction: column)
    const groups = container.querySelectorAll('[data-group]');
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const innerGroup = groups[1] as HTMLElement;
    expect(innerGroup.style.flexDirection).toBe('column');
  });

  // -----------------------------------------------------------------------
  // 6. Shows LoginPage when not authenticated
  // -----------------------------------------------------------------------
  test('shows LoginPage when not authenticated', () => {
    const { container, queryByTestId } = renderAppLayout({ isAuthenticated: false });

    // LoginPage has a password input
    const passwordInput = container.querySelector('input[type="password"]');
    expect(passwordInput).toBeTruthy();

    // Layout panels should not be rendered
    expect(queryByTestId('left-sidebar')).toBeNull();
    expect(queryByTestId('main-content')).toBeNull();
  });
});
