import { useCallback, useRef, useLayoutEffect, type RefObject, type MutableRefObject } from 'react';
import type { TerminalPanelHandle } from './useTerminalPanel';
import type { TerminalRegistryEntry } from './useTerminalRegistry';
import type { LayoutNode } from '../lib/pane-tree';
import { collectPaneIds } from '../lib/pane-tree';
import { sendRequest } from '../lib/send-request';

interface UsePaneCallbacksParams {
  layout: LayoutNode;
  splitPane: (paneId: string, direction: 'horizontal' | 'vertical') => void;
  removePane: (paneId: string) => string[] | null;
  paneHandleRefs: MutableRefObject<Map<string, TerminalPanelHandle>>;
  bottomPanelRef: RefObject<TerminalPanelHandle | null>;
  setTerminalRegistry: React.Dispatch<React.SetStateAction<TerminalRegistryEntry[]>>;
  callbackCacheRef: MutableRefObject<
    Map<string, { onTitleChange: (title: string) => void; onCwdChange: (cwd: string) => void }>
  >;
  handleTerminalUnregistered: (terminalId: string) => void;
  bottomVisible: boolean;
  toggleBottom: () => void;
}

interface UsePaneCallbacksResult {
  handleSplitRight: (paneId: string, tabId?: string) => void;
  handleSplitDown: (paneId: string, tabId?: string) => void;
  handleClosePane: (paneId: string) => void;
  handleMoveToPane: (tabId: string, sourcePane: 'content' | 'bottom') => void;
}

/**
 * Pane management callbacks: split, close, and move tabs between panes.
 */
export function usePaneCallbacks({
  layout,
  splitPane,
  removePane,
  paneHandleRefs,
  bottomPanelRef,
  setTerminalRegistry,
  callbackCacheRef,
  handleTerminalUnregistered,
  bottomVisible,
  toggleBottom,
}: UsePaneCallbacksParams): UsePaneCallbacksResult {
  // Ref to read the latest layout in requestAnimationFrame callbacks without stale closures
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  /* eslint-disable react-hooks/exhaustive-deps -- refs and stable setters are captured correctly */
  const handleSplitPane = useCallback(
    (paneId: string, direction: 'horizontal' | 'vertical', tabId?: string) => {
      const oldPaneIds = collectPaneIds(layout);
      splitPane(paneId, direction);
      // After splitPane updates layout state, find the new pane in the next render
      if (tabId) {
        // Move the specified tab to the new pane after mount
        requestAnimationFrame(() => {
          const newLayout = layoutRef.current;
          const newPaneIds = collectPaneIds(newLayout);
          const newPaneId = newPaneIds.find((id) => !oldPaneIds.includes(id));
          if (!newPaneId) return;

          const sourceHandle = paneHandleRefs.current.get(paneId);
          const newHandle = paneHandleRefs.current.get(newPaneId);
          if (!sourceHandle || !newHandle) return;

          const removed = sourceHandle.transferTabOut(tabId);
          if (!removed) return;

          const newTabId = newHandle.receiveTab(
            removed.terminalId,
            removed.title,
            removed.cwd,
            removed.customTitle,
          );

          setTerminalRegistry((prev) =>
            prev.map((t) =>
              t.tabId === tabId ? { ...t, tabId: newTabId, owningPane: newPaneId } : t,
            ),
          );
          callbackCacheRef.current.delete(tabId);
        });
      }
    },
    [layout, splitPane],
  );

  const handleSplitRight = useCallback(
    (paneId: string, tabId?: string) => {
      handleSplitPane(paneId, 'horizontal', tabId);
    },
    [handleSplitPane],
  );

  const handleSplitDown = useCallback(
    (paneId: string, tabId?: string) => {
      handleSplitPane(paneId, 'vertical', tabId);
    },
    [handleSplitPane],
  );

  const handleClosePane = useCallback(
    (paneId: string) => {
      const currentPaneIds = collectPaneIds(layout);
      if (currentPaneIds.length <= 1) return; // Can't close the last pane

      const handle = paneHandleRefs.current.get(paneId);
      if (handle) {
        const tabs = handle.getTabs();
        for (const tab of tabs) {
          if (tab.terminalId) {
            sendRequest('terminal.close', { terminalId: tab.terminalId }).catch(() => {});
            handleTerminalUnregistered(tab.terminalId);
          }
        }
      }

      const removedIds = removePane(paneId);
      if (removedIds) {
        // Clean up callback cache for any removed tab IDs
        const removedSet = new Set(removedIds);
        setTerminalRegistry((prev) => prev.filter((t) => !removedSet.has(t.owningPane)));
      }
    },
    [layout, removePane, handleTerminalUnregistered],
  );

  const handleMoveToPane = useCallback(
    (tabId: string, sourcePane: 'content' | 'bottom') => {
      // Find the first split pane handle for content moves, or use bottom panel ref
      const sourceRef =
        sourcePane === 'content'
          ? { current: paneHandleRefs.current.values().next().value ?? null }
          : bottomPanelRef;
      const targetRef =
        sourcePane === 'content'
          ? bottomPanelRef
          : { current: paneHandleRefs.current.values().next().value ?? null };
      const targetGroup = sourcePane === 'content' ? 'bottom' : 'content';

      // Auto-expand the bottom panel when moving a tab there while it is collapsed
      if (targetGroup === 'bottom' && !bottomVisible) {
        toggleBottom();
      }

      const removed = sourceRef.current?.transferTabOut(tabId);
      if (!removed) return;
      const newTabId = targetRef.current?.receiveTab(
        removed.terminalId,
        removed.title,
        removed.cwd,
        removed.customTitle,
      );
      if (!newTabId) return;
      setTerminalRegistry((prev) =>
        prev.map((t) =>
          t.tabId === tabId
            ? { ...t, tabId: newTabId, owningPane: targetGroup as 'content' | 'bottom' }
            : t,
        ),
      );
      callbackCacheRef.current.delete(tabId);
    },
    [bottomVisible, toggleBottom],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  return { handleSplitRight, handleSplitDown, handleClosePane, handleMoveToPane };
}
