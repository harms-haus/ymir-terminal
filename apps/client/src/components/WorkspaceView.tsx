import { useState, useCallback, useRef } from 'react';
import { AppLayout } from './AppLayout';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { RightSidebar } from './RightSidebar';
import { ContentPane } from './ContentPane';
import type { TerminalPanelHandle as ContentPaneHandle } from '../hooks/useTerminalPanel';
import { BottomPanel } from './BottomPanel';
import type { TerminalPanelHandle as BottomPanelHandle } from '../hooks/useTerminalPanel';
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

  const contentPaneRef = useRef<ContentPaneHandle>(null);
  const bottomPanelRef = useRef<BottomPanelHandle>(null);

  const { wrapperRef, contentTerminalRef, bottomTerminalRef, containerBounds } = usePaneBounds({
    loading,
  });

  const {
    terminalRegistry,
    setTerminalRegistry,
    terminalRefsMap,
    callbackCacheRef,
    terminalEntries,
    setContentActiveTabId,
    setBottomActiveTabId,
    handleTerminalUnregistered,
    handleContentTerminalRegistered,
    handleBottomTerminalRegistered,
  } = useTerminalRegistry({
    contentPaneRef,
    bottomPanelRef,
    activeWorkspaceId,
  });

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const source = event.operation.source;
    const target = event.operation.target;
    if (!source?.id || !target?.id) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceGroup = (source as any).initialGroup ?? (source as any).group;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetGroup = (target as any).group ?? target?.data?.group;

    // Workspace reorder — visual preview only (mutation fires on dragEnd)
    if (source.type === 'workspace') {
      return;
    }

    // Worktree reorder within workspace — cosmetic only (client-side visual reordering)
    if (source.type === 'worktree') {
      return;
    }

    // Suppress OptimisticSortingPlugin DOM mutation for cross-group drags
    if (sourceGroup && targetGroup && sourceGroup !== targetGroup) {
      event.preventDefault();
      return;
    }

    // Same-group reorder
    if (sourceGroup === 'content') {
      const paneTabs = contentPaneRef.current?.getTabs() ?? [];
      const ids = paneTabs.map((t) => t.id);
      const reordered = move(ids, event);
      if (Array.isArray(reordered)) {
        const fromIndex = paneTabs.findIndex((t) => t.id === source.id);
        const toIndex = reordered.indexOf(source.id as string);
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          contentPaneRef.current?.reorderTabs(fromIndex, toIndex);
        }
      }
    } else if (sourceGroup === 'bottom') {
      const paneTabs = bottomPanelRef.current?.getTabs() ?? [];
      const ids = paneTabs.map((t) => t.id);
      const reordered = move(ids, event);
      if (Array.isArray(reordered)) {
        const fromIndex = paneTabs.findIndex((t) => t.id === source.id);
        const toIndex = reordered.indexOf(source.id as string);
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          bottomPanelRef.current?.reorderTabs(fromIndex, toIndex);
        }
      }
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (event.canceled) return;
      const source = event.operation.source;
      const target = event.operation.target;
      if (!source?.id || !(target as unknown as { data?: { group?: string } })?.data?.group) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sourceGroup = (source as any).initialGroup ?? (source as any).group;
      const targetGroup =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (target as any).group ?? (target as unknown as { data?: { group?: string } })?.data?.group;

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

      // Only handle cross-pane transfers
      if (sourceGroup === targetGroup) return;

      // Only allow drag within the active workspace
      const sourceEntry = terminalRegistry.find((t) => t.tabId === (source.id as string));
      if (!sourceEntry || sourceEntry.workspaceId !== activeWorkspaceId) return;

      // Determine source and target panes
      const sourcePane =
        sourceGroup === 'content' ? contentPaneRef.current : bottomPanelRef.current;
      const targetPane =
        targetGroup === 'content' ? contentPaneRef.current : bottomPanelRef.current;
      if (!sourcePane || !targetPane) return;

      // Transfer the tab: remove from source pane, add to target pane
      const removed = sourcePane.transferTabOut(source.id as string);
      if (!removed) return;

      const newTabId = targetPane.receiveTab(
        removed.terminalId,
        removed.title,
        removed.cwd,
        removed.customTitle,
      );

      // Update terminal ownership — no unmount, just update the portal target
      const newOwningPane = (targetGroup === 'content' ? 'content' : 'bottom') as
        | 'content'
        | 'bottom';
      setTerminalRegistry((prev) =>
        prev.map((t) =>
          t.terminalId === removed.terminalId
            ? { ...t, tabId: newTabId, owningPane: newOwningPane }
            : t,
        ),
      );
    },
    [activeWorkspaceId, terminalRegistry, reorderWorkspacesMutation],
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
      const sourceRef = sourcePane === 'content' ? contentPaneRef : bottomPanelRef;
      const targetRef = sourcePane === 'content' ? bottomPanelRef : contentPaneRef;
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
              onActiveTabChange={setBottomActiveTabId}
              onMoveToPane={(tabId) => handleMoveToPane(tabId, 'bottom')}
            />
          }
        >
          <ContentPane
            ref={contentPaneRef}
            workspaceId={activeWorkspaceId}
            effectiveCwd={effectiveCwd}
            fileToOpen={fileToOpen}
            onFileOpened={handleFileOpened}
            fileToDiff={fileToDiff}
            onDiffOpened={handleDiffOpened}
            commitToHighlight={commitToHighlight}
            onCommitHighlighted={handleCommitHighlighted}
            terminalContainerRef={contentTerminalRef}
            onTerminalRegistered={handleContentTerminalRegistered}
            onTerminalUnregistered={handleTerminalUnregistered}
            onActiveTabChange={setContentActiveTabId}
            onMoveToPane={(tabId) => handleMoveToPane(tabId, 'content')}
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
        contentBounds={containerBounds.content}
        bottomBounds={containerBounds.bottom}
        terminalRefs={terminalRefsMap}
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
