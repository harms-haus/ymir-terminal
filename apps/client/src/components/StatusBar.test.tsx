/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useConnectionStatus
// ---------------------------------------------------------------------------

let mockConnectionStatus = {
  status: 'connected' as string,
  isConnected: true,
  isReconnecting: false,
};

mock.module('../hooks/useConnectionStatus', () => ({
  useConnectionStatus: () => mockConnectionStatus,
}));

const { StatusBar } = await import('./StatusBar');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderStatusBar(options: { activeWorkspaceName?: string } = {}) {
  return render(
    React.createElement(StatusBar, { activeWorkspaceName: options.activeWorkspaceName }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('StatusBar', () => {
  beforeEach(() => {
    mockConnectionStatus = {
      status: 'connected',
      isConnected: true,
      isReconnecting: false,
    };
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. StatusBar renders at the bottom of the screen
  // -----------------------------------------------------------------------
  test('renders at the bottom of the screen', () => {
    const { getByTestId } = renderStatusBar();

    const statusBar = getByTestId('status-bar');
    expect(statusBar).toBeTruthy();
    // Verify it's styled as a bottom bar: fixed height, flex, blue background
    expect(statusBar.style.height).toBe('22px');
    expect(statusBar.style.background).toBe('#007acc');
    expect(statusBar.style.display).toBe('flex');
  });

  // -----------------------------------------------------------------------
  // 2. Shows connection status indicator (green = connected)
  // -----------------------------------------------------------------------
  test('shows green dot when connected', () => {
    mockConnectionStatus = { status: 'connected', isConnected: true, isReconnecting: false };
    const { getByTestId } = renderStatusBar();

    const indicator = getByTestId('status-indicator');
    expect(indicator).toBeTruthy();
    expect(indicator.style.background).toBe('#4caf50');
  });

  // -----------------------------------------------------------------------
  // 2b. Shows yellow dot when reconnecting
  // -----------------------------------------------------------------------
  test('shows yellow dot when reconnecting', () => {
    mockConnectionStatus = { status: 'reconnecting', isConnected: false, isReconnecting: true };
    const { getByTestId } = renderStatusBar();

    const indicator = getByTestId('status-indicator');
    expect(indicator).toBeTruthy();
    expect(indicator.style.background).toBe('#ff9800');
  });

  // -----------------------------------------------------------------------
  // 2c. Shows red dot when disconnected
  // -----------------------------------------------------------------------
  test('shows red dot when disconnected', () => {
    mockConnectionStatus = { status: 'disconnected', isConnected: false, isReconnecting: false };
    const { getByTestId } = renderStatusBar();

    const indicator = getByTestId('status-indicator');
    expect(indicator).toBeTruthy();
    expect(indicator.style.background).toBe('#f44336');
  });

  // -----------------------------------------------------------------------
  // 3. Shows active workspace name
  // -----------------------------------------------------------------------
  test('shows active workspace name when provided', () => {
    const { getByText } = renderStatusBar({ activeWorkspaceName: 'my-workspace' });

    expect(getByText('my-workspace')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3b. Does not render workspace span when name is not provided
  // -----------------------------------------------------------------------
  test('does not show workspace name when not provided', () => {
    const { getByTestId } = renderStatusBar();

    const statusBar = getByTestId('status-bar');
    // Should only have the status indicator div, no workspace span
    const spans = statusBar.querySelectorAll('span');
    // Only the status text span should be present
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('Connected');
  });

  // -----------------------------------------------------------------------
  // 4. Shows connection status text
  // -----------------------------------------------------------------------
  test('shows "Connected" when connected', () => {
    mockConnectionStatus = { status: 'connected', isConnected: true, isReconnecting: false };
    const { getByText } = renderStatusBar();

    expect(getByText('Connected')).toBeTruthy();
  });

  test('shows "Reconnecting..." when reconnecting', () => {
    mockConnectionStatus = { status: 'reconnecting', isConnected: false, isReconnecting: true };
    const { getByText } = renderStatusBar();

    expect(getByText('Reconnecting...')).toBeTruthy();
  });

  test('shows "Disconnected" when disconnected', () => {
    mockConnectionStatus = { status: 'disconnected', isConnected: false, isReconnecting: false };
    const { getByText } = renderStatusBar();

    expect(getByText('Disconnected')).toBeTruthy();
  });
});
