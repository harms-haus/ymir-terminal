import { useState, useCallback, useMemo } from 'react';
import { AppLayout } from './AppLayout';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { RightSidebar } from './RightSidebar';
import { ContentPane } from './ContentPane';
import { BottomPanel } from './BottomPanel';
import { StatusBar } from './StatusBar';
import { ToastProvider } from './ToastProvider';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import type { WorkspaceSummary } from '@ymir/shared';
import { useTheme } from '../hooks/useTheme';
import { useWorkspaces, useUpdateWorkspace, useDeleteWorkspace } from '../hooks/useWorkspaces';

export function WorkspaceView() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fileToOpen, setFileToOpen] = useState<string | null>(null);
  const { data: workspaces } = useWorkspaces();
  const { setAccentColor } = useTheme();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();

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

  const handleRenameWorkspace = useCallback((id: string, name: string) => {
    updateWorkspace.mutate({ id, name });
  }, [updateWorkspace]);

  const handleSetCwdWorkspace = useCallback((id: string, cwd: string) => {
    updateWorkspace.mutate({ id, cwd });
  }, [updateWorkspace]);

  const handleChangeColorWorkspace = useCallback((id: string, color: string) => {
    updateWorkspace.mutate({ id, color });
    if (id === activeWorkspaceId) setAccentColor(color);
  }, [updateWorkspace, activeWorkspaceId, setAccentColor]);

  const handleRemoveWorkspace = useCallback((id: string) => {
    deleteWorkspace.mutate({ id });
    if (id === selectedWorkspaceId) setSelectedWorkspaceId(null);
  }, [deleteWorkspace, selectedWorkspaceId]);

  return (
    <ToastProvider>
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
          <RightSidebar workspaceId={activeWorkspaceId} onFileSelect={handleFileSelect} />
        }
        bottomPanel={<BottomPanel workspaceId={activeWorkspaceId} />}
        footer={<StatusBar activeWorkspaceName={activeWorkspace?.name} />}
      >
        <ContentPane
          workspaceId={activeWorkspaceId}
          fileToOpen={fileToOpen}
          onFileOpened={() => setFileToOpen(null)}
        />
        <CreateWorkspaceDialog
          open={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onCreated={handleWorkspaceCreated}
        />
      </AppLayout>
    </ToastProvider>
  );
}
