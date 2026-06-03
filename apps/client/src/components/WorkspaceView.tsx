import { useState, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from './AppLayout';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { RightSidebar } from './RightSidebar';
import { SplitPaneLayout } from './SplitPaneLayout';
import type { TerminalPanelHandle } from '../hooks/useTerminalPanel';
import { BottomPanel } from './BottomPanel';
import { TerminalManager } from './TerminalManager';
import { TopBar } from './TopBar';
import { CommandBar } from './CommandBar';
import { ToastProvider } from './ToastProvider';
import { DialogProvider } from './DialogProvider';
import { PaneVisibilityProvider, usePaneVisibility } from '../hooks/usePaneVisibility';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { useTheme } from '../hooks/useTheme';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';
import { CreateWorktreeDialog } from './CreateWorktreeDialog';
import { DragDropProvider, type DragEndEvent, type DragOverEvent } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import { FileClipboardProvider } from '../contexts/FileClipboardContext';
import { usePaneBounds } from '../hooks/usePaneBounds';
import { useTerminalRegistry } from '../hooks/useTerminalRegistry';
import { useWorkspaceSelection } from '../hooks/useWorkspaceSelection';
import { useSplitLayout } from '../hooks/useSplitLayout';
import { collectPaneIds } from '../lib/pane-tree';
import { sendRequest } from '../lib/send-request';
import type { PersistedTabInfo, TabRestoreResponse } from '@ymir/shared';

function WorkspaceViewInner() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fileToOpen, setFileToOpen] = useState<string | null>(null);
  const [fileToDiff, setFileToDiff] = useState<{
    filePath: string;
    repoPath: string;
    staged: boolean;
  } | null>(null);
  const [commitToHighlight, setCommitToHighlight] = useState<{
    commitSha?: string;
    repoPath: string;
  } | null>(null);

  const { setAccentColor } = useTheme();

  const {
    activeWorkspaceId,
    activeWorkspace,
    effectiveCwd,
    activeWorktreePath,
    workspaces,
    workspacesRef,
    worktreesByWorkspace,
    isCreateWorktreeDialogOpen,
    createWorktreeForWsId,
    reorderWorkspacesMutation,
    handleWorkspaceSelect,
    handleRenameWorkspace,
    handleSetCwdWorkspace,
    handleChangeColorWorkspace,
    handleRemoveWorkspace,
    handleWorktreeSelect,
    handleCreateWorktree,
    handleWorktreeCreated,
    handleCopyWorktreePath,
    handleRemoveWorktree,
    handleMergeWorktree,
    setIsCreateWorktreeDialogOpen,
    setCreateWorktreeForWsId,
    setSelectedWorkspaceId,
  } = useWorkspaceSelection({ setAccentColor });

  const {
    left: leftVisible,
    right: rightVisible,
    bottom: bottomVisible,
    toggleBottom,
    loading,
  } = usePaneVisibility();

  const bottomPanelRef = useRef<TerminalPanelHandle>(null);
  const paneHandleRefs = useRef<Map<string, TerminalPanelHandle>>(new Map());
  const paneContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registeredPanesRef = useRef(new Set<string>());

  const { layout, paneIds, splitPane, removePane, focusedPaneId, setFocusedPaneId, loadLayout } =
    useSplitLayout(activeWorkspaceId);

  // Ref to read the latest layout in requestAnimationFrame callbacks without stale closures
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const { wrapperRef, registerContainer, getPaneBounds, allBounds, bottomTerminalRef } =
    usePaneBounds({
      loading,
    });

  // Sync split pane container elements with usePaneBounds so TerminalManager can position terminals
  useEffect(() => {
    const currentIds = new Set(paneIds);
    // Register only new panes
    for (const [paneId, element] of paneContainerRefs.current) {
      if (!registeredPanesRef.current.has(paneId) && currentIds.has(paneId)) {
        registerContainer(paneId, element);
        registeredPanesRef.current.add(paneId);
      }
    }
    // Clean up removed panes
    for (const paneId of registeredPanesRef.current) {
      if (!currentIds.has(paneId)) {
        registeredPanesRef.current.delete(paneId);
      }
    }
  }, [paneIds, registerContainer]);

  // Load persisted layout when workspace changes
  useEffect(() => {
    loadLayout(activeWorkspaceId);
  }, [activeWorkspaceId, loadLayout]);

  // --- Restore tabs from persisted session on workspace switch ---
  const restoredWorkspacesRef = useRef(new Set<string>());

  const handleRestoreTabs = useCallback(async (workspaceId: string) => {
    if (restoredWorkspacesRef.current.has(workspaceId)) return;
    restoredWorkspacesRef.current.add(workspaceId);

    try {
      const res = await sendRequest<TabRestoreResponse>('tab.restore', { workspaceId });
      if (!res.tabs || res.tabs.length === 0) return;

      // Group tabs by pane
      const tabsByPane = new Map<string, PersistedTabInfo[]>();
      for (const tab of res.tabs) {
        const pane = tab.pane || 'content';
        if (!tabsByPane.has(pane)) tabsByPane.set(pane, []);
        tabsByPane.get(pane)!.push(tab);
      }

      // Wait a frame for pane handles to register after layout load
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      for (const [paneId, tabs] of tabsByPane) {
        const handle = paneHandleRefs.current.get(paneId);
        if (!handle) continue;

        handle.loadRestoredTabs(workspaceId, tabs);
      }
    } catch {
      // Silent fail – restoration is best-effort
    }
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) {
      handleRestoreTabs(activeWorkspaceId);
    }
  }, [activeWorkspaceId, handleRestoreTabs]);

  const {
    terminalRegistry,
    setTerminalRegistry,
    terminalRefsMap,
    callbackCacheRef,
    terminalEntries,
    setActiveTabForPane,
    handleTerminalRegistered,
    handleTerminalUnregistered,
    handleBottomTerminalRegistered,
  } = useTerminalRegistry({
    paneHandleRefs,
    bottomPanelRef,
    activeWorkspaceId,
  });

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

  const handleAddWorkspace = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const handleWorkspaceCreated = useCallback(
    (workspaceId: string, color: string) => {
      setSelectedWorkspaceId(workspaceId);
      setAccentColor(color);
      setIsDialogOpen(false);
    },
    [setAccentColor, setSelectedWorkspaceId],
  );

  const handleFileSelect = useCallback((path: string) => {
    setFileToOpen(path);
  }, []);

  const handleFileOpened = useCallback(() => setFileToOpen(null), []);

  const handleDiffFile = useCallback((filePath: string, repoPath: string, staged: boolean) => {
    setFileToDiff({ filePath, repoPath, staged });
  }, []);

  const handleDiffOpened = useCallback(() => setFileToDiff(null), []);

  const handleCommitClick = useCallback((commitSha: string) => {
    setCommitToHighlight({ commitSha, repoPath: '' });
  }, []);

  const handleOpenGitTree = useCallback((repoPath: string) => {
    setCommitToHighlight({ repoPath });
  }, []);

  const handleCommitHighlighted = useCallback(() => setCommitToHighlight(null), []);

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

  const handleCommandBarFileSelect = useCallback((path: string) => {
    setFileToOpen(path);
  }, []);

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
    [layout, splitPane, setTerminalRegistry, callbackCacheRef],
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
    [layout, removePane, handleTerminalUnregistered, setTerminalRegistry],
  );

  // While pane visibility is loading from the server, render a placeholder to avoid layout flash
  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading workspace"
        style={{
          flex: 1,
          background: COLOR_BG_PRIMARY,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLOR_TEXT_DIM,
          fontSize: '13px',
        }}
      >
        Loading…
      </div>
    );
  }

  // Build the top bar with command bar inside
  const topBar = (
    <TopBar
      commandBar={
        <CommandBar
          workspaceId={activeWorkspaceId}
          workspaceName={activeWorkspace?.name}
          onFileSelect={handleCommandBarFileSelect}
        />
      }
    />
  );

  return (
    <div ref={wrapperRef} style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <DragDropProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <AppLayout
          topBar={topBar}
          paneVisibility={{ left: leftVisible, right: rightVisible, bottom: bottomVisible }}
          leftSidebar={
            <WorkspaceSidebar
              activeWorkspaceId={activeWorkspaceId}
              worktreesByWorkspace={worktreesByWorkspace}
              activeWorktreePath={activeWorktreePath}
              onWorkspaceSelect={handleWorkspaceSelect}
              onAddWorkspace={handleAddWorkspace}
              onRenameWorkspace={handleRenameWorkspace}
              onSetCwdWorkspace={handleSetCwdWorkspace}
              onRemoveWorkspace={handleRemoveWorkspace}
              onChangeColorWorkspace={handleChangeColorWorkspace}
              onWorktreeSelect={handleWorktreeSelect}
              onCreateWorktree={handleCreateWorktree}
              onCopyWorktreePath={handleCopyWorktreePath}
              onRemoveWorktree={handleRemoveWorktree}
              onMergeWorktree={handleMergeWorktree}
            />
          }
          rightSidebar={
            <RightSidebar
              workspaceId={activeWorkspaceId}
              workspaceCwd={activeWorktreePath ?? activeWorkspace?.cwd}
              onFileSelect={handleFileSelect}
              onOpenDiff={handleDiffFile}
              onOpenGitTree={handleOpenGitTree}
              onCommitClick={handleCommitClick}
            />
          }
          bottomPanel={
            <BottomPanel
              ref={bottomPanelRef}
              workspaceId={activeWorkspaceId}
              effectiveCwd={effectiveCwd}
              terminalContainerRef={bottomTerminalRef}
              onTerminalRegistered={handleBottomTerminalRegistered}
              onTerminalUnregistered={handleTerminalUnregistered}
              onActiveTabChange={(tabId) => setActiveTabForPane('bottom', tabId)}
              onMoveToPane={(tabId) => handleMoveToPane(tabId, 'bottom')}
            />
          }
        >
          <SplitPaneLayout
            layout={layout}
            focusedPaneId={focusedPaneId}
            workspaceId={activeWorkspaceId}
            effectiveCwd={effectiveCwd}
            fileToOpen={fileToOpen}
            onFileOpened={handleFileOpened}
            fileToDiff={fileToDiff}
            onDiffOpened={handleDiffOpened}
            commitToHighlight={commitToHighlight}
            onCommitHighlighted={handleCommitHighlighted}
            onTerminalRegistered={handleTerminalRegistered}
            onTerminalUnregistered={handleTerminalUnregistered}
            onActiveTabChange={(paneId, tabId) => setActiveTabForPane(paneId, tabId)}
            onFocusPane={setFocusedPaneId}
            onSplitRight={handleSplitRight}
            onSplitDown={handleSplitDown}
            onClosePane={handleClosePane}
            paneHandleRefs={paneHandleRefs}
            paneContainerRefs={paneContainerRefs}
          />
          <CreateWorkspaceDialog
            open={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            onCreated={handleWorkspaceCreated}
          />
          <CreateWorktreeDialog
            open={isCreateWorktreeDialogOpen}
            onClose={() => {
              setIsCreateWorktreeDialogOpen(false);
              setCreateWorktreeForWsId(null);
            }}
            onCreated={handleWorktreeCreated}
            workspaceId={createWorktreeForWsId}
            workspaceCwd={
              createWorktreeForWsId
                ? workspaces?.find((ws) => ws.id === createWorktreeForWsId)?.cwd
                : undefined
            }
          />
        </AppLayout>
      </DragDropProvider>
      <TerminalManager
        terminals={terminalEntries}
        getPaneBounds={getPaneBounds}
        terminalRefs={terminalRefsMap}
        boundsVersion={allBounds}
      />
    </div>
  );
}

export function WorkspaceView() {
  return (
    <DialogProvider>
      <ToastProvider>
        <PaneVisibilityProvider>
          <FileClipboardProvider>
            <WorkspaceViewInner />
          </FileClipboardProvider>
        </PaneVisibilityProvider>
      </ToastProvider>
    </DialogProvider>
  );
}
