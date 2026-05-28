/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { render } from '@testing-library/react';
import React from 'react';
import { LoginPage } from './LoginPage';
import { AuthContext } from '../hooks/useAuth';

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
// Tests
// ---------------------------------------------------------------------------

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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
