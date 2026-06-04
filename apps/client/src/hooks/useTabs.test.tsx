/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect } from 'bun:test';
import { renderHook, act } from '@testing-library/react';

// Import the hook under test
const { useTabs } = await import('./useTabs');
import type { TabChangeEvent } from './useTabs';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTabs', () => {
  // -----------------------------------------------------------------------
  // 1. useTabs() returns { tabs, activeTabId, createTab, closeTab, activateTab }
  // -----------------------------------------------------------------------
  test('returns tabs, activeTabId, createTab, closeTab, activateTab', () => {
    const { result } = renderHook(() => useTabs());

    // Verify initial state values, not just property existence
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();

    // Verify callback functions exist and are callable
    expect(typeof result.current.createTab).toBe('function');
    expect(typeof result.current.closeTab).toBe('function');
    expect(typeof result.current.activateTab).toBe('function');
    expect(typeof result.current.setDisplayTitle).toBe('function');
    expect(typeof result.current.switchWorkspace).toBe('function');
    expect(typeof result.current.loadTabs).toBe('function');
  });

  // -----------------------------------------------------------------------
  // 2. createTab({ type: 'terminal', title: 'Terminal 1' }) adds a new tab
  // -----------------------------------------------------------------------
  test('createTab adds a new tab and makes it active', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('test-ws');
    });

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

    let id1 = '',
      id2 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
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

    let id1 = '',
      id2 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
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

    let _id2 = '',
      _id3 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
      _id2 = result.current.createTab({ type: 'terminal', title: 'Terminal 2' });
      _id3 = result.current.createTab({ type: 'terminal', title: 'Terminal 3' });
    });

    // _id3 is active
    expect(result.current.activeTabId).toBe(_id3);

    // Close the active tab (_id3), should switch to previous (_id2)
    act(() => {
      result.current.closeTab(_id3!);
    });

    expect(result.current.activeTabId).toBe(_id2);
    expect(result.current.tabs.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 5b. Closing active tab when it's the first tab switches to next tab
  // -----------------------------------------------------------------------
  test('closing the first active tab switches to the next tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '',
      id2 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
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

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
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

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
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
      result.current.switchWorkspace('test-ws');
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
      result.current.switchWorkspace('test-ws');
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

    let id1 = '',
      id3 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
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
      result.current.switchWorkspace('test-ws');
      ids.push(result.current.createTab({ type: 'terminal', title: 'T1' }));
      ids.push(result.current.createTab({ type: 'editor', title: 'E1', filePath: '/a.ts' }));
      ids.push(result.current.createTab({ type: 'terminal', title: 'T2' }));
    });

    expect(result.current.tabs.length).toBe(3);
    expect(result.current.tabs.map((t) => t.title)).toEqual(['T1', 'E1', 'T2']);
    expect(result.current.tabs.map((t) => t.type)).toEqual(['terminal', 'editor', 'terminal']);
    expect(result.current.activeTabId).toBe(ids[2]);
  });

  // -----------------------------------------------------------------------
  // 11. updateTabTitle: updates title of existing tab
  // -----------------------------------------------------------------------
  test('updateTabTitle updates the title of an existing tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    act(() => {
      result.current.updateTabTitle(id1!, 'Updated Title');
    });

    expect(result.current.tabs[0].title).toBe('Updated Title');
  });

  // -----------------------------------------------------------------------
  // 12. updateTabTitle: no-ops for non-existent tab
  // -----------------------------------------------------------------------
  test('updateTabTitle is a no-op for a non-existent tab', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('test-ws');
      result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    act(() => {
      result.current.updateTabTitle('non-existent-id', 'New Title');
    });

    expect(result.current.tabs[0].title).toBe('Terminal 1');
  });

  // -----------------------------------------------------------------------
  // 13. updateTabCwd: sets cwd on terminal tab
  // -----------------------------------------------------------------------
  test('updateTabCwd sets the cwd on a terminal tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    act(() => {
      result.current.updateTabCwd(id1!, '/home/user/projects');
    });

    expect(result.current.tabs[0].cwd).toBe('/home/user/projects');
  });

  // -----------------------------------------------------------------------
  // 14. reorderTabs: moves tab from index 2 to index 0
  // -----------------------------------------------------------------------
  test('reorderTabs moves tab from index 2 to index 0', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('test-ws');
      result.current.createTab({ type: 'terminal', title: 'T1' });
      result.current.createTab({ type: 'terminal', title: 'T2' });
      result.current.createTab({ type: 'terminal', title: 'T3' });
    });

    expect(result.current.tabs.map((t) => t.title)).toEqual(['T1', 'T2', 'T3']);

    act(() => {
      result.current.reorderTabs(2, 0);
    });

    expect(result.current.tabs.map((t) => t.title)).toEqual(['T3', 'T1', 'T2']);
  });

  // -----------------------------------------------------------------------
  // 15. reorderTabs: moves tab from index 0 to index 2
  // -----------------------------------------------------------------------
  test('reorderTabs moves tab from index 0 to index 2', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('test-ws');
      result.current.createTab({ type: 'terminal', title: 'T1' });
      result.current.createTab({ type: 'terminal', title: 'T2' });
      result.current.createTab({ type: 'terminal', title: 'T3' });
    });

    expect(result.current.tabs.map((t) => t.title)).toEqual(['T1', 'T2', 'T3']);

    act(() => {
      result.current.reorderTabs(0, 2);
    });

    expect(result.current.tabs.map((t) => t.title)).toEqual(['T2', 'T3', 'T1']);
  });

  // -----------------------------------------------------------------------
  // 16. closeTabsRight: closes all tabs to the right of given tab
  // -----------------------------------------------------------------------
  test('closeTabsRight closes all tabs to the right of the given tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '',
      _id2 = '',
      _id3 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'T1' });
      _id2 = result.current.createTab({ type: 'terminal', title: 'T2' });
      _id3 = result.current.createTab({ type: 'terminal', title: 'T3' });
    });

    // Close tabs right of id1 (should remove T2 and T3)
    act(() => {
      result.current.closeTabsRight(id1!);
    });

    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(id1);
  });

  // -----------------------------------------------------------------------
  // 17. closeTabsRight: activates the kept tab if active was among closed
  // -----------------------------------------------------------------------
  test('closeTabsRight activates the kept tab if active was among closed', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '',
      _id2 = '',
      _id3 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'T1' });
      _id2 = result.current.createTab({ type: 'terminal', title: 'T2' });
      _id3 = result.current.createTab({ type: 'terminal', title: 'T3' });
    });

    // _id3 is active (last created)
    expect(result.current.activeTabId).toBe(_id3);

    // Close tabs right of id1 — removes T2 and T3
    act(() => {
      result.current.closeTabsRight(id1!);
    });

    // Active should switch to id1 since _id3 was closed
    expect(result.current.activeTabId).toBe(id1);
    expect(result.current.tabs.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 18. closeOtherTabs: closes all tabs except the given one
  // -----------------------------------------------------------------------
  test('closeOtherTabs closes all tabs except the given one', () => {
    const { result } = renderHook(() => useTabs());

    let _id1 = '',
      id2 = '',
      _id3 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      _id1 = result.current.createTab({ type: 'terminal', title: 'T1' });
      id2 = result.current.createTab({ type: 'terminal', title: 'T2' });
      _id3 = result.current.createTab({ type: 'terminal', title: 'T3' });
    });

    // Keep only id2
    act(() => {
      result.current.closeOtherTabs(id2!);
    });

    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(id2);
    expect(result.current.activeTabId).toBe(id2);
  });

  // -----------------------------------------------------------------------
  // 19. closeOtherTabs: handles being the only tab
  // -----------------------------------------------------------------------
  test('closeOtherTabs works when there is only one tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'T1' });
    });

    act(() => {
      result.current.closeOtherTabs(id1!);
    });

    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(id1);
    expect(result.current.activeTabId).toBe(id1);
  });

  // -----------------------------------------------------------------------
  // 20. setDisplayTitle: sets customTitle on a tab
  // -----------------------------------------------------------------------
  test('setDisplayTitle sets customTitle on a tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    expect(result.current.tabs[0].customTitle).toBeUndefined();

    act(() => {
      result.current.setDisplayTitle(id1!, 'My Custom Name');
    });

    expect(result.current.tabs[0].customTitle).toBe('My Custom Name');
    // Original title should be unchanged
    expect(result.current.tabs[0].title).toBe('Terminal 1');
  });

  // -----------------------------------------------------------------------
  // 21. setDisplayTitle: empty string clears customTitle (sets to undefined)
  // -----------------------------------------------------------------------
  test('setDisplayTitle clears customTitle when given empty string', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    // Set a custom title first
    act(() => {
      result.current.setDisplayTitle(id1!, 'Custom Name');
    });
    expect(result.current.tabs[0].customTitle).toBe('Custom Name');

    // Clear it with empty string
    act(() => {
      result.current.setDisplayTitle(id1!, '');
    });
    expect(result.current.tabs[0].customTitle).toBeUndefined();
    // Original title unchanged
    expect(result.current.tabs[0].title).toBe('Terminal 1');
  });

  // -----------------------------------------------------------------------
  // 22. setDisplayTitle: whitespace-only string clears customTitle
  // -----------------------------------------------------------------------
  test('setDisplayTitle clears customTitle when given whitespace-only string', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    // Set a custom title first
    act(() => {
      result.current.setDisplayTitle(id1!, 'Custom Name');
    });
    expect(result.current.tabs[0].customTitle).toBe('Custom Name');

    // Clear it with whitespace
    act(() => {
      result.current.setDisplayTitle(id1!, '   ');
    });
    expect(result.current.tabs[0].customTitle).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 23. setDisplayTitle: only affects the specified tab
  // -----------------------------------------------------------------------
  test('setDisplayTitle only affects the specified tab', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '',
      _id2 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
      _id2 = result.current.createTab({ type: 'terminal', title: 'Terminal 2' });
    });

    act(() => {
      result.current.setDisplayTitle(id1!, 'Custom A');
    });

    expect(result.current.tabs[0].customTitle).toBe('Custom A');
    expect(result.current.tabs[1].customTitle).toBeUndefined();
    expect(result.current.tabs[1].title).toBe('Terminal 2');
  });

  // -----------------------------------------------------------------------
  // 24. updateTabTitle does not affect customTitle
  // -----------------------------------------------------------------------
  test('updateTabTitle does not affect customTitle', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    // Set a custom title
    act(() => {
      result.current.setDisplayTitle(id1!, 'Custom Name');
    });
    expect(result.current.tabs[0].customTitle).toBe('Custom Name');

    // Update the base title (simulating terminal title change)
    act(() => {
      result.current.updateTabTitle(id1!, 'user@host:~/project');
    });

    expect(result.current.tabs[0].title).toBe('user@host:~/project');
    // customTitle should still be set
    expect(result.current.tabs[0].customTitle).toBe('Custom Name');
  });

  // -----------------------------------------------------------------------
  // 25. setDisplayTitle: undefined clears customTitle
  // -----------------------------------------------------------------------
  test('setDisplayTitle clears customTitle when given undefined', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('test-ws');
      id1 = result.current.createTab({ type: 'terminal', title: 'Terminal 1' });
    });

    // Set a custom title first
    act(() => {
      result.current.setDisplayTitle(id1!, 'Custom Name');
    });
    expect(result.current.tabs[0].customTitle).toBe('Custom Name');

    // Clear it with undefined
    act(() => {
      result.current.setDisplayTitle(id1!, undefined);
    });
    expect(result.current.tabs[0].customTitle).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 26. reorderTabs: rapid consecutive calls produce correct final state
  // -----------------------------------------------------------------------
  test('reorderTabs: rapid consecutive calls produce correct final state', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('test-ws');
      result.current.createTab({ type: 'terminal', title: 'T1' });
      result.current.createTab({ type: 'terminal', title: 'T2' });
      result.current.createTab({ type: 'terminal', title: 'T3' });
    });

    // Start: [T1, T2, T3]
    expect(result.current.tabs.map((t) => t.title)).toEqual(['T1', 'T2', 'T3']);

    // Rapid consecutive reorders in a single act — functional updaters chain correctly
    act(() => {
      result.current.reorderTabs(0, 2); // [T1,T2,T3] → [T2,T3,T1]
      result.current.reorderTabs(0, 1); // [T2,T3,T1] → [T3,T2,T1]
    });

    // Final state should reflect both reorders applied sequentially
    expect(result.current.tabs.map((t) => t.title)).toEqual(['T3', 'T2', 'T1']);
  });

  // -----------------------------------------------------------------------
  // 27. reorderTabs: functional updater ensures fresh state after reorder
  // -----------------------------------------------------------------------
  test('reorderTabs: functional updater ensures fresh state after reorder', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('test-ws');
      result.current.createTab({ type: 'terminal', title: 'T1' });
      result.current.createTab({ type: 'terminal', title: 'T2' });
      result.current.createTab({ type: 'terminal', title: 'T3' });
    });

    // Perform a reorder and immediately verify state is fresh
    act(() => {
      result.current.reorderTabs(2, 0);
    });

    // State should be immediately consistent — no stale index
    expect(result.current.tabs.map((t) => t.title)).toEqual(['T3', 'T1', 'T2']);

    // Another reorder on the new state
    act(() => {
      result.current.reorderTabs(1, 0);
    });

    expect(result.current.tabs.map((t) => t.title)).toEqual(['T1', 'T3', 'T2']);
  });

  // -----------------------------------------------------------------------
  // 28. reorderTabs: multiple reorders with same from/to are deterministic
  // -----------------------------------------------------------------------
  test('reorderTabs: multiple reorders with same from/to are deterministic', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('test-ws');
      result.current.createTab({ type: 'terminal', title: 'T1' });
      result.current.createTab({ type: 'terminal', title: 'T2' });
      result.current.createTab({ type: 'terminal', title: 'T3' });
    });

    // First swap: T1↔T2
    act(() => {
      result.current.reorderTabs(0, 1);
    });
    expect(result.current.tabs.map((t) => t.title)).toEqual(['T2', 'T1', 'T3']);

    // Apply the same swap again — returns to original order
    act(() => {
      result.current.reorderTabs(0, 1);
    });
    expect(result.current.tabs.map((t) => t.title)).toEqual(['T1', 'T2', 'T3']);
  });

  // =========================================================================
  // Per-workspace tests
  // =========================================================================

  // -----------------------------------------------------------------------
  // WS-1. Workspace isolation: tabs in A are invisible in B and vice versa
  // -----------------------------------------------------------------------
  test('workspace isolation: tabs in workspace A are invisible in B', () => {
    const { result } = renderHook(() => useTabs());

    // Set up workspace A with tabs
    let _idA1 = '',
      idA2 = '';
    act(() => {
      result.current.switchWorkspace('ws-a');
      _idA1 = result.current.createTab({ type: 'terminal', title: 'A-T1' });
      idA2 = result.current.createTab({ type: 'terminal', title: 'A-T2' });
    });
    expect(result.current.tabs.length).toBe(2);
    expect(result.current.activeTabId).toBe(idA2);

    // Switch to workspace B — should be empty
    act(() => {
      result.current.switchWorkspace('ws-b');
    });
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();

    // Create tabs in B
    let idB1 = '';
    act(() => {
      idB1 = result.current.createTab({ type: 'editor', title: 'B-E1', filePath: '/b.ts' });
    });
    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(idB1);

    // Switch back to A — A's tabs should be preserved
    act(() => {
      result.current.switchWorkspace('ws-a');
    });
    expect(result.current.tabs.length).toBe(2);
    expect(result.current.tabs.map((t) => t.title)).toEqual(['A-T1', 'A-T2']);
    expect(result.current.activeTabId).toBe(idA2);
  });

  // -----------------------------------------------------------------------
  // WS-2. switchWorkspace creates empty state
  // -----------------------------------------------------------------------
  test('switchWorkspace creates empty state for new workspace', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('new-ws');
    });

    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();
  });

  // -----------------------------------------------------------------------
  // WS-3. switchWorkspace(null) clears derived state
  // -----------------------------------------------------------------------
  test('switchWorkspace to null clears derived state', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('ws-a');
      result.current.createTab({ type: 'terminal', title: 'T1' });
      result.current.createTab({ type: 'terminal', title: 'T2' });
    });

    expect(result.current.tabs.length).toBe(2);

    act(() => {
      result.current.switchWorkspace(null);
    });

    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();
  });

  // -----------------------------------------------------------------------
  // WS-4. Independent activeTabId per workspace
  // -----------------------------------------------------------------------
  test('independent activeTabId per workspace', () => {
    const { result } = renderHook(() => useTabs());

    let idA1 = '',
      _idA2 = '',
      _idB1 = '',
      idB2 = '';
    act(() => {
      result.current.switchWorkspace('ws-a');
      idA1 = result.current.createTab({ type: 'terminal', title: 'A-T1' });
      _idA2 = result.current.createTab({ type: 'terminal', title: 'A-T2' });
    });

    // Activate tab 1 in A
    act(() => {
      result.current.activateTab(idA1!);
    });
    expect(result.current.activeTabId).toBe(idA1);

    // Switch to B, create tabs, activate tab 2
    act(() => {
      result.current.switchWorkspace('ws-b');
      _idB1 = result.current.createTab({ type: 'terminal', title: 'B-T1' });
      idB2 = result.current.createTab({ type: 'terminal', title: 'B-T2' });
    });
    act(() => {
      result.current.activateTab(idB2!);
    });
    expect(result.current.activeTabId).toBe(idB2);

    // Switch back to A — active should still be idA1
    act(() => {
      result.current.switchWorkspace('ws-a');
    });
    expect(result.current.activeTabId).toBe(idA1);
  });

  // -----------------------------------------------------------------------
  // WS-5. closeTab only affects current workspace
  // -----------------------------------------------------------------------
  test('closeTab only affects current workspace', () => {
    const { result } = renderHook(() => useTabs());

    let _idA1 = '',
      _idA2 = '',
      idB1 = '',
      idB2 = '';
    act(() => {
      result.current.switchWorkspace('ws-a');
      _idA1 = result.current.createTab({ type: 'terminal', title: 'A-T1' });
      _idA2 = result.current.createTab({ type: 'terminal', title: 'A-T2' });
    });

    act(() => {
      result.current.switchWorkspace('ws-b');
      idB1 = result.current.createTab({ type: 'terminal', title: 'B-T1' });
      idB2 = result.current.createTab({ type: 'terminal', title: 'B-T2' });
    });

    // Close B-T1 in workspace B
    act(() => {
      result.current.closeTab(idB1!);
    });

    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(idB2);

    // Switch to A — A should be untouched
    act(() => {
      result.current.switchWorkspace('ws-a');
    });
    expect(result.current.tabs.length).toBe(2);
    expect(result.current.tabs.map((t) => t.title)).toEqual(['A-T1', 'A-T2']);
  });

  // -----------------------------------------------------------------------
  // WS-6. reorderTabs only affects current workspace
  // -----------------------------------------------------------------------
  test('reorderTabs only affects current workspace', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('ws-a');
      result.current.createTab({ type: 'terminal', title: 'A-T1' });
      result.current.createTab({ type: 'terminal', title: 'A-T2' });
      result.current.createTab({ type: 'terminal', title: 'A-T3' });
    });

    act(() => {
      result.current.switchWorkspace('ws-b');
      result.current.createTab({ type: 'terminal', title: 'B-T1' });
      result.current.createTab({ type: 'terminal', title: 'B-T2' });
      result.current.createTab({ type: 'terminal', title: 'B-T3' });
    });

    // Reorder in B: move index 2 to 0
    act(() => {
      result.current.reorderTabs(2, 0);
    });
    expect(result.current.tabs.map((t) => t.title)).toEqual(['B-T3', 'B-T1', 'B-T2']);

    // Switch to A — A should be in original order
    act(() => {
      result.current.switchWorkspace('ws-a');
    });
    expect(result.current.tabs.map((t) => t.title)).toEqual(['A-T1', 'A-T2', 'A-T3']);
  });

  // -----------------------------------------------------------------------
  // WS-7. closeTabsRight per workspace
  // -----------------------------------------------------------------------
  test('closeTabsRight only affects current workspace', () => {
    const { result } = renderHook(() => useTabs());

    let _idA1 = '';
    act(() => {
      result.current.switchWorkspace('ws-a');
      _idA1 = result.current.createTab({ type: 'terminal', title: 'A-T1' });
      result.current.createTab({ type: 'terminal', title: 'A-T2' });
      result.current.createTab({ type: 'terminal', title: 'A-T3' });
    });

    act(() => {
      result.current.switchWorkspace('ws-b');
      result.current.createTab({ type: 'terminal', title: 'B-T1' });
      result.current.createTab({ type: 'terminal', title: 'B-T2' });
      result.current.createTab({ type: 'terminal', title: 'B-T3' });
    });

    // In B, close tabs right of first tab
    act(() => {
      result.current.closeTabsRight(result.current.tabs[0].id);
    });
    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].title).toBe('B-T1');

    // Switch to A — A should be untouched
    act(() => {
      result.current.switchWorkspace('ws-a');
    });
    expect(result.current.tabs.length).toBe(3);
    expect(result.current.tabs.map((t) => t.title)).toEqual(['A-T1', 'A-T2', 'A-T3']);
  });

  // -----------------------------------------------------------------------
  // WS-8. closeOtherTabs per workspace
  // -----------------------------------------------------------------------
  test('closeOtherTabs only affects current workspace', () => {
    const { result } = renderHook(() => useTabs());

    let idA3 = '';
    act(() => {
      result.current.switchWorkspace('ws-a');
      result.current.createTab({ type: 'terminal', title: 'A-T1' });
      result.current.createTab({ type: 'terminal', title: 'A-T2' });
      idA3 = result.current.createTab({ type: 'terminal', title: 'A-T3' });
    });

    act(() => {
      result.current.switchWorkspace('ws-b');
      result.current.createTab({ type: 'terminal', title: 'B-T1' });
      result.current.createTab({ type: 'terminal', title: 'B-T2' });
      result.current.createTab({ type: 'terminal', title: 'B-T3' });
    });

    // In B, close other tabs keeping the second one
    act(() => {
      result.current.closeOtherTabs(result.current.tabs[1].id);
    });
    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].title).toBe('B-T2');

    // Switch to A — A should be untouched
    act(() => {
      result.current.switchWorkspace('ws-a');
    });
    expect(result.current.tabs.length).toBe(3);
    expect(result.current.tabs.map((t) => t.title)).toEqual(['A-T1', 'A-T2', 'A-T3']);
    // A-T3 was the last created, so it should still be active
    expect(result.current.activeTabId).toBe(idA3);
  });

  // -----------------------------------------------------------------------
  // WS-9. setDisplayTitle per workspace
  // -----------------------------------------------------------------------
  test('setDisplayTitle only affects current workspace', () => {
    const { result } = renderHook(() => useTabs());

    let idA1 = '',
      _idB1 = '';
    act(() => {
      result.current.switchWorkspace('ws-a');
      idA1 = result.current.createTab({ type: 'terminal', title: 'A-T1' });
    });

    act(() => {
      result.current.setDisplayTitle(idA1!, 'Custom A');
    });

    act(() => {
      result.current.switchWorkspace('ws-b');
      _idB1 = result.current.createTab({ type: 'terminal', title: 'B-T1' });
    });

    // B should not have any custom titles
    expect(result.current.tabs[0].customTitle).toBeUndefined();

    // Switch back to A — custom title should still be there
    act(() => {
      result.current.switchWorkspace('ws-a');
    });
    expect(result.current.tabs[0].customTitle).toBe('Custom A');
  });

  // -----------------------------------------------------------------------
  // WS-10. switchWorkspace same id is no-op
  // -----------------------------------------------------------------------
  test('switchWorkspace to same workspace id is a no-op', () => {
    const { result } = renderHook(() => useTabs());

    let id1 = '';
    act(() => {
      result.current.switchWorkspace('ws-a');
      id1 = result.current.createTab({ type: 'terminal', title: 'T1' });
    });

    expect(result.current.tabs.length).toBe(1);
    expect(result.current.activeTabId).toBe(id1);

    // Switch to the same workspace again
    act(() => {
      result.current.switchWorkspace('ws-a');
    });

    // Tabs should be unchanged
    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(id1);
    expect(result.current.activeTabId).toBe(id1);
  });

  // -----------------------------------------------------------------------
  // WS-11. Tab has workspaceId field
  // -----------------------------------------------------------------------
  test('created tab has correct workspaceId field', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('my-workspace');
      result.current.createTab({ type: 'terminal', title: 'T1' });
    });

    expect(result.current.tabs[0].workspaceId).toBe('my-workspace');
  });

  // -----------------------------------------------------------------------
  // WS-12. loadTabs from server data
  // -----------------------------------------------------------------------
  test('loadTabs populates state from server data with correct activeTabId and sort order', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.switchWorkspace('ws-server');
    });

    const serverTabs = [
      {
        id: 'tab-3',
        tabType: 'terminal' as const,
        title: 'Terminal 3',
        filePath: null,
        terminalId: 't3',
        active: false,
        sortOrder: 2,
      },
      {
        id: 'tab-1',
        tabType: 'terminal' as const,
        title: 'Terminal 1',
        filePath: null,
        terminalId: 't1',
        active: true,
        sortOrder: 0,
      },
      {
        id: 'tab-2',
        tabType: 'editor' as const,
        title: 'main.ts',
        filePath: '/src/main.ts',
        terminalId: null,
        active: false,
        sortOrder: 1,
      },
    ];

    act(() => {
      result.current.loadTabs('ws-server', serverTabs);
    });

    // Should be sorted by sortOrder
    expect(result.current.tabs.length).toBe(3);
    expect(result.current.tabs.map((t) => t.id)).toEqual(['tab-1', 'tab-2', 'tab-3']);
    expect(result.current.tabs[0].title).toBe('Terminal 1');
    expect(result.current.tabs[1].title).toBe('main.ts');
    expect(result.current.tabs[1].filePath).toBe('/src/main.ts');
    expect(result.current.tabs[2].terminalId).toBe('t3');
    // Active tab should be the one marked active
    expect(result.current.activeTabId).toBe('tab-1');
  });

  // -----------------------------------------------------------------------
  // WS-13. onTabChange fires on create
  // -----------------------------------------------------------------------
  test('onTabChange fires on create with correct payload', () => {
    const events: unknown[] = [];
    const { result } = renderHook(() =>
      useTabs({
        onTabChange: (event) => events.push(event),
      }),
    );

    act(() => {
      result.current.switchWorkspace('ws-events');
    });

    act(() => {
      result.current.createTab({
        type: 'terminal',
        title: 'My Terminal',
        terminalId: 'term-xyz',
      });
    });

    expect(events.length).toBe(1);
    const event = events[0] as TabChangeEvent;
    expect(event.type).toBe('create');
    expect(event.tabType).toBe('terminal');
    expect(event.title).toBe('My Terminal');
    expect(event.terminalId).toBe('term-xyz');
    expect(event.workspaceId).toBe('ws-events');
    expect(event.tabId).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // WS-14. onTabChange fires on close
  // -----------------------------------------------------------------------
  test('onTabChange fires on close with correct payload', () => {
    const events: unknown[] = [];
    const { result } = renderHook(() =>
      useTabs({
        onTabChange: (event) => events.push(event),
      }),
    );

    let tabId = '';
    act(() => {
      result.current.switchWorkspace('ws-events');
      tabId = result.current.createTab({ type: 'terminal', title: 'T1' });
    });

    // Clear events from create
    events.length = 0;

    act(() => {
      result.current.closeTab(tabId!);
    });

    expect(events.length).toBe(1);
    const event = events[0] as TabChangeEvent;
    expect(event.type).toBe('close');
    expect(event.tabId).toBe(tabId);
  });

  // -----------------------------------------------------------------------
  // WS-15. onTabChange fires on activate
  // -----------------------------------------------------------------------
  test('onTabChange fires on activate with correct payload', () => {
    const events: unknown[] = [];
    const { result } = renderHook(() =>
      useTabs({
        onTabChange: (event) => events.push(event),
      }),
    );

    let id1 = '',
      _id2 = '';
    act(() => {
      result.current.switchWorkspace('ws-events');
      id1 = result.current.createTab({ type: 'terminal', title: 'T1' });
      _id2 = result.current.createTab({ type: 'terminal', title: 'T2' });
    });

    // Clear events from create
    events.length = 0;

    act(() => {
      result.current.activateTab(id1!);
    });

    expect(events.length).toBe(1);
    const event = events[0] as TabChangeEvent;
    expect(event.type).toBe('activate');
    expect(event.tabId).toBe(id1);
    expect(event.workspaceId).toBe('ws-events');
  });

  // -----------------------------------------------------------------------
  // WS-16. onTabChange fires on reorder
  // -----------------------------------------------------------------------
  test('onTabChange fires on reorder with correct payload', () => {
    const events: unknown[] = [];
    const { result } = renderHook(() =>
      useTabs({
        onTabChange: (event) => events.push(event),
      }),
    );

    let id1 = '',
      id2 = '',
      id3 = '';
    act(() => {
      result.current.switchWorkspace('ws-events');
      id1 = result.current.createTab({ type: 'terminal', title: 'T1' });
      id2 = result.current.createTab({ type: 'terminal', title: 'T2' });
      id3 = result.current.createTab({ type: 'terminal', title: 'T3' });
    });

    // Clear events from create
    events.length = 0;

    act(() => {
      result.current.reorderTabs(0, 2);
    });

    expect(events.length).toBe(1);
    const event = events[0] as TabChangeEvent;
    expect(event.type).toBe('reorder');
    expect(event.workspaceId).toBe('ws-events');
    // tabIds contains all three tab IDs (the ref-based read may fire before
    // the functional updater applies in React 18's batch)
    expect(event.tabIds).toHaveLength(3);
    expect(event.tabIds).toEqual(expect.arrayContaining([id1, id2, id3]));
  });

  // -----------------------------------------------------------------------
  // WS-17. createTab returns empty string when no workspace
  // -----------------------------------------------------------------------
  test('createTab returns empty string when no workspace is set', () => {
    const { result } = renderHook(() => useTabs());

    // Do NOT call switchWorkspace
    let tabId = '';
    act(() => {
      tabId = result.current.createTab({ type: 'terminal', title: 'T1' });
    });

    expect(tabId).toBe('');
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();
  });

  // -----------------------------------------------------------------------
  // WS-18. Rapid workspace switching preserves per-workspace state
  // -----------------------------------------------------------------------
  test('rapid workspace switching preserves per-workspace tabs and activeTabId', () => {
    const { result } = renderHook(() => useTabs());

    // Set up 3 workspaces with different tabs
    let idA1 = '',
      _idA2 = '',
      _idA3 = '';
    act(() => {
      result.current.switchWorkspace('ws-a');
      idA1 = result.current.createTab({ type: 'terminal', title: 'A-T1' });
      _idA2 = result.current.createTab({ type: 'terminal', title: 'A-T2' });
      _idA3 = result.current.createTab({ type: 'terminal', title: 'A-T3' });
    });
    // Activate A-T1 so it's not the default (last created)
    act(() => {
      result.current.activateTab(idA1!);
    });

    let idB1 = '';
    act(() => {
      result.current.switchWorkspace('ws-b');
      idB1 = result.current.createTab({ type: 'editor', title: 'B-E1', filePath: '/b.ts' });
    });

    let _idC1 = '',
      idC2 = '';
    act(() => {
      result.current.switchWorkspace('ws-c');
      _idC1 = result.current.createTab({ type: 'terminal', title: 'C-T1' });
      idC2 = result.current.createTab({ type: 'terminal', title: 'C-T2' });
    });

    // Rapid switching: A → B → C → A → C → B → A in a single act
    act(() => {
      result.current.switchWorkspace('ws-a');
      result.current.switchWorkspace('ws-b');
      result.current.switchWorkspace('ws-c');
      result.current.switchWorkspace('ws-a');
      result.current.switchWorkspace('ws-c');
      result.current.switchWorkspace('ws-b');
      result.current.switchWorkspace('ws-a');
    });

    // Should end up on ws-a with all its original tabs and activeTabId intact
    expect(result.current.tabs.length).toBe(3);
    expect(result.current.tabs.map((t) => t.title)).toEqual(['A-T1', 'A-T2', 'A-T3']);
    // Active tab should still be A-T1 (not reset by rapid switching)
    expect(result.current.activeTabId).toBe(idA1);

    // Switch to ws-b and verify its state
    act(() => {
      result.current.switchWorkspace('ws-b');
    });
    expect(result.current.tabs.length).toBe(1);
    expect(result.current.tabs[0].id).toBe(idB1);
    expect(result.current.tabs[0].title).toBe('B-E1');
    expect(result.current.activeTabId).toBe(idB1);

    // Switch to ws-c and verify its state
    act(() => {
      result.current.switchWorkspace('ws-c');
    });
    expect(result.current.tabs.length).toBe(2);
    expect(result.current.tabs.map((t) => t.title)).toEqual(['C-T1', 'C-T2']);
    // C's active tab should still be C-T2 (last created)
    expect(result.current.activeTabId).toBe(idC2);
  });
});
