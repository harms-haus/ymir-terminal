/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { AuthContext } from '../hooks/useAuth';

mock.module('../hooks/useDialog', () => ({
  useConfirm: () => async () => true,
  usePrompt: () => async () => null,
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
});
