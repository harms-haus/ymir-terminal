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

// ---------------------------------------------------------------------------
// Mock sonner
// ---------------------------------------------------------------------------
mock.module('sonner', () => {
  return {
    Toaster: () => React.createElement('div', { 'data-testid': 'sonner-toaster' }),
    toast: {
      success: mock(() => {}),
      error: mock(() => {}),
      info: mock(() => {}),
      warning: mock(() => {}),
      promise: mock(() => {}),
      dismiss: mock(() => {}),
    },
  };
});

import { ToastProvider } from './ToastProvider';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToastProvider', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders without crashing', () => {
    const { container } = render(
      React.createElement(ToastProvider, null, null)
    );
    expect(container).toBeTruthy();
  });

  test('renders children', () => {
    const { getByText } = render(
      React.createElement(
        ToastProvider,
        null,
        React.createElement('div', null, 'Hello from child')
      )
    );
    expect(getByText('Hello from child')).toBeTruthy();
  });

  test('renders the Toaster component', () => {
    const { getByTestId } = render(
      React.createElement(ToastProvider, null,
        React.createElement('div', null, 'Content')
      )
    );
    expect(getByTestId('sonner-toaster')).toBeTruthy();
  });
});
