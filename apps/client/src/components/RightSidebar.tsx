import '@vscode/codicons/dist/codicon.css';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { GroupImperativeHandle } from 'react-resizable-panels';
import { FileTree } from './FileTree';
import { GitPanel } from './GitPanel';
import { GitHistoryPanel } from './GitHistoryPanel';
import { SearchPanel } from './SearchPanel';
import { sendRequest } from '../lib/send-request';
import { useFileChange } from '../hooks/useFileChange';
import { useGitStatusSubscription } from '../hooks/git';
import { usePrompt } from '../hooks/useDialog';
import type { FileNode } from '@ymir/shared';
import type { GitStatusResponse } from '@ymir/shared';
import { mergeDeletedFiles } from '../lib/git-utils';
import { joinPath, pathBasename, pathDirname } from '../lib/path-utils';
import { useFileClipboard } from '../contexts/FileClipboardContext';
import {
  COLOR_ACCENT,
  COLOR_BORDER,
  COLOR_ERROR,
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  TITLE_BAR_HEIGHT,
} from '../lib/theme';

interface RightSidebarProps {
  workspaceId: string | null;
  onFileSelect: (path: string) => void;
  workspaceCwd?: string;
  onOpenDiff?: (filePath: string, repoPath: string, staged: boolean) => void;
  onOpenGitTree?: (repoPath: string) => void;
  onCommitClick?: (commitSha: string) => void;
  onSearchResultClick?: (filePath: string, lineNumber: number) => void;
}

export function RightSidebar({
  workspaceId,
  onFileSelect,
  workspaceCwd,
  onOpenDiff,
  onOpenGitTree,
  onCommitClick,
  onSearchResultClick,
}: RightSidebarProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topView, setTopView] = useState<'tree' | 'changes' | 'search'>('tree');
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const explorerGroupRef = useRef<GroupImperativeHandle>(null);
  const sizesLoadedRef = useRef(false);

  const { clipboard, cut, copy, paste } = useFileClipboard();

  const prompt = usePrompt();

  // Subscribe to push-based git status updates
  const handleGitStatusPush = useCallback((repoPath: string, status: GitStatusResponse) => {
    setGitStatus(status);
  }, []);

  useGitStatusSubscription(workspaceId, handleGitStatusPush);

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

    sendRequest<{ tree: FileNode[] }>(
      'file.tree',
      { workspaceId, includeHidden: true, ...(workspaceCwd ? { path: workspaceCwd } : {}) },
      { signal },
    )
      .then((res) => {
        setFileTree(res.tree);
      })
      .catch((err) => {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      });

    sendRequest<GitStatusResponse>(
      'git.status',
      { workspaceId, ...(workspaceCwd ? { repoPath: workspaceCwd } : {}) },
      { signal },
    )
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
  }, [workspaceId, workspaceCwd]);

  const refreshFileTree = useCallback(() => {
    if (!workspaceId) return;
    sendRequest<{ tree: FileNode[] }>('file.tree', {
      workspaceId,
      includeHidden: true,
      ...(workspaceCwd ? { path: workspaceCwd } : {}),
    })
      .then((res) => setFileTree(res.tree))
      .catch(handleAsyncError);
  }, [workspaceId, workspaceCwd]);

  const handleFileChange = useCallback(() => {
    refreshFileTree();
  }, [refreshFileTree]);

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
    async (parentDir: string) => {
      const name = await prompt({
        title: 'New File',
        message: 'Enter file name:',
        placeholder: 'file.txt',
      });
      if (!name || !workspaceId) return;
      sendRequest('file.create', {
        workspaceId,
        path: joinPath(parentDir, name),
        isDirectory: false,
      })
        .then(refreshFileTree)
        .catch(handleAsyncError);
    },
    [workspaceId, refreshFileTree, prompt],
  );

  const handleNewFolder = useCallback(
    async (parentDir: string) => {
      const name = await prompt({
        title: 'New Folder',
        message: 'Enter folder name:',
        placeholder: 'folder',
      });
      if (!name || !workspaceId) return;
      sendRequest('file.create', {
        workspaceId,
        path: joinPath(parentDir, name),
        isDirectory: true,
      })
        .then(refreshFileTree)
        .catch(handleAsyncError);
    },
    [workspaceId, refreshFileTree, prompt],
  );

  const handleRename = useCallback(
    async (path: string) => {
      const oldName = pathBasename(path) || '';
      const newName = await prompt({
        title: 'Rename',
        message: 'Enter new name:',
        defaultValue: oldName,
      });
      if (!newName || !workspaceId) return;
      const parentDir = pathDirname(path);
      sendRequest('file.rename', {
        workspaceId,
        oldPath: path,
        newPath: joinPath(parentDir, newName),
      })
        .then(refreshFileTree)
        .catch(handleAsyncError);
    },
    [workspaceId, refreshFileTree, prompt],
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

  const handleCut = useCallback(
    (path: string) => {
      if (!workspaceId) return;
      cut(path, workspaceId);
    },
    [workspaceId, cut],
  );

  const handleCopy = useCallback(
    (path: string) => {
      if (!workspaceId) return;
      copy(path, workspaceId);
    },
    [workspaceId, copy],
  );

  const handlePaste = useCallback(
    async (targetDir: string) => {
      if (!workspaceId) return;
      await paste(targetDir, workspaceId);
      refreshFileTree();
    },
    [workspaceId, paste, refreshFileTree],
  );

  return (
    <>
      <style>{`
        [data-testid='right-sidebar'] [data-separator]:hover {
          background: #555 !important;
        }
        [data-testid='right-sidebar-content'] button:focus-visible {
          outline: 2px solid var(--accent, #007acc);
          outline-offset: 1px;
        }
      `}</style>
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
          <div
            role="tablist"
            aria-label="Project sidebar views"
            style={{ display: 'flex', alignItems: 'center', gap: 0 }}
          >
            <button
              data-testid="toggle-file-tree"
              title="File Explorer"
              aria-label="File Explorer"
              role="tab"
              aria-selected={topView === 'tree'}
              aria-controls="project-sidebar-panel"
              onClick={() => setTopView('tree')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom:
                  topView === 'tree' ? `2px solid ${COLOR_ACCENT}` : '2px solid transparent',
                color: topView === 'tree' ? COLOR_TEXT : COLOR_TEXT_MUTED,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '14px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span className="codicon codicon-files" />
            </button>
            <button
              data-testid="toggle-git-changes"
              title="Source Control"
              aria-label="Source Control"
              role="tab"
              aria-selected={topView === 'changes'}
              aria-controls="project-sidebar-panel"
              onClick={() => setTopView('changes')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom:
                  topView === 'changes' ? `2px solid ${COLOR_ACCENT}` : '2px solid transparent',
                color: topView === 'changes' ? COLOR_TEXT : COLOR_TEXT_MUTED,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '14px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span className="codicon codicon-source-control" />
            </button>
            <button
              data-testid="toggle-file-search"
              title="Search"
              aria-label="Search"
              role="tab"
              aria-selected={topView === 'search'}
              aria-controls="project-sidebar-panel"
              onClick={() => setTopView('search')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom:
                  topView === 'search' ? `2px solid ${COLOR_ACCENT}` : '2px solid transparent',
                color: topView === 'search' ? COLOR_TEXT : COLOR_TEXT_MUTED,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '14px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span className="codicon codicon-search" />
            </button>
          </div>
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
          <Panel
            id="topPane"
            defaultSize="60%"
            minSize="20%"
            style={{ overflow: 'auto' }}
            role="tabpanel"
            aria-labelledby="toggle-file-tree"
          >
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
                  onCut={handleCut}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  clipboardHasItem={clipboard.mode !== null}
                  workspaceCwd={workspaceCwd}
                />
              ) : (
                <div style={{ padding: '8px', color: COLOR_TEXT_MUTED }}>No workspace selected</div>
              )
            ) : topView === 'changes' ? (
              <GitPanel
                workspaceId={workspaceId}
                workspaceCwd={workspaceCwd ?? null}
                onOpenEditor={onFileSelect}
                onOpenDiff={onOpenDiff}
                onOpenGitTree={onOpenGitTree}
              />
            ) : (
              <SearchPanel
                workspaceId={workspaceId}
                workspaceCwd={workspaceCwd}
                onFileSelect={onFileSelect}
                onResultClick={(filePath, lineNumber) => {
                  if (onSearchResultClick) {
                    onSearchResultClick(filePath, lineNumber);
                  } else {
                    onFileSelect(filePath);
                  }
                }}
              />
            )}
          </Panel>
          <Separator style={{ height: '2px', background: COLOR_BORDER }} />
          <Panel id="historyPane" defaultSize="40%" minSize="10%" style={{ overflow: 'hidden' }}>
            <GitHistoryPanel
              workspaceId={workspaceId}
              workspaceCwd={workspaceCwd}
              onCommitClick={onCommitClick}
            />
          </Panel>
        </Group>
      </div>
    </>
  );
}
