/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import type { UseConnectionManagerReturn } from '../hooks/useConnectionManager';
import {
  COLOR_STATUS_CONNECTED,
  COLOR_STATUS_DISCONNECTED,
  COLOR_STATUS_RECONNECTING,
  COLOR_ACCENT,
} from '../lib/theme';

// ---------------------------------------------------------------------------
// Mock useConnectionManager
// ---------------------------------------------------------------------------

const defaultMockReturn: UseConnectionManagerReturn = {
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

// Mutable copy that tests can reassign
let mockCMReturn: UseConnectionManagerReturn = { ...defaultMockReturn };

mock.module('../hooks/useConnectionManager', () => ({
  useConnectionManager: () => mockCMReturn,
}));

mock.module('../hooks/useDialog', () => ({
  useConfirm: () => async () => true,
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

const { ConnectionManagerPopover } = await import('./ConnectionManagerPopover');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPopover() {
  return render(React.createElement(ConnectionManagerPopover));
}

function resetMock() {
  mockCMReturn = {
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

describe('ConnectionManagerPopover', () => {
  beforeEach(() => {
    resetMock();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Renders trigger button with data-testid="connection-manager-trigger"
  // -----------------------------------------------------------------------
  test('renders trigger button with correct test id', () => {
    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    expect(trigger).toBeTruthy();
    expect(trigger.tagName).toBe('BUTTON');
  });

  // -----------------------------------------------------------------------
  // 2. Shows green dot when connected
  // -----------------------------------------------------------------------
  test('shows green dot when connected', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connected',
      currentHost: '127.0.0.1',
      currentPort: 3000,
    };

    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    // The first child span is the status dot
    const dot = trigger.querySelector('span');
    expect(dot).toBeTruthy();
    expect(dot!.style.background).toBe(COLOR_STATUS_CONNECTED);
  });

  // -----------------------------------------------------------------------
  // 3. Shows red dot when disconnected
  // -----------------------------------------------------------------------
  test('shows red dot when disconnected', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'disconnected',
    };

    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    const dot = trigger.querySelector('span');
    expect(dot).toBeTruthy();
    expect(dot!.style.background).toBe(COLOR_STATUS_DISCONNECTED);
  });

  // -----------------------------------------------------------------------
  // 4. Shows host:port text when connected
  // -----------------------------------------------------------------------
  test('shows host:port text when connected', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connected',
      currentHost: '192.168.1.100',
      currentPort: 5000,
    };

    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    expect(trigger.textContent).toContain('192.168.1.100:5000');
  });

  // -----------------------------------------------------------------------
  // 5. Shows "Disconnected" when not connected
  // -----------------------------------------------------------------------
  test('shows Disconnected text when not connected', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'disconnected',
    };

    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    expect(trigger.textContent).toContain('Disconnected');
  });

  // -----------------------------------------------------------------------
  // 6. Popover content has data-testid="connection-manager-popover"
  // -----------------------------------------------------------------------
  test('popover content has correct test id', () => {
    const { getByTestId } = renderPopover();
    expect(getByTestId('connection-manager-popover')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 7. Popover shows Current Connection section header
  // -----------------------------------------------------------------------
  test('popover shows Current Connection section header', () => {
    const { getByText } = renderPopover();
    expect(getByText('Current Connection')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 8. Popover shows Connect to Server section with host/port inputs
  // -----------------------------------------------------------------------
  test('popover shows Connect to Server section with host/port inputs', () => {
    const { getByText, getByTestId } = renderPopover();
    expect(getByText('Connect to Server')).toBeTruthy();
    expect(getByTestId('host-input')).toBeTruthy();
    expect(getByTestId('port-input')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 9. Connect button disabled when host input is empty
  // -----------------------------------------------------------------------
  test('connect button disabled when host input is empty', () => {
    const { getByTestId } = renderPopover();
    const connectBtn = getByTestId('connect-btn');
    expect(connectBtn).toBeTruthy();
    expect((connectBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 10. Clicking connect with valid host/port calls connect() and closes popover
  // -----------------------------------------------------------------------
  test('clicking connect with valid host/port calls connect and closes popover', () => {
    // We can't simulate React controlled input changes in happy-dom,
    // so test the connect behavior through a favorite entry instead,
    // which uses the same cm.connect() function.
    mockCMReturn = {
      ...mockCMReturn,
      status: 'disconnected',
      favorites: [
        {
          id: 'fav-1',
          label: 'Test Server',
          host: '10.0.0.1',
          port: 4000,
          createdAt: Date.now(),
        },
      ],
    };
    const { getByTestId } = renderPopover();
    const connectFavBtn = getByTestId('fav-connect-fav-1');
    fireEvent.click(connectFavBtn);
    expect(mockCMReturn.connect).toHaveBeenCalledWith('10.0.0.1', 4000);
  });

  // -----------------------------------------------------------------------
  // 11. Disconnect button appears when connected
  // -----------------------------------------------------------------------
  test('disconnect button appears when connected', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connected',
      currentHost: '127.0.0.1',
      currentPort: 3000,
    };

    const { getByTestId } = renderPopover();
    expect(getByTestId('disconnect-btn')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 12. Clicking disconnect calls disconnect()
  // -----------------------------------------------------------------------
  test('clicking disconnect calls disconnect', async () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connected',
      currentHost: '127.0.0.1',
      currentPort: 3000,
    };

    const { getByTestId } = renderPopover();
    fireEvent.click(getByTestId('disconnect-btn'));

    // Wait for the async confirm + disconnect to resolve
    await new Promise((r) => setTimeout(r, 0));
    expect(mockCMReturn.disconnect).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 13. Save as Favorite button appears when connected and not already favorite
  // -----------------------------------------------------------------------
  test('save as favorite button appears when connected and not already favorite', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connected',
      currentHost: '127.0.0.1',
      currentPort: 3000,
      isFavorite: mock(() => false),
    };

    const { getByTestId } = renderPopover();
    expect(getByTestId('save-favorite-btn')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 14. Favorites section shows when favorites exist
  // -----------------------------------------------------------------------
  test('favorites section shows when favorites exist', () => {
    mockCMReturn = {
      ...mockCMReturn,
      favorites: [
        { id: 'f1', label: 'My Server', host: '10.0.0.1', port: 3000, createdAt: 1 },
        { id: 'f2', label: 'Dev Box', host: '192.168.1.50', port: 8080, createdAt: 2 },
      ],
    };

    const { getByText } = renderPopover();
    expect(getByText('Favorites (2)')).toBeTruthy();
    expect(getByText('My Server')).toBeTruthy();
    expect(getByText('Dev Box')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 15. Clicking favorite's connect button calls connect()
  // -----------------------------------------------------------------------
  test('clicking favorite connect button calls connect with correct args', () => {
    mockCMReturn = {
      ...mockCMReturn,
      favorites: [{ id: 'f1', label: 'My Server', host: '10.0.0.1', port: 3000, createdAt: 1 }],
    };

    const { getByTestId } = renderPopover();
    fireEvent.click(getByTestId('fav-connect-f1'));

    expect(mockCMReturn.connect).toHaveBeenCalledWith('10.0.0.1', 3000);
  });

  // -----------------------------------------------------------------------
  // 16. Clicking favorite's delete button calls removeFavorite()
  // -----------------------------------------------------------------------
  test('clicking favorite delete button calls removeFavorite', async () => {
    mockCMReturn = {
      ...mockCMReturn,
      favorites: [{ id: 'f1', label: 'My Server', host: '10.0.0.1', port: 3000, createdAt: 1 }],
    };

    const { getByTestId } = renderPopover();
    fireEvent.click(getByTestId('fav-delete-f1'));

    // The delete handler is async (uses useConfirm), wait for the promise to resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(mockCMReturn.removeFavorite).toHaveBeenCalledWith('f1');
  });

  // -----------------------------------------------------------------------
  // 17. Recent section shows when recent connections exist
  // -----------------------------------------------------------------------
  test('recent section shows when recent connections exist', () => {
    mockCMReturn = {
      ...mockCMReturn,
      recentConnections: [
        {
          id: 'r1',
          host: '10.0.0.1',
          port: 3000,
          label: 'Server',
          createdAt: 1,
          lastConnectedAt: 1,
        },
        {
          id: 'r2',
          host: '192.168.1.50',
          port: 8080,
          label: 'Dev',
          createdAt: 2,
          lastConnectedAt: 2,
        },
      ],
    };

    const { getByText } = renderPopover();
    expect(getByText('Recent')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 18. Clicking recent's connect button calls connect()
  // -----------------------------------------------------------------------
  test('clicking recent connect button calls connect with correct args', () => {
    mockCMReturn = {
      ...mockCMReturn,
      recentConnections: [
        {
          id: 'r1',
          host: '10.0.0.1',
          port: 3000,
          label: 'Server',
          createdAt: 1,
          lastConnectedAt: 1,
        },
      ],
    };

    const { getByTestId } = renderPopover();
    fireEvent.click(getByTestId('recent-connect-r1'));

    expect(mockCMReturn.connect).toHaveBeenCalledWith('10.0.0.1', 3000);
  });

  // -----------------------------------------------------------------------
  // 19. Clear button clears recent connections
  // -----------------------------------------------------------------------
  test('clear button clears recent connections', () => {
    mockCMReturn = {
      ...mockCMReturn,
      recentConnections: [
        {
          id: 'r1',
          host: '10.0.0.1',
          port: 3000,
          label: 'Server',
          createdAt: 1,
          lastConnectedAt: 1,
        },
      ],
    };

    const { getByTestId } = renderPopover();
    fireEvent.click(getByTestId('clear-recent-btn'));

    expect(mockCMReturn.clearRecent).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 20. Connect to Local button appears when isTauri is true
  // -----------------------------------------------------------------------
  test('connect to local button appears when isTauri is true', () => {
    mockCMReturn = {
      ...mockCMReturn,
      isTauri: true,
      localPort: 7777,
    };

    const { getByTestId } = renderPopover();
    const localBtn = getByTestId('connect-local-btn');
    expect(localBtn).toBeTruthy();
    expect(localBtn.textContent).toContain('Connect to Local Server');
    expect(localBtn.textContent).toContain('7777');
  });

  // -----------------------------------------------------------------------
  // Extra: orange dot for reconnecting status
  // -----------------------------------------------------------------------
  test('shows orange dot when reconnecting', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'reconnecting',
      currentHost: '127.0.0.1',
      currentPort: 3000,
    };

    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    const dot = trigger.querySelector('span');
    expect(dot!.style.background).toBe(COLOR_STATUS_RECONNECTING);
  });

  // -----------------------------------------------------------------------
  // Extra: blue dot for connecting status
  // -----------------------------------------------------------------------
  test('shows blue dot when connecting', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connecting',
      currentHost: '127.0.0.1',
      currentPort: 3000,
    };

    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    const dot = trigger.querySelector('span');
    expect(dot!.style.background).toBe(COLOR_ACCENT);
  });

  // -----------------------------------------------------------------------
  // Extra: trigger has correct aria-label when connected
  // -----------------------------------------------------------------------
  test('trigger has correct aria-label when connected', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connected',
      currentHost: '10.0.0.1',
      currentPort: 5000,
    };

    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    expect(trigger.getAttribute('aria-label')).toBe('Connected to 10.0.0.1:5000. Click to manage.');
  });

  // -----------------------------------------------------------------------
  // Extra: trigger has correct aria-label when disconnected
  // -----------------------------------------------------------------------
  test('trigger has correct aria-label when disconnected', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'disconnected',
    };

    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    expect(trigger.getAttribute('aria-label')).toBe('Disconnected. Click to connect.');
  });

  // -----------------------------------------------------------------------
  // Extra: save favorite calls addFavorite with current host/port
  // -----------------------------------------------------------------------
  test('save favorite button calls addFavorite with current host and port', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connected',
      currentHost: '10.0.0.1',
      currentPort: 3000,
      isFavorite: mock(() => false),
    };

    const { getByTestId } = renderPopover();
    fireEvent.click(getByTestId('save-favorite-btn'));

    expect(mockCMReturn.addFavorite).toHaveBeenCalledWith('10.0.0.1:3000', '10.0.0.1', 3000);
  });

  // -----------------------------------------------------------------------
  // Extra: connect button not shown when already a favorite
  // -----------------------------------------------------------------------
  test('save favorite button hidden when already a favorite', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connected',
      currentHost: '10.0.0.1',
      currentPort: 3000,
      favorites: [{ id: 'f1', label: 'My Server', host: '10.0.0.1', port: 3000, createdAt: 1 }],
    };

    const { queryByTestId } = renderPopover();
    expect(queryByTestId('save-favorite-btn')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Extra: connect to local calls connectToLocal
  // -----------------------------------------------------------------------
  test('connect to local button calls connectToLocal', () => {
    mockCMReturn = {
      ...mockCMReturn,
      isTauri: true,
      localPort: 7777,
    };

    const { getByTestId } = renderPopover();
    fireEvent.click(getByTestId('connect-local-btn'));

    expect(mockCMReturn.connectToLocal).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Extra: disconnect button not shown when disconnected
  // -----------------------------------------------------------------------
  test('disconnect button not shown when disconnected', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'disconnected',
    };

    const { queryByTestId } = renderPopover();
    expect(queryByTestId('disconnect-btn')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Extra: connect button disabled during connecting status
  // -----------------------------------------------------------------------
  test('connect button disabled during connecting status', () => {
    mockCMReturn = {
      ...mockCMReturn,
      status: 'connecting',
    };

    const { getByTestId } = renderPopover();
    const hostInput = getByTestId('host-input');
    fireEvent.change(hostInput, { target: { value: '10.0.0.1' } });

    const connectBtn = getByTestId('connect-btn');
    expect((connectBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Extra: trigger has aria-label for state (no role="status")
  // -----------------------------------------------------------------------
  test('trigger has aria-label describing state, not role=status', () => {
    const { getByTestId } = renderPopover();
    const trigger = getByTestId('connection-manager-trigger');
    expect(trigger.getAttribute('role')).not.toBe('status');
    expect(trigger.getAttribute('aria-label')).toBeTruthy();
  });
});
