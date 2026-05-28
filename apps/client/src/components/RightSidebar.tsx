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
    let cancelled = false;

    sendRequest<{ tree: FileNode[] }>('workspace/file-tree', {
      workspaceId,
    }).then((res) => {
      if (!cancelled) setFileTree(res.tree);
    });

    sendRequest<GitStatus>('workspace/git-status', {
      workspaceId,
    }).then((res) => {
      if (!cancelled) setGitStatus(res);
    });

    return () => {
      cancelled = true;
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
