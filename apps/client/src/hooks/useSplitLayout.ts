import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { sendRequest } from '../lib/send-request';
import {
  createDefaultLayout,
  collectPaneIds,
  splitPane as splitPaneTree,
  removePane as removePaneTree,
  serializeLayout,
  deserializeLayout,
} from '../lib/pane-tree';
import type { LayoutNode, SplitDirection } from '../lib/pane-tree';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSplitLayoutResult {
  layout: LayoutNode;
  paneIds: string[];
  splitPane: (paneId: string, direction: SplitDirection) => void;
  removePane: (paneId: string) => string[] | null;
  setLayout: (layout: LayoutNode) => void;
  loadLayout: (workspaceId: string | null) => Promise<void>;
  focusedPaneId: string | null;
  setFocusedPaneId: (paneId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSplitLayout(workspaceId: string | null): UseSplitLayoutResult {
  const [layout, setLayoutState] = useState<LayoutNode>(createDefaultLayout);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);

  // Refs for stale-closure-safe reads inside callbacks and timers
  const workspaceIdRef = useRef<string | null>(workspaceId);
  const layoutRef = useRef<LayoutNode>(layout);
  const focusedPaneIdRef = useRef<string | null>(focusedPaneId);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    focusedPaneIdRef.current = focusedPaneId;
  }, [focusedPaneId]);

  // Debounce timer ref for persistence
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived pane IDs
  const paneIds = useMemo(() => collectPaneIds(layout), [layout]);

  // ---------------------------------------------------------------------------
  // Debounced persistence
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (workspaceId == null) return;

    if (saveTimerRef.current != null) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      sendRequest('config.set', {
        key: `pane_layout_${workspaceIdRef.current}`,
        value: serializeLayout(layoutRef.current),
      }).catch(() => {
        // Silently ignore save failures
      });
    }, 300);

    return () => {
      if (saveTimerRef.current != null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [layout, workspaceId]);

  // ---------------------------------------------------------------------------
  // splitPane
  // ---------------------------------------------------------------------------
  const splitPane = useCallback((paneId: string, direction: SplitDirection) => {
    const currentLayout = layoutRef.current;
    const newLayout = splitPaneTree(currentLayout, paneId, direction);

    // replaceNode returns the same reference when paneId is not found
    if (newLayout === currentLayout) return;

    // Auto-focus the new empty pane (second child of the new SplitNode)
    const oldIds = new Set(collectPaneIds(currentLayout));
    const newPaneIds = collectPaneIds(newLayout);
    const newPaneId = newPaneIds.find((id) => !oldIds.has(id));
    if (newPaneId) {
      setFocusedPaneId(newPaneId);
    }

    setLayoutState(newLayout);
  }, []);

  // ---------------------------------------------------------------------------
  // removePane
  // ---------------------------------------------------------------------------
  const removePane = useCallback((paneId: string): string[] | null => {
    const currentLayout = layoutRef.current;
    const result = removePaneTree(currentLayout, paneId);
    if (!result) return null;

    // Only re-focus if the removed pane was the focused pane
    const survivingPaneIds = collectPaneIds(result.layout);
    const wasFocused =
      focusedPaneIdRef.current !== null &&
      result.removedPanes.includes(focusedPaneIdRef.current);
    if (wasFocused && survivingPaneIds.length > 0) {
      setFocusedPaneId(survivingPaneIds[0]);
    }

    setLayoutState(result.layout);
    return result.removedPanes;
  }, []);

  // ---------------------------------------------------------------------------
  // setLayout
  // ---------------------------------------------------------------------------
  const setLayout = useCallback((newLayout: LayoutNode) => {
    setLayoutState(newLayout);
  }, []);

  // ---------------------------------------------------------------------------
  // loadLayout
  // ---------------------------------------------------------------------------
  const loadLayout = useCallback(async (wsId: string | null) => {
    if (wsId == null) {
      const defaultLayout = createDefaultLayout();
      setLayoutState(defaultLayout);
      setFocusedPaneId(collectPaneIds(defaultLayout)[0] ?? null);
      return;
    }

    try {
      const res = await sendRequest<{ key: string; value: string | null }>('config.get', {
        key: `pane_layout_${wsId}`,
      });

      if (res.value != null) {
        const deserialized = deserializeLayout(res.value);
        if (deserialized) {
          setLayoutState(deserialized);
          setFocusedPaneId(collectPaneIds(deserialized)[0] ?? null);
          return;
        }
      }
    } catch {
      // Network or other error — fall through to default
    }

    const defaultLayout = createDefaultLayout();
    setLayoutState(defaultLayout);
    setFocusedPaneId(collectPaneIds(defaultLayout)[0] ?? null);
  }, []);

  return {
    layout,
    paneIds,
    splitPane,
    removePane,
    setLayout,
    loadLayout,
    focusedPaneId,
    setFocusedPaneId,
  };
}
