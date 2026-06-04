import { useCallback, type RefObject, type MutableRefObject } from 'react';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import type { WorkspaceSummary } from '@ymir/shared';
import type { TerminalPanelHandle } from './useTerminalPanel';
import type { TerminalRegistryEntry } from './useTerminalRegistry';
import type { useReorderWorkspaces } from './useWorkspaces';

interface UseTabDragDropParams {
  paneHandleRefs: MutableRefObject<Map<string, TerminalPanelHandle>>;
  bottomPanelRef: RefObject<TerminalPanelHandle | null>;
  workspacesRef: MutableRefObject<WorkspaceSummary[] | undefined>;
  reorderWorkspacesMutation: ReturnType<typeof useReorderWorkspaces>;
  terminalRegistry: TerminalRegistryEntry[];
  setTerminalRegistry: React.Dispatch<React.SetStateAction<TerminalRegistryEntry[]>>;
  activeWorkspaceId: string | null;
  bottomVisible: boolean;
  toggleBottom: () => void;
}

interface UseTabDragDropResult {
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
}

export function useTabDragDrop({
  paneHandleRefs,
  bottomPanelRef,
  workspacesRef,
  reorderWorkspacesMutation,
  terminalRegistry,
  setTerminalRegistry,
  activeWorkspaceId,
  bottomVisible,
  toggleBottom,
}: UseTabDragDropParams): UseTabDragDropResult {
  /* eslint-disable react-hooks/exhaustive-deps -- refs are stable across renders */
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const source = event.operation.source;
    const target = event.operation.target;
    if (!source?.id || !target?.id) return;

    // Only handle sortable tab drags; skip workspace/worktree reorder
    const sortable = source as typeof source & {
      type?: string;
      initialGroup?: string;
      group?: string;
    };
    if (sortable.type !== 'tab') return;

    const sourceGroup = sortable.initialGroup;
    const targetGroup = sortable.group;

    // Suppress OptimisticSortingPlugin DOM mutation for cross-pane drags
    if (sourceGroup && targetGroup && sourceGroup !== targetGroup) {
      event.preventDefault();
      return;
    }

    // Same-pane reorder — get the handle for the owning pane
    const handle =
      sourceGroup === 'bottom'
        ? bottomPanelRef.current
        : paneHandleRefs.current.get(String(sourceGroup));
    if (!handle) return;

    const paneTabs = handle.getTabs();
    const ids = paneTabs.map((t) => t.id);
    const reordered = move(ids, event);
    if (Array.isArray(reordered)) {
      const fromIndex = paneTabs.findIndex((t) => t.id === source.id);
      const toIndex = reordered.indexOf(String(source.id));
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        handle.reorderTabs(fromIndex, toIndex);
      }
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (event.canceled) return;
      const source = event.operation.source;
      const target = event.operation.target;
      if (!source?.id || !target?.id) return;

      // Workspace reorder — commit final order on drag end
      if (source.type === 'workspace') {
        const ws = workspacesRef.current;
        if (!ws) return;
        const workspaceIds = ws.map((w: { id: string }) => w.id);
        const reordered = move(workspaceIds, event);
        if (Array.isArray(reordered)) {
          reorderWorkspacesMutation.mutate({ workspaceIds: reordered });
        }
        return;
      }

      // Only handle sortable tab drags for cross-pane transfers
      const sortable = source as typeof source & {
        type?: string;
        initialGroup?: string;
        group?: string;
      };
      if (sortable.type !== 'tab') return;

      const initialGroup = sortable.initialGroup;
      const currentGroup = sortable.group;

      // Same pane — nothing to transfer
      if (initialGroup === currentGroup) return;

      // Only allow drag within the active workspace
      const sourceEntry = terminalRegistry.find((t) => t.tabId === String(source.id));
      if (!sourceEntry || sourceEntry.workspaceId !== activeWorkspaceId) return;

      // Determine source and target pane handles
      const sourceHandle =
        initialGroup === 'bottom'
          ? bottomPanelRef.current
          : paneHandleRefs.current.get(String(initialGroup));
      const targetHandle =
        currentGroup === 'bottom'
          ? bottomPanelRef.current
          : paneHandleRefs.current.get(String(currentGroup));
      if (!sourceHandle || !targetHandle) return;

      // Transfer the tab: remove from source pane, add to target pane
      const removed = sourceHandle.transferTabOut(String(source.id));
      if (!removed) return;

      const newTabId = targetHandle.receiveTab(
        removed.terminalId,
        removed.title,
        removed.cwd,
        removed.customTitle,
      );

      // Auto-expand the bottom panel if the tab was dragged there while collapsed
      if (currentGroup === 'bottom' && !bottomVisible) {
        toggleBottom();
      }

      // Update terminal ownership — no unmount, just update the portal target
      const newOwningPane = currentGroup === 'bottom' ? 'bottom' : String(currentGroup);
      setTerminalRegistry((prev) =>
        prev.map((t) =>
          t.terminalId === removed.terminalId
            ? { ...t, tabId: newTabId, owningPane: newOwningPane }
            : t,
        ),
      );
    },
    [activeWorkspaceId, terminalRegistry, reorderWorkspacesMutation, bottomVisible, toggleBottom],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  return { handleDragOver, handleDragEnd };
}
