import { useState, useEffect, useCallback } from 'react';
import { FileTree } from './FileTree';
import { GitPanel } from './GitPanel';
import { sendRequest } from '../lib/send-request';
import { useFileChange } from '../hooks/useFileChange';
import type { FileNode } from '@ymir/shared';
import type { GitStatusResponse } from '@ymir/shared';

interface RightSidebarProps {
  workspaceId: string | null;
  onFileSelect: (path: string) => void;
}

export function RightSidebar({ workspaceId, onFileSelect }: RightSidebarProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    sendRequest<{ tree: FileNode[] }>('file.tree', { workspaceId }, { signal })
      .then((res) => {
        setFileTree(res.tree);
      })
      .catch(() => {
        /* aborted or timed out – safe to ignore */
      });

    sendRequest<GitStatusResponse>('git.status', { workspaceId }, { signal })
      .then((res) => {
        setGitStatus(res);
      })
      .catch(() => {
        /* aborted or timed out – safe to ignore */
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

  useFileChange(workspaceId, refreshFileTree);

  // Reset state when workspace is cleared
  const effectiveFileTree = workspaceId ? fileTree : [];
  const effectiveGitStatus = workspaceId ? gitStatus : null;

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
      <div style={{ flex: 1, overflow: 'auto' }}>
        {workspaceId ? (
          <FileTree
            tree={effectiveFileTree}
            onFileSelect={handleFileSelect}
            onOpenEditor={handleFileSelect}
            workspaceId={workspaceId}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        ) : (
          <div style={{ color: '#666', padding: '8px', fontSize: '12px' }}>
            No workspace selected
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid #333' }}>
        <GitPanel gitStatus={effectiveGitStatus} />
      </div>
    </div>
  );
}
