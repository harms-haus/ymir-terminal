import { useState, useEffect, useCallback } from 'react';
import { FileTree } from './FileTree';
import { GitPanel } from './GitPanel';
import { sendRequest } from '../lib/send-request';
import type { FileNode } from './FileTree';
import type { GitStatus } from './GitPanel';

interface RightSidebarProps {
  workspaceId: string | null;
  onFileSelect: (path: string) => void;
}

export function RightSidebar({ workspaceId, onFileSelect }: RightSidebarProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

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

    sendRequest<GitStatus>('git.status', { workspaceId }, { signal })
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

  // Reset state when workspace is cleared
  const effectiveFileTree = workspaceId ? fileTree : [];
  const effectiveGitStatus = workspaceId ? gitStatus : null;

  const handleFileSelect = useCallback(
    (path: string) => {
      onFileSelect(path);
    },
    [onFileSelect],
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
      <div style={{ flex: 1, overflow: 'auto' }}>
        {workspaceId ? (
          <FileTree
            tree={effectiveFileTree}
            onFileSelect={handleFileSelect}
            workspaceId={workspaceId}
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
