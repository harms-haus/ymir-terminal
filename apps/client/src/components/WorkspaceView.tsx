import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AppLayout } from './AppLayout';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { RightSidebar } from './RightSidebar';
import { ContentPane } from './ContentPane';
import type { ContentPaneHandle } from './ContentPane';
import { BottomPanel } from './BottomPanel';
import type { BottomPanelHandle } from './BottomPanel';
import { TerminalManager } from './TerminalManager';
import type { TerminalEntry, PaneBounds } from './TerminalManager';
import { TopBar } from './TopBar';
import { CommandBar } from './CommandBar';
import { ToastProvider } from './ToastProvider';
import { PaneVisibilityProvider, usePaneVisibility } from '../hooks/usePaneVisibility';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import type { WorkspaceSummary } from '@ymir/shared';
import { useTheme } from '../hooks/useTheme';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';
import { useWorkspaces, useUpdateWorkspace, useDeleteWorkspace } from '../hooks/useWorkspaces';
import { DragDropProvider } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';

interface TerminalRegistryEntry {
  terminalId: string;
  tabId: string;
  owningPane: 'content' | 'bottom';
}

function WorkspaceViewInner() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fileToOpen, setFileToOpen] = useState<string | null>(null);
  const { data: workspaces } = useWorkspaces();
  const { setAccentColor } = useTheme();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const {
    left: leftVisible,
    right: rightVisible,
    bottom: bottomVisible,
    loading,
  } = usePaneVisibility();

  const contentPaneRef = useRef<ContentPaneHandle>(null);
  const bottomPanelRef = useRef<BottomPanelHandle>(null);

  // Terminal registry — tracks all live terminals across both panes
  const [terminalRegistry, setTerminalRegistry] = useState<TerminalRegistryEntry[]>([]);
  const terminalRefsMap = useRef<Map<string, { focus(): void }>>(new Map());

  // Refs for terminal container divs (used by ResizeObserver for bounds tracking)
  const contentTerminalRef = useRef<HTMLDivElement>(null);
  const bottomTerminalRef = useRef<HTMLDivElement>(null);

  // Wrapper div for overlay positioning context
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Bounds state for overlay positioning
  const [containerBounds, setContainerBounds] = useState<{
    content: PaneBounds | null;
    bottom: PaneBounds | null;
  }>({ content: null, bottom: null });

  // Track bounds via ResizeObserver
  useEffect(() => {
    const updateBounds = () => {
      const wrapperRect = wrapperRef.current?.getBoundingClientRect();
      const contentRect = contentTerminalRef.current?.getBoundingClientRect();
      const bottomRect = bottomTerminalRef.current?.getBoundingClientRect();

      setContainerBounds({
        content:
          wrapperRect && contentRect
            ? {
                top: contentRect.top - wrapperRect.top,
                left: contentRect.left - wrapperRect.left,
                width: contentRect.width,
                height: contentRect.height,
              }
            : null,
        bottom:
          wrapperRect && bottomRect
            ? {
                top: bottomRect.top - wrapperRect.top,
                left: bottomRect.left - wrapperRect.left,
                width: bottomRect.width,
                height: bottomRect.height,
              }
            : null,
      });
    };

    const observer = new ResizeObserver(updateBounds);
    if (contentTerminalRef.current) observer.observe(contentTerminalRef.current);
    if (bottomTerminalRef.current) observer.observe(bottomTerminalRef.current);
    updateBounds();

    return () => observer.disconnect();
  }, [loading]);

  // Track active tab IDs from both panes (synced via callbacks)
  const [contentActiveTabId, setContentActiveTabId] = useState<string | null>(null);
  const [bottomActiveTabId, setBottomActiveTabId] = useState<string | null>(null);

  // Terminal lifecycle callbacks
  const handleTerminalRegistered = useCallback(
    (terminalId: string, tabId: string, pane: 'content' | 'bottom') => {
      setTerminalRegistry((prev) => [...prev, { terminalId, tabId, owningPane: pane }]);
    },
    [],
  );

  const handleTerminalUnregistered = useCallback((terminalId: string) => {
    setTerminalRegistry((prev) => prev.filter((t) => t.terminalId !== terminalId));
  }, []);

  // Content pane callbacks
  const handleContentTerminalRegistered = useCallback(
    (terminalId: string, tabId: string) => {
      handleTerminalRegistered(terminalId, tabId, 'content');
    },
    [handleTerminalRegistered],
  );

  // Bottom panel callbacks
  const handleBottomTerminalRegistered = useCallback(
    (terminalId: string, tabId: string) => {
      handleTerminalRegistered(terminalId, tabId, 'bottom');
    },
    [handleTerminalRegistered],
  );

  // Focus content pane's active terminal
  useEffect(() => {
    if (!contentActiveTabId) return;
    const entry = terminalRegistry.find(
      (t) => t.owningPane === 'content' && t.tabId === contentActiveTabId,
    );
    if (entry) {
      const handle = requestAnimationFrame(() => {
        terminalRefsMap.current.get(entry.tabId)?.focus();
      });
      return () => cancelAnimationFrame(handle);
    }
  }, [contentActiveTabId, terminalRegistry]);

  // Focus bottom panel's active terminal
  useEffect(() => {
    if (!bottomActiveTabId) return;
    const entry = terminalRegistry.find(
      (t) => t.owningPane === 'bottom' && t.tabId === bottomActiveTabId,
    );
    if (entry) {
      const handle = requestAnimationFrame(() => {
        terminalRefsMap.current.get(entry.tabId)?.focus();
      });
      return () => cancelAnimationFrame(handle);
    }
  }, [bottomActiveTabId, terminalRegistry]);

  const handleDragOver = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event: any) => {
      const source = event.operation?.source ?? event.source;
      const target = event.operation?.target ?? event.target;
      if (!source?.id || !target?.id) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sourceGroup = (source as any).initialGroup ?? source.group;
      const targetGroup = target.group ?? target.data?.group;

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
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: {
      canceled: boolean;
      operation: {
        source?: { id?: string; group?: string } | null;
        target?: { id?: string; group?: string } | null;
      };
    }) => {
      if (event.canceled) return;
      const source = event.operation.source;
      const target = event.operation.target;
      if (
        !source?.id ||
        !(target?.group ?? (target as unknown as { data?: { group?: string } })?.data?.group)
      )
        return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sourceGroup = (source as any).initialGroup ?? source.group;
      const targetGroup =
        target!.group ?? (target! as unknown as { data?: { group?: string } })?.data?.group;

      // Only handle cross-pane transfers
      if (sourceGroup === targetGroup) return;

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
    [],
  );

  const activeWorkspaceId = useMemo(() => {
    if (selectedWorkspaceId) return selectedWorkspaceId;
    if (workspaces && workspaces.length > 0) return workspaces[0].id;
    return null;
  }, [selectedWorkspaceId, workspaces]);

  const activeWorkspace = workspaces?.find((ws: WorkspaceSummary) => ws.id === activeWorkspaceId);

  const handleWorkspaceSelect = useCallback(
    (id: string) => {
      setSelectedWorkspaceId(id);
      const ws = workspaces?.find((w: WorkspaceSummary) => w.id === id);
      if (ws?.color) setAccentColor(ws.color);
    },
    [workspaces, setAccentColor],
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
    [setAccentColor],
  );

  const handleFileSelect = useCallback((path: string) => {
    setFileToOpen(path);
  }, []);

  const handleFileOpened = useCallback(() => setFileToOpen(null), []);

  const handleCommandBarFileSelect = useCallback((path: string) => {
    setFileToOpen(path);
  }, []);

  const handleRenameWorkspace = useCallback(
    (id: string, name: string) => {
      updateWorkspace.mutate({ id, name });
    },
    [updateWorkspace],
  );

  const handleSetCwdWorkspace = useCallback(
    (id: string, cwd: string) => {
      updateWorkspace.mutate({ id, cwd });
    },
    [updateWorkspace],
  );

  const handleChangeColorWorkspace = useCallback(
    (id: string, color: string) => {
      updateWorkspace.mutate({ id, color });
      if (id === activeWorkspaceId) setAccentColor(color);
    },
    [updateWorkspace, activeWorkspaceId, setAccentColor],
  );

  const handleRemoveWorkspace = useCallback(
    (id: string) => {
      deleteWorkspace.mutate({ id });
      if (id === selectedWorkspaceId) setSelectedWorkspaceId(null);
    },
    [deleteWorkspace, selectedWorkspaceId],
  );

  // Stable callback cache: tabId -> {onTitleChange, onCwdChange}
  // useState with lazy init gives a stable mutable Map; closures read pane refs
  // only when invoked (in event handlers), satisfying the react-hooks/refs rule.
  const callbackCacheRef = useRef<
    Map<string, { onTitleChange: (title: string) => void; onCwdChange: (cwd: string) => void }>
  >(new Map());

  // Build terminal entries for TerminalManager
  /* eslint-disable react-hooks/refs -- stable mutable cache, not a reactive ref */
  const terminalEntries: TerminalEntry[] = useMemo(() => {
    const cache = callbackCacheRef.current;
    return terminalRegistry.map((entry) => {
      let cached = cache.get(entry.tabId);
      if (!cached) {
        const paneRef = entry.owningPane === 'content' ? contentPaneRef : bottomPanelRef;
        cached = {
          onTitleChange: (title: string) => {
            paneRef.current?.updateTabTitle(entry.tabId, title);
          },
          onCwdChange: (cwd: string) => {
            paneRef.current?.updateTabCwd(entry.tabId, cwd);
          },
        };
        cache.set(entry.tabId, cached);
      }
      return {
        terminalId: entry.terminalId,
        tabId: entry.tabId,
        owningPane: entry.owningPane,
        isActive:
          (entry.owningPane === 'content' && entry.tabId === contentActiveTabId) ||
          (entry.owningPane === 'bottom' && entry.tabId === bottomActiveTabId),
        onTitleChange: cached.onTitleChange,
        onCwdChange: cached.onCwdChange,
      };
    });
  }, [terminalRegistry, contentActiveTabId, bottomActiveTabId]);
  /* eslint-enable react-hooks/refs */

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
              onWorkspaceSelect={handleWorkspaceSelect}
              onAddWorkspace={handleAddWorkspace}
              onRenameWorkspace={handleRenameWorkspace}
              onSetCwdWorkspace={handleSetCwdWorkspace}
              onRemoveWorkspace={handleRemoveWorkspace}
              onChangeColorWorkspace={handleChangeColorWorkspace}
            />
          }
          rightSidebar={
            <RightSidebar
              workspaceId={activeWorkspaceId}
              workspaceCwd={activeWorkspace?.cwd}
              onFileSelect={handleFileSelect}
            />
          }
          bottomPanel={
            <BottomPanel
              ref={bottomPanelRef}
              workspaceId={activeWorkspaceId}
              terminalContainerRef={bottomTerminalRef}
              onTerminalRegistered={handleBottomTerminalRegistered}
              onTerminalUnregistered={handleTerminalUnregistered}
              onActiveTabChange={setBottomActiveTabId}
            />
          }
        >
          <ContentPane
            ref={contentPaneRef}
            workspaceId={activeWorkspaceId}
            fileToOpen={fileToOpen}
            onFileOpened={handleFileOpened}
            terminalContainerRef={contentTerminalRef}
            onTerminalRegistered={handleContentTerminalRegistered}
            onTerminalUnregistered={handleTerminalUnregistered}
            onActiveTabChange={setContentActiveTabId}
          />
          <CreateWorkspaceDialog
            open={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            onCreated={handleWorkspaceCreated}
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
    <ToastProvider>
      <PaneVisibilityProvider>
        <WorkspaceViewInner />
      </PaneVisibilityProvider>
    </ToastProvider>
  );
}
