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
import { WindowTitleBar } from './WindowTitleBar';
import { YmirLogo } from './YmirLogo';
import { useTheme } from '../hooks/useTheme';
import { COLOR_BG_PRIMARY, COLOR_SPINNER_TRACK } from '../lib/theme';
import { CreateWorktreeDialog } from './CreateWorktreeDialog';
import { DragDropProvider } from '@dnd-kit/react';
import { FileClipboardProvider } from '../contexts/FileClipboardContext';
import { useConnectionUrl } from '../contexts/ConnectionUrlContext';
import { usePaneBounds } from '../hooks/usePaneBounds';
import { useTerminalRegistry } from '../hooks/useTerminalRegistry';
import { useWorkspaceSelection } from '../hooks/useWorkspaceSelection';
import { useSplitLayout } from '../hooks/useSplitLayout';
import { useTabDragDrop } from '../hooks/useTabDragDrop';
import { useTabRestore } from '../hooks/useTabRestore';
import { usePaneCallbacks } from '../hooks/usePaneCallbacks';

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
    activeScopeKey,
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
  const registeredElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const { layout, paneIds, splitPane, removePane, focusedPaneId, setFocusedPaneId, loadLayout } =
    useSplitLayout(activeScopeKey);

  const {
    wrapperRef,
    registerContainer,
    getPaneBounds,
    allBounds,
    bottomTerminalRef,
    updateBounds,
  } = usePaneBounds({
    loading,
  });

  // Sync split pane container elements with usePaneBounds so TerminalManager can position terminals
  useEffect(() => {
    const currentIds = new Set(paneIds);
    // Register or re-register panes whose DOM element changed (e.g. after remount)
    for (const [paneId, element] of paneContainerRefs.current) {
      if (registeredElementsRef.current.get(paneId) !== element && currentIds.has(paneId)) {
        registerContainer(paneId, element);
        registeredElementsRef.current.set(paneId, element);
      }
    }
    // Clean up removed panes — unregister from usePaneBounds
    for (const paneId of [...registeredElementsRef.current.keys()]) {
      if (!currentIds.has(paneId)) {
        registerContainer(paneId, null);
        registeredElementsRef.current.delete(paneId);
      }
    }
  }, [paneIds, registerContainer]);

  // Load persisted layout when scope changes
  useEffect(() => {
    loadLayout(activeScopeKey);
  }, [activeScopeKey, loadLayout]);

  // Restore tabs from persisted session on scope change
  useTabRestore({ activeScopeKey, paneHandleRefs });

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

  // --- Drag-drop for tabs and workspace reorder ---
  const { handleDragOver, handleDragEnd } = useTabDragDrop({
    paneHandleRefs,
    bottomPanelRef,
    workspacesRef,
    reorderWorkspacesMutation,
    terminalRegistry,
    setTerminalRegistry,
    activeWorkspaceId,
    bottomVisible,
    toggleBottom,
  });

  // --- Pane management callbacks (split, close, move) ---
  const { handleSplitRight, handleSplitDown, handleClosePane, handleMoveToPane } = usePaneCallbacks(
    {
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
    },
  );

  // --- Simple UI state callbacks ---

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

  const handleCommandBarFileSelect = useCallback((path: string) => {
    setFileToOpen(path);
  }, []);

  // While pane visibility is loading from the server, render a branded loading screen
  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading workspace"
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: COLOR_BG_PRIMARY,
        }}
      >
        <WindowTitleBar />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: COLOR_BG_PRIMARY,
          }}
        >
          <YmirLogo size={120} />
          <div
            role="status"
            aria-label="Loading"
            style={{
              marginTop: 12,
              width: 32,
              height: 32,
              border: '3px solid ' + COLOR_SPINNER_TRACK,
              borderTopColor: '#ffffff',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        </div>
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
              onSearchResultClick={(filePath: string, _lineNumber: number) => {
                handleFileSelect(filePath);
                // TODO: Navigate to _lineNumber in the editor when supported
              }}
            />
          }
          bottomPanel={
            <BottomPanel
              ref={bottomPanelRef}
              workspaceId={activeWorkspaceId}
              scopeKey={activeScopeKey}
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
            scopeKey={activeScopeKey}
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
            onLayoutChanged={updateBounds}
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
        onFocusPane={setFocusedPaneId}
      />
    </div>
  );
}

export function WorkspaceView() {
  const connectionUrl = useConnectionUrl();

  return (
    <DialogProvider>
      <ToastProvider>
        <PaneVisibilityProvider>
          <FileClipboardProvider>
            <WorkspaceViewInner key={connectionUrl} />
          </FileClipboardProvider>
        </PaneVisibilityProvider>
      </ToastProvider>
    </DialogProvider>
  );
}
