import { useState, useCallback, useMemo, useRef } from 'react';
import { AppLayout } from './AppLayout';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { RightSidebar } from './RightSidebar';
import { ContentPane } from './ContentPane';
import type { ContentPaneHandle } from './ContentPane';
import { BottomPanel } from './BottomPanel';
import type { BottomPanelHandle } from './BottomPanel';
import { StatusBar } from './StatusBar';
import { ToastProvider } from './ToastProvider';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import type { WorkspaceSummary } from '@ymir/shared';
import { useTheme } from '../hooks/useTheme';
import { useWorkspaces, useUpdateWorkspace, useDeleteWorkspace } from '../hooks/useWorkspaces';
import { DragDropProvider } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';

export function WorkspaceView() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fileToOpen, setFileToOpen] = useState<string | null>(null);
  const { data: workspaces } = useWorkspaces();
  const { setAccentColor } = useTheme();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();

  const contentPaneRef = useRef<ContentPaneHandle>(null);
  const bottomPanelRef = useRef<BottomPanelHandle>(null);

  const handleDragOver = useCallback(
    (event: { operation: { source?: { id?: string; group?: string } | null; target?: { id?: string; group?: string } | null } }) => {
      const source = event.operation.source;
      const target = event.operation.target;
      if (!source?.id || !target?.id) return;

      const sourceGroup = source.group;

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
    (event: { canceled: boolean; operation: { source?: { id?: string; group?: string } | null; target?: { id?: string; group?: string } | null } }) => {
      if (event.canceled) return;
      const source = event.operation.source;
      const target = event.operation.target;
      if (!source?.id || !target?.group) return;

      const sourceGroup = source.group;
      const targetGroup = target.group;

      // Only handle cross-pane transfers
      if (sourceGroup === targetGroup) return;

      // Determine source and target panes
      const sourcePane = sourceGroup === 'content' ? contentPaneRef.current : bottomPanelRef.current;
      const targetPane = targetGroup === 'content' ? contentPaneRef.current : bottomPanelRef.current;
      if (!sourcePane || !targetPane) return;

      // Only terminal tabs can move between panes
      const removed = sourcePane.removeTerminalTab(source.id as string);
      if (!removed) return;

      targetPane.addTerminalTab(removed.terminalId, removed.title, removed.cwd);
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

  return (
    <ToastProvider>
      <DragDropProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <AppLayout
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
          bottomPanel={<BottomPanel ref={bottomPanelRef} workspaceId={activeWorkspaceId} />}
          footer={<StatusBar activeWorkspaceName={activeWorkspace?.name} />}
        >
          <ContentPane
            ref={contentPaneRef}
            workspaceId={activeWorkspaceId}
            fileToOpen={fileToOpen}
            onFileOpened={handleFileOpened}
          />
          <CreateWorkspaceDialog
            open={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            onCreated={handleWorkspaceCreated}
          />
        </AppLayout>
      </DragDropProvider>
    </ToastProvider>
  );
}
