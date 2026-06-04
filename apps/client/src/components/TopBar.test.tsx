/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

let mockPaneState = {
  left: true,
  right: true,
  bottom: true,
  toggleLeft: mock(() => {}),
  toggleRight: mock(() => {}),
  toggleBottom: mock(() => {}),
};

const mockUsePaneVisibility = mock(() => ({ ...mockPaneState }));

mock.module('./ConnectionManagerPopover', () => ({
  ConnectionManagerPopover: () =>
    React.createElement('div', { 'data-testid': 'connection-manager' }),
}));

mock.module('../hooks/usePaneVisibility', () => ({
  usePaneVisibility: mockUsePaneVisibility,
  PaneVisibilityProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { TopBar } = await import('./TopBar');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTopBar(commandBar?: React.ReactNode) {
  return render(React.createElement(TopBar, { commandBar }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('TopBar', () => {
  beforeEach(() => {
    mockPaneState = {
      left: true,
      right: true,
      bottom: true,
      toggleLeft: mock(() => {}),
      toggleRight: mock(() => {}),
      toggleBottom: mock(() => {}),
    };
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders without crashing
  // -----------------------------------------------------------------------
  test('renders without crashing', () => {
    const { container } = renderTopBar();
    expect(container.firstChild).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Connection manager component is rendered
  // -----------------------------------------------------------------------
  test('renders connection manager component', () => {
    const { getByTestId } = renderTopBar();

    const manager = getByTestId('connection-manager');
    expect(manager).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Toggle buttons are rendered
  // -----------------------------------------------------------------------
  test('renders workspace, terminal, and explorer toggle buttons', () => {
    const { getByTestId } = renderTopBar();

    expect(getByTestId('toggle-workspace-btn')).toBeTruthy();
    expect(getByTestId('toggle-terminal-btn')).toBeTruthy();
    expect(getByTestId('toggle-explorer-btn')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 4. Active panes have different styling from inactive panes
  // -----------------------------------------------------------------------
  test('active panes have full opacity and active background, inactive panes are dimmed', () => {
    // Set left=active, bottom=inactive, right=active
    mockPaneState = {
      left: true,
      right: true,
      bottom: false,
      toggleLeft: mock(() => {}),
      toggleRight: mock(() => {}),
      toggleBottom: mock(() => {}),
    };

    const { getByTestId } = renderTopBar();

    const workspaceBtn = getByTestId('toggle-workspace-btn') as HTMLElement;
    const terminalBtn = getByTestId('toggle-terminal-btn') as HTMLElement;
    const explorerBtn = getByTestId('toggle-explorer-btn') as HTMLElement;

    // Active buttons: opacity 1
    expect(workspaceBtn.style.opacity).toBe('1');
    expect(explorerBtn.style.opacity).toBe('1');

    // Inactive button: opacity 0.5
    expect(terminalBtn.style.opacity).toBe('0.5');

    // Active buttons use active background
    expect(workspaceBtn.style.backgroundColor).toBe('rgba(255, 255, 255, 0.15)');
    expect(explorerBtn.style.backgroundColor).toBe('rgba(255, 255, 255, 0.15)');

    // Inactive button uses transparent background
    expect(terminalBtn.style.backgroundColor).toBe('transparent');
  });

  // -----------------------------------------------------------------------
  // 5. Command bar slot renders provided content
  // -----------------------------------------------------------------------
  test('renders commandBar content in the center slot', () => {
    const { getByTestId } = renderTopBar(
      React.createElement('div', { 'data-testid': 'custom-command-bar' }, 'My Command Bar'),
    );

    expect(getByTestId('custom-command-bar')).toBeTruthy();
  });
});
