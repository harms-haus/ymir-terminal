/// <reference lib="dom" />
import { setupTestDom } from '../test-helpers/mock-setup';
await setupTestDom();

import { describe, test, expect, afterAll } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { mock } from 'bun:test';
import type { TerminalPanelHandle } from './useTerminalPanel';
import { useTerminalRegistry } from './useTerminalRegistry';

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPaneHandleRefs() {
  return { current: new Map<string, TerminalPanelHandle>() };
}

function createBottomPanelRef() {
  return { current: null };
}

function makeDefaultProps(overrides?: {
  activeWorkspaceId?: string | null;
  paneHandleRefs?: ReturnType<typeof createPaneHandleRefs>;
  bottomPanelRef?: ReturnType<typeof createBottomPanelRef>;
}) {
  return {
    paneHandleRefs: overrides?.paneHandleRefs ?? createPaneHandleRefs(),
    bottomPanelRef: overrides?.bottomPanelRef ?? createBottomPanelRef(),
    activeWorkspaceId: overrides?.activeWorkspaceId ?? 'ws-1',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTerminalRegistry', () => {
  // -----------------------------------------------------------------------
  // 1. UPSERT replaces existing entry (by terminalId)
  // -----------------------------------------------------------------------
  test('UPSERT replaces existing entry with same terminalId', () => {
    const { result } = renderHook(() => useTerminalRegistry(makeDefaultProps()));

    // Register terminal t1 in pane-A
    act(() => {
      result.current.handleTerminalRegistered('t1', 'tab-1', 'pane-A', 'ws-1');
    });

    expect(result.current.terminalRegistry).toHaveLength(1);
    expect(result.current.terminalRegistry[0].owningPane).toBe('pane-A');

    // Register same terminal t1 again with pane-B
    act(() => {
      result.current.handleTerminalRegistered('t1', 'tab-1', 'pane-B', 'ws-1');
    });

    // Should still be exactly one entry, now with pane-B
    expect(result.current.terminalRegistry).toHaveLength(1);
    expect(result.current.terminalRegistry[0].owningPane).toBe('pane-B');
    expect(result.current.terminalRegistry[0].terminalId).toBe('t1');
  });

  // -----------------------------------------------------------------------
  // 2. UPSERT cleans up callbackCacheRef for old tabId
  // -----------------------------------------------------------------------
  test('UPSERT cleans up callbackCacheRef when tabId changes', () => {
    const { result } = renderHook(() => useTerminalRegistry(makeDefaultProps()));

    // Register terminal t1 with tab-1
    act(() => {
      result.current.handleTerminalRegistered('t1', 'tab-1', 'pane-A', 'ws-1');
    });

    // Trigger terminalEntries computation so callbackCacheRef gets populated for tab-1
    // (The useMemo in the hook builds entries and populates the cache)
    let entries = result.current.terminalEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0].tabId).toBe('tab-1');

    // Verify the cache has tab-1
    expect(result.current.callbackCacheRef.current.has('tab-1')).toBe(true);

    // Register same terminal t1 with a NEW tabId (tab-2)
    act(() => {
      result.current.handleTerminalRegistered('t1', 'tab-2', 'pane-A', 'ws-1');
    });

    // Re-compute terminalEntries so the cache state is observable
    entries = result.current.terminalEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0].tabId).toBe('tab-2');

    // The old tab-1 should be evicted from the callback cache
    expect(result.current.callbackCacheRef.current.has('tab-1')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 3. New terminal appends (no regression for distinct terminals)
  // -----------------------------------------------------------------------
  test('registering distinct terminals appends both entries', () => {
    const { result } = renderHook(() => useTerminalRegistry(makeDefaultProps()));

    act(() => {
      result.current.handleTerminalRegistered('t1', 'tab-1', 'pane-A', 'ws-1');
    });

    act(() => {
      result.current.handleTerminalRegistered('t2', 'tab-2', 'pane-B', 'ws-1');
    });

    expect(result.current.terminalRegistry).toHaveLength(2);

    const ids = result.current.terminalRegistry.map((e) => e.terminalId);
    expect(ids).toContain('t1');
    expect(ids).toContain('t2');
  });

  // -----------------------------------------------------------------------
  // 4. terminalEntries dedup is a safety net
  // -----------------------------------------------------------------------
  test('terminalEntries deduplicates by terminalId even with manual duplicates', () => {
    const { result } = renderHook(() => useTerminalRegistry(makeDefaultProps()));

    // Manually inject duplicate entries via setTerminalRegistry
    act(() => {
      result.current.setTerminalRegistry([
        {
          terminalId: 't1',
          tabId: 'tab-a',
          owningPane: 'pane-A',
          workspaceId: 'ws-1',
        },
        {
          terminalId: 't1',
          tabId: 'tab-b',
          owningPane: 'pane-B',
          workspaceId: 'ws-1',
        },
        {
          terminalId: 't2',
          tabId: 'tab-c',
          owningPane: 'pane-A',
          workspaceId: 'ws-1',
        },
      ]);
    });

    const entries = result.current.terminalEntries;

    // Should deduplicate: two unique terminals (t1 and t2), first occurrence wins
    expect(entries).toHaveLength(2);
    expect(entries[0].terminalId).toBe('t1');
    expect(entries[0].tabId).toBe('tab-a'); // first duplicate kept
    expect(entries[1].terminalId).toBe('t2');
    expect(entries[1].tabId).toBe('tab-c');
  });

  // -----------------------------------------------------------------------
  // 5. handleTerminalUnregistered still works after UPSERT lifecycle
  // -----------------------------------------------------------------------
  test('handleTerminalUnregistered removes entry and cleans callbackCacheRef', () => {
    const { result } = renderHook(() => useTerminalRegistry(makeDefaultProps()));

    // Register terminal
    act(() => {
      result.current.handleTerminalRegistered('t1', 'tab-1', 'pane-A', 'ws-1');
    });

    // Force terminalEntries computation to populate the cache
    const entries = result.current.terminalEntries;
    expect(entries).toHaveLength(1);
    expect(result.current.callbackCacheRef.current.has('tab-1')).toBe(true);

    // Unregister
    act(() => {
      result.current.handleTerminalUnregistered('t1');
    });

    // Entry removed from registry
    expect(result.current.terminalRegistry).toHaveLength(0);
    expect(result.current.terminalEntries).toHaveLength(0);

    // Cache cleaned up
    expect(result.current.callbackCacheRef.current.has('tab-1')).toBe(false);
  });
});
