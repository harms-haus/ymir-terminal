/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { AuthContext } from '../hooks/useAuth';
import type { UseConnectionManagerReturn } from '../hooks/useConnectionManager';

// ---------------------------------------------------------------------------
// Mock useConnectionManager
// ---------------------------------------------------------------------------

const defaultMockCMReturn: UseConnectionManagerReturn = {
  currentUrl: null,
  currentHost: null,
  currentPort: null,
  status: 'disconnected',
  favorites: [],
  recentConnections: [],
  addFavorite: mock(() => {}),
  removeFavorite: mock(() => {}),
  updateFavorite: mock(() => {}),
  clearRecent: mock(() => {}),
  connect: mock(() => {}),
  disconnect: mock(() => {}),
  connectToLocal: mock(() => {}),
  isFavorite: mock(() => false),
  isTauri: false,
  localPort: null,
};

let mockCMReturn: UseConnectionManagerReturn = { ...defaultMockCMReturn };

mock.module('../hooks/useConnectionManager', () => ({
  useConnectionManager: () => mockCMReturn,
}));

mock.module('../hooks/useDialog', () => ({
  useConfirm: () => async () => true,
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { LoginPage } = await import('./LoginPage');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLoginPage(overrides: { login?: ReturnType<typeof mock> } = {}) {
  const loginMock = overrides.login ?? mock(() => Promise.resolve());
  const logoutMock = mock(() => {});

  const contextValue = {
    isAuthenticated: false,
    token: null as string | null,
    login: loginMock as (password: string) => Promise<void>,
    logout: logoutMock,
    clearToken: mock(() => {}),
    suppressAutoLogin: mock(() => {}),
  };

  const result = render(
    React.createElement(
      AuthContext.Provider,
      { value: contextValue },
      React.createElement(LoginPage),
    ),
  );

  return {
    loginMock,
    logoutMock,
    ...result,
  };
}

function resetMockCM() {
  mockCMReturn = { ...defaultMockCMReturn };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMockCM();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // Original tests
  // -----------------------------------------------------------------------

  test('renders password input and submit button', () => {
    const { container } = renderLoginPage();

    const input = container.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.placeholder.toLowerCase()).toContain('password');

    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button).toBeTruthy();
  });

  test('submit button shows Sign In text', () => {
    const { container } = renderLoginPage();

    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.textContent).toContain('Sign In');
  });

  test('form has password input with correct attributes', () => {
    const { container } = renderLoginPage();

    const input = container.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.id).toBe('password');
    expect(input.disabled).toBe(false);
  });

  // -----------------------------------------------------------------------
  // ConnectionManagerPopover on LoginPage
  // -----------------------------------------------------------------------

  test('renders connection manager popover trigger on login page', () => {
    const { getByTestId } = renderLoginPage();
    const trigger = getByTestId('connection-manager-trigger');
    expect(trigger).toBeTruthy();
    expect(trigger.tagName).toBe('BUTTON');
  });

  test('renders Server: label next to connection manager', () => {
    const { getByText } = renderLoginPage();
    expect(getByText('Server:')).toBeTruthy();
  });

  test('connection manager shows Disconnected by default', () => {
    const { getByTestId } = renderLoginPage();
    const trigger = getByTestId('connection-manager-trigger');
    expect(trigger.textContent).toContain('Disconnected');
  });

  test('connection manager shows host:port when connected', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connected',
      currentHost: '10.0.0.1',
      currentPort: 4000,
    };

    const { getByTestId } = renderLoginPage();
    const trigger = getByTestId('connection-manager-trigger');
    expect(trigger.textContent).toContain('10.0.0.1:4000');
  });
});
