import { useState, useEffect, useCallback, useMemo } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { FileTree } from './FileTree';
import { GitPanel } from './GitPanel';
import { sendRequest } from '../lib/send-request';
import { useFileChange } from '../hooks/useFileChange';
import './RightSidebar.css';
import type { FileNode } from '@ymir/shared';
import type { GitStatusResponse } from '@ymir/shared';
import { mergeDeletedFiles } from '../lib/git-tree-status';

interface RightSidebarProps {
  workspaceId: string | null;
  onFileSelect: (path: string) => void;
  workspaceCwd?: string;
}

export function RightSidebar({ workspaceId, onFileSelect, workspaceCwd }: RightSidebarProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const controller = new AbortController();
    const { signal } = controller;

    sendRequest<{ tree: FileNode[] }>('file.tree', { workspaceId }, { signal })
      .then((res) => {
        setFileTree(res.tree);
      })
      .catch((err) => {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      });

    sendRequest<GitStatusResponse>('git.status', { workspaceId }, { signal })
      .then((res) => {
        setGitStatus(res);
      })
      .catch((err) => {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      });

    return () => {
      controller.abort();
    };
  }, [workspaceId]);

  const refreshFileTree = useCallback(() => {
    if (!workspaceId) return;
    sendRequest<{ tree: FileNode[] }>('file.tree', { workspaceId })
      .then((res) => setFileTree(res.tree))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Operation failed');
        setTimeout(() => setError(null), 5000);
      });
  }, [workspaceId]);

  const refreshGitStatus = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const response = await sendRequest<GitStatusResponse>('git.status', { workspaceId });
      setGitStatus(response);
    } catch {
      // Silently ignore
    }
  }, [workspaceId]);

  const handleFileChange = useCallback(() => {
    refreshFileTree();
    refreshGitStatus();
  }, [refreshFileTree, refreshGitStatus]);

  useFileChange(workspaceId, handleFileChange);

  // Reset state when workspace is cleared
  const effectiveGitStatus = workspaceId ? gitStatus : null;

  const treeWithDeleted = useMemo(
    () => mergeDeletedFiles(workspaceId ? fileTree : [], workspaceId ? gitStatus : null, workspaceCwd || ''),
    [fileTree, gitStatus, workspaceId, workspaceCwd],
  );

  const handleFileSelect = useCallback(
    (path: string) => {
      onFileSelect(path);
    },
    [onFileSelect],
  );

  const handleNewFile = useCallback(
    (parentDir: string) => {
      const name = window.prompt('New file name:');
      if (!name || !workspaceId) return;
      sendRequest('file.create', { workspaceId, path: parentDir + '/' + name, isDirectory: false })
        .then(refreshFileTree)
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Operation failed');
          setTimeout(() => setError(null), 5000);
        });
    },
    [workspaceId, refreshFileTree],
  );

  const handleNewFolder = useCallback(
    (parentDir: string) => {
      const name = window.prompt('New folder name:');
      if (!name || !workspaceId) return;
      sendRequest('file.create', { workspaceId, path: parentDir + '/' + name, isDirectory: true })
        .then(refreshFileTree)
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Operation failed');
          setTimeout(() => setError(null), 5000);
        });
    },
    [workspaceId, refreshFileTree],
  );

  const handleRename = useCallback(
    (path: string) => {
      const oldName = path.split('/').pop() || '';
      const newName = window.prompt('New name:', oldName);
      if (!newName || !workspaceId) return;
      const parentDir = path.split('/').slice(0, -1).join('/') || '/';
      sendRequest('file.rename', { workspaceId, oldPath: path, newPath: parentDir + '/' + newName })
        .then(refreshFileTree)
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Operation failed');
          setTimeout(() => setError(null), 5000);
        });
    },
    [workspaceId, refreshFileTree],
  );

  const handleDelete = useCallback(
    (path: string) => {
      if (!workspaceId) return;
      sendRequest('file.delete', { workspaceId, path })
        .then(refreshFileTree)
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Operation failed');
          setTimeout(() => setError(null), 5000);
        });
    },
    [workspaceId, refreshFileTree],
  );

  return (
    <div
      data-testid="right-sidebar-content"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #333',
          fontSize: '11px',
          textTransform: 'uppercase',
          color: '#888',
        }}
      >
        Explorer
      </div>
      {error && (
        <div style={{ padding: '8px', color: '#e06050', fontSize: '12px', borderBottom: '1px solid #333' }}>
          {error}
        </div>
      )}
      <Group orientation="vertical" style={{ flex: 1, minHeight: 0 }}>
        <Panel defaultSize="70%" minSize="20%" style={{ overflow: 'auto' }}>
          {workspaceId ? (
            <FileTree
              tree={treeWithDeleted}
              onFileSelect={handleFileSelect}
              onOpenEditor={handleFileSelect}
              workspaceId={workspaceId}
              onNewFile={handleNewFile}
              onNewFolder={handleNewFolder}
              onRename={handleRename}
              onDelete={handleDelete}
              gitStatus={effectiveGitStatus}
              workspaceRoot={workspaceCwd}
            />
          ) : (
            <div style={{ padding: '8px', color: '#888' }}>No workspace selected</div>
          )}
        </Panel>
        <Separator style={{ height: '2px', background: '#333' }} />
        <Panel defaultSize="30%" minSize="10%" style={{ overflow: 'auto' }}>
          <GitPanel gitStatus={effectiveGitStatus} />
        </Panel>
      </Group>
    </div>
  );
}
