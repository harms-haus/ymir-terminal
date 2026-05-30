import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { GroupImperativeHandle } from 'react-resizable-panels';
import { FileTree } from './FileTree';
import { GitPanel } from './GitPanel';
import { GitHistoryPanel } from './GitHistoryPanel';
import { sendRequest } from '../lib/send-request';
import { useFileChange } from '../hooks/useFileChange';
import './RightSidebar.css';
import type { FileNode } from '@ymir/shared';
import type { GitStatusResponse } from '@ymir/shared';
import { mergeDeletedFiles } from '../lib/git-utils';
import {
  COLOR_BORDER,
  COLOR_ERROR,
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_HOVER_BG,
  TITLE_BAR_HEIGHT,
} from '../lib/theme';

interface RightSidebarProps {
  workspaceId: string | null;
  onFileSelect: (path: string) => void;
  workspaceCwd?: string;
}

export function RightSidebar({ workspaceId, onFileSelect, workspaceCwd }: RightSidebarProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topView, setTopView] = useState<'tree' | 'changes'>('tree');
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const explorerGroupRef = useRef<GroupImperativeHandle>(null);
  const sizesLoadedRef = useRef(false);

  // Load persisted project sidebar panel sizes on mount
  useEffect(() => {
    sendRequest<{ key: string; value: string | null }>('config.get', {
      key: 'ui_project_sidebar_sizes',
    })
      .then((res) => {
        if (res.value != null) {
          const layout = JSON.parse(res.value) as { topPane: number; historyPane: number };
          if (typeof layout.topPane === 'number' && typeof layout.historyPane === 'number') {
            explorerGroupRef.current?.setLayout(layout);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        sizesLoadedRef.current = true;
      });
  }, []);

  const handleExplorerLayoutChanged = useCallback((layout: Record<string, number>) => {
    if (!sizesLoadedRef.current) return;
    if (Object.values(layout).some((v) => v < 1)) return; // skip if collapsed
    sendRequest('config.set', {
      key: 'ui_project_sidebar_sizes',
      value: JSON.stringify(layout),
    }).catch(() => {});
  }, []);

  function handleAsyncError(err: unknown) {
    setError(err instanceof Error ? err.message : 'Operation failed');
    const id = setTimeout(() => {
      setError(null);
      timeoutRefs.current = timeoutRefs.current.filter((t) => t !== id);
    }, 5000);
    timeoutRefs.current.push(id);
  }

  // Cleanup pending error-dismiss timeouts on unmount
  useEffect(() => {
    const currentTimeouts = timeoutRefs.current;
    return () => {
      currentTimeouts.forEach(clearTimeout);
    };
  }, []);

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
      .catch(handleAsyncError);
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
    () =>
      mergeDeletedFiles(
        workspaceId ? fileTree : [],
        workspaceId ? gitStatus : null,
        workspaceCwd || '',
      ),
    [fileTree, gitStatus, workspaceId, workspaceCwd],
  );

  const handleNewFile = useCallback(
    (parentDir: string) => {
      const name = window.prompt('New file name:');
      if (!name || !workspaceId) return;
      sendRequest('file.create', { workspaceId, path: parentDir + '/' + name, isDirectory: false })
        .then(refreshFileTree)
        .catch(handleAsyncError);
    },
    [workspaceId, refreshFileTree],
  );

  const handleNewFolder = useCallback(
    (parentDir: string) => {
      const name = window.prompt('New folder name:');
      if (!name || !workspaceId) return;
      sendRequest('file.create', { workspaceId, path: parentDir + '/' + name, isDirectory: true })
        .then(refreshFileTree)
        .catch(handleAsyncError);
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
        .catch(handleAsyncError);
    },
    [workspaceId, refreshFileTree],
  );

  const handleDelete = useCallback(
    (path: string) => {
      if (!workspaceId) return;
      sendRequest('file.delete', { workspaceId, path })
        .then(refreshFileTree)
        .catch(handleAsyncError);
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
          height: `${TITLE_BAR_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          borderBottom: `1px solid ${COLOR_BORDER}`,
          fontSize: '11px',
          textTransform: 'uppercase' as const,
          color: COLOR_TEXT_MUTED,
          flexShrink: 0,
        }}
      >
        <span style={{ flex: 1 }}>Project</span>
        <button
          data-testid="toggle-file-tree"
          title="File Explorer"
          aria-label="File Explorer"
          onClick={() => setTopView('tree')}
          style={{
            background: topView === 'tree' ? COLOR_HOVER_BG : 'transparent',
            border: 'none',
            color: topView === 'tree' ? COLOR_TEXT : COLOR_TEXT_MUTED,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '12px',
            lineHeight: 1,
          }}
        >
          📁
        </button>
        <button
          data-testid="toggle-git-changes"
          title="Git Changes"
          aria-label="Git Changes"
          onClick={() => setTopView('changes')}
          style={{
            background: topView === 'changes' ? COLOR_HOVER_BG : 'transparent',
            border: 'none',
            color: topView === 'changes' ? COLOR_TEXT : COLOR_TEXT_MUTED,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '12px',
            lineHeight: 1,
          }}
        >
          ⎇
        </button>
      </div>
      {error && (
        <div
          style={{
            padding: '8px',
            color: COLOR_ERROR,
            fontSize: '12px',
            borderBottom: `1px solid ${COLOR_BORDER}`,
          }}
        >
          {error}
        </div>
      )}
      <Group
        orientation="vertical"
        style={{ flex: 1, minHeight: 0 }}
        groupRef={explorerGroupRef}
        onLayoutChanged={handleExplorerLayoutChanged}
      >
        <Panel id="topPane" defaultSize="60%" minSize="20%" style={{ overflow: 'auto' }}>
          {topView === 'tree' ? (
            workspaceId ? (
              <FileTree
                tree={treeWithDeleted}
                onFileSelect={onFileSelect}
                onOpenEditor={onFileSelect}
                workspaceId={workspaceId}
                onNewFile={handleNewFile}
                onNewFolder={handleNewFolder}
                onRename={handleRename}
                onDelete={handleDelete}
                gitStatus={effectiveGitStatus}
                workspaceRoot={workspaceCwd}
              />
            ) : (
              <div style={{ padding: '8px', color: COLOR_TEXT_MUTED }}>No workspace selected</div>
            )
          ) : (
            <GitPanel gitStatus={effectiveGitStatus} />
          )}
        </Panel>
        <Separator style={{ height: '2px', background: COLOR_BORDER }} />
        <Panel id="historyPane" defaultSize="40%" minSize="10%" style={{ overflow: 'hidden' }}>
          <GitHistoryPanel workspaceId={workspaceId} />
        </Panel>
      </Group>
    </div>
  );
}
