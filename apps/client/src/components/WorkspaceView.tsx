import { useState, useCallback } from 'react';
import { AppLayout } from './AppLayout';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { RightSidebar } from './RightSidebar';
import { ContentPane } from './ContentPane';
import { BottomPanel } from './BottomPanel';
import { StatusBar } from './StatusBar';
import { ToastProvider } from './ToastProvider';
import { useTheme } from '../hooks/useTheme';
import { useWorkspaces } from '../hooks/useWorkspaces';

export function WorkspaceView() {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const { data: workspaces } = useWorkspaces();
  const { setAccentColor } = useTheme();

  const activeWorkspace = workspaces?.find((ws) => ws.id === activeWorkspaceId);

  const handleWorkspaceSelect = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    const ws = workspaces?.find((w) => w.id === id);
    if (ws?.color) setAccentColor(ws.color);
  }, [workspaces, setAccentColor]);

  const handleAddWorkspace = useCallback(() => {
    // Will be connected to workspace creation dialog
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleFileSelect = useCallback((_path: string) => {
    // Will be connected to editor tab creation
  }, []);

  return (
    <ToastProvider>
      <AppLayout
        leftSidebar={
          <WorkspaceSidebar
            activeWorkspaceId={activeWorkspaceId}
            onWorkspaceSelect={handleWorkspaceSelect}
            onAddWorkspace={handleAddWorkspace}
          />
        }
        rightSidebar={
          <RightSidebar
            workspaceId={activeWorkspaceId}
            onFileSelect={handleFileSelect}
          />
        }
        bottomPanel={<BottomPanel workspaceId={activeWorkspaceId} />}
        footer={<StatusBar activeWorkspaceName={activeWorkspace?.name} />}
      >
        <ContentPane workspaceId={activeWorkspaceId} />
      </AppLayout>
    </ToastProvider>
  );
}
