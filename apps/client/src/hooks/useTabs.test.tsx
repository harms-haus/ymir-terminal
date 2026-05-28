/// <reference lib="dom" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  await GlobalRegistrator.register();
} catch {
  // Already registered
}

import { describe, test, expect } from 'bun:test';
import { renderHook, act } from '@testing-library/react';

// Import the hook under test
const { useTabs } = await import('./useTabs');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTabs', () => {
  // -----------------------------------------------------------------------
  // 1. useTabs() returns { tabs, activeTabId, createTab, closeTab, activateTab }
  // -----------------------------------------------------------------------
  test('returns tabs, activeTabId, createTab, closeTab, activateTab', () => {
    const { result } = renderHook(() => useTabs());

    expect(result.current).toHaveProperty('tabs');
    expect(result.current).toHaveProperty('activeTabId');
    expect(result.current).toHaveProperty('createTab');
    expect(result.current).toHaveProperty('closeTab');
    expect(result.current).toHaveProperty('activateTab');
    expect(typeof result.current.createTab).toBe('function');
    expect(typeof result.current.closeTab).toBe('function');
    expect(typeof result.current.activateTab).toBe('function');
  });

  // -----------------------------------------------------------------------
  // 2. createTab({ type: 'terminal', title: 'Terminal 1' }) adds a new tab
  // -----------------------------------------------------------------------
  test('createTab adds a new tab and makes it active', () => {
    const { result } = renderHook(() => useTabs());

    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();

    let tabId: string = '';
    act(() => {
      tabId = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    expect(tabId).toBeTruthy();
    expect(typeof tabId).toBe('string');
    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(tabId);
    expect(result.current.tabs[0].type).toBe('terminal');
    expect(result.current.tabs[0].title).toBe('Terminal 1');
    expect(result.current.activeTabId).toBe(tabId);
  });

  // -----------------------------------------------------------------------
  // 3. closeTab(tabId) removes a tab, activates previous tab
  // -----------------------------------------------------------------------
  test('closeTab removes the specified tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1: string, id2: string;
    act(() => {
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
      id2 = result.current.createTab({ type: 'terminal', title: 'Terminal 2' });
    });

    expect(result.current.tabs.length).toBe(2);
    expect(id1).toBeTruthy();

    // Close the first tab
    act(() => {
      result.current.closeTab(id1!);
    });

    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(id2);
  });

  // -----------------------------------------------------------------------
  // 4. activateTab(tabId) sets active tab
  // -----------------------------------------------------------------------
  test('activateTab sets the active tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1: string, id2: string;
    act(() => {
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
      id2 = result.current.createTab({ type: 'terminal', title: 'Terminal 2' });
    });

    // Tab 2 should be active (most recently created)
    expect(result.current.activeTabId).toBe(id2);

    // Activate tab 1
    act(() => {
      result.current.activateTab(id1!);
    });

    expect(result.current.activeTabId).toBe(id1);
  });

  // -----------------------------------------------------------------------
  // 5. Closing the active tab switches to the previous one
  // -----------------------------------------------------------------------
  test('closing the active tab switches to the previous tab', () => {
    const { result } = renderHook(() => useTabs());

    let id2: string, id3: string;
    act(() => {
      result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
      id2 = result.current.createTab({ type: 'terminal', title: 'Terminal 2' });
      id3 = result.current.createTab({ type: 'terminal', title: 'Terminal 3' });
    });

    // id3 is active
    expect(result.current.activeTabId).toBe(id3);

    // Close the active tab (id3), should switch to previous (id2)
    act(() => {
      result.current.closeTab(id3!);
    });

    expect(result.current.activeTabId).toBe(id2);
    expect(result.current.tabs.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 5b. Closing active tab when it's the first tab switches to next tab
  // -----------------------------------------------------------------------
  test('closing the first active tab switches to the next tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1: string, id2: string;
    act(() => {
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
      id2 = result.current.createTab({ type: 'terminal', title: 'Terminal 2' });
    });

    // Activate the first tab, then close it
    act(() => {
      result.current.activateTab(id1!);
    });
    expect(result.current.activeTabId).toBe(id1);

    act(() => {
      result.current.closeTab(id1!);
    });

    // Should switch to the remaining tab
    expect(result.current.activeTabId).toBe(id2);
    expect(result.current.tabs.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 5c. Closing the only tab sets activeTabId to null
  // -----------------------------------------------------------------------
  test('closing the only tab sets activeTabId to null', () => {
    const { result } = renderHook(() => useTabs());

    let id1: string;
    act(() => {
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    expect(result.current.activeTabId).toBe(id1);

    act(() => {
      result.current.closeTab(id1!);
    });

    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 6. Tab state persists across re-renders (useState-based)
  // -----------------------------------------------------------------------
  test('tab state persists across re-renders', () => {
    const { result, rerender } = renderHook(() => useTabs());

    let id1: string;
    act(() => {
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    // Force a re-render
    rerender();

    // State should persist
    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(id1);
    expect(result.current.activeTabId).toBe(id1);
  });

  // -----------------------------------------------------------------------
  // 7. createTab supports editor type tabs
  // -----------------------------------------------------------------------
  test('createTab supports editor type tabs with filePath', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.createTab({
        type: 'editor',
        title: 'main.ts',
        filePath: '/src/main.ts',
      });
    });

    expect(result.current.tabs[0].type).toBe('editor');
    expect(result.current.tabs[0].title).toBe('main.ts');
    expect(result.current.tabs[0].filePath).toBe('/src/main.ts');
  });

  // -----------------------------------------------------------------------
  // 8. createTab supports terminal type tabs with terminalId
  // -----------------------------------------------------------------------
  test('createTab supports terminal type tabs with terminalId', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.createTab({
        type: 'terminal',
        title: 'Terminal 1',
        terminalId: 'term-abc123',
      });
    });

    expect(result.current.tabs[0].type).toBe('terminal');
    expect(result.current.tabs[0].terminalId).toBe('term-abc123');
  });

  // -----------------------------------------------------------------------
  // 9. Closing a non-active tab does not change activeTabId
  // -----------------------------------------------------------------------
  test('closing a non-active tab does not change activeTabId', () => {
    const { result } = renderHook(() => useTabs());

    let id1: string, id3: string;
    act(() => {
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
      result.current.createTab({ type: 'terminal', title: 'Terminal 2' });
      id3 = result.current.createTab({ type: 'terminal', title: 'Terminal 3' });
    });

    // id3 is active
    expect(result.current.activeTabId).toBe(id3);

    // Close id1 (not active), activeTabId should stay the same
    act(() => {
      result.current.closeTab(id1!);
    });

    expect(result.current.activeTabId).toBe(id3);
    expect(result.current.tabs.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 10. Multiple tabs are tracked correctly
  // -----------------------------------------------------------------------
  test('multiple tabs are tracked in order', () => {
    const { result } = renderHook(() => useTabs());

    const ids: string[] = [];
    act(() => {
      ids.push(result.current.createTab({ type: 'terminal', title: 'T1' }));
      ids.push(result.current.createTab({ type: 'editor', title: 'E1', filePath: '/a.ts' }));
      ids.push(result.current.createTab({ type: 'terminal', title: 'T2' }));
    });

    expect(result.current.tabs.length).toBe(3);
    expect(result.current.tabs.map((t) => t.title)).toEqual(['T1', 'E1', 'T2']);
    expect(result.current.tabs.map((t) => t.type)).toEqual(['terminal', 'editor', 'terminal']);
    expect(result.current.activeTabId).toBe(ids[2]);
  });
});
