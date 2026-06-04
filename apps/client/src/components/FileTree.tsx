import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { FileNode, GitStatusResponse } from '@ymir/shared';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { FileTreeContext } from './FileTreeContext';
import { buildGitPathMap, computeDirectoryStatus } from '../lib/git-utils';
import { GIT_STATUS_COLORS } from '../lib/theme';

export type { FileNode };

interface FileTreeProps {
  tree: FileNode[];
  onFileSelect: (path: string) => void;
  workspaceId: string;
  gitStatus?: GitStatusResponse | null;
  workspaceRoot?: string;
  selectedPath?: string;
  onNewFile?: (parentDir: string) => void;
  onNewFolder?: (parentDir: string) => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
  onOpenEditor?: (path: string) => void;
  onCut?: (path: string) => void;
  onCopy?: (path: string) => void;
  onPaste?: (targetDir: string) => void;
  clipboardHasItem?: boolean;
  workspaceCwd?: string;
}

export function FileTree({
  tree,
  onFileSelect,
  gitStatus,
  workspaceRoot,
  selectedPath,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onOpenEditor,
  onCut,
  onCopy,
  onPaste,
  clipboardHasItem,
  workspaceCwd,
}: FileTreeProps) {
  const gitPathMap = useMemo(() => buildGitPathMap(gitStatus ?? null), [gitStatus]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const nodeMap = useMemo(() => {
    const map = new Map<string, FileNode>();
    function walk(nodes: FileNode[]) {
      for (const n of nodes) {
        map.set(n.path, n);
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
    return map;
  }, [tree]);

  const lastClickedPathRef = useRef<string | null>(null);
  const onCopyRef = useRef(onCopy);
  const onCutRef = useRef(onCut);
  const onPasteRef = useRef(onPaste);

  useEffect(() => {
    onCopyRef.current = onCopy;
    onCutRef.current = onCut;
    onPasteRef.current = onPaste;
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      const activePath = selectedPath || lastClickedPathRef.current;
      if (!activePath) return;

      if (e.key === 'c' && !e.shiftKey) {
        e.preventDefault();
        onCopyRef.current?.(activePath);
      } else if (e.key === 'x' && !e.shiftKey) {
        e.preventDefault();
        onCutRef.current?.(activePath);
      } else if (e.key === 'v') {
        const node = nodeMap.get(activePath);
        if (node?.isDirectory && clipboardHasItem) {
          e.preventDefault();
          onPasteRef.current?.(activePath);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedPath, nodeMap, clipboardHasItem]);

  const toggleExpanded = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const contextValue = useMemo(
    () => ({
      onNewFile,
      onNewFolder,
      onRename,
      onDelete,
      onOpenEditor,
      onCut,
      onCopy,
      onPaste,
      clipboardHasItem,
      workspaceCwd,
    }),
    [
      onNewFile,
      onNewFolder,
      onRename,
      onDelete,
      onOpenEditor,
      onCut,
      onCopy,
      onPaste,
      clipboardHasItem,
      workspaceCwd,
    ],
  );

  return (
    <FileTreeContext.Provider value={contextValue}>
      <div data-testid="file-tree" role="tree" style={{ fontSize: '12px', userSelect: 'none' }}>
        {tree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            onFileSelect={onFileSelect}
            depth={0}
            gitPathMap={gitPathMap}
            workspaceRoot={workspaceRoot}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onToggleExpanded={toggleExpanded}
            lastClickedPathRef={lastClickedPathRef}
          />
        ))}
      </div>
    </FileTreeContext.Provider>
  );
}

const GIT_STATUS_LABELS: Record<string, string> = {
  '??': 'untracked',
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
};

const FileTreeNode = React.memo(function FileTreeNode({
  node,
  onFileSelect,
  depth,
  gitPathMap,
  workspaceRoot,
  selectedPath,
  expandedPaths,
  onToggleExpanded,
  lastClickedPathRef,
}: {
  node: FileNode;
  onFileSelect: (path: string) => void;
  depth: number;
  gitPathMap: Map<string, { status: string; staged: boolean }>;
  workspaceRoot?: string;
  selectedPath?: string;
  expandedPaths: Set<string>;
  onToggleExpanded: (path: string) => void;
  lastClickedPathRef: React.RefObject<string | null>;
}) {
  const expanded = expandedPaths.has(node.path);

  const isSelected = !node.isDirectory && node.path === selectedPath;

  const relativePath = workspaceRoot ? node.path.slice(workspaceRoot.length + 1) : node.path;
  const gitEntry = gitPathMap.get(relativePath);
  const dirStatus = useMemo(
    () => (node.isDirectory ? computeDirectoryStatus(node, gitPathMap, workspaceRoot || '') : null),
    [node, gitPathMap, workspaceRoot],
  );

  const statusLabel = gitEntry ? GIT_STATUS_LABELS[gitEntry.status] || gitEntry.status : undefined;

  const handleClick = () => {
    lastClickedPathRef.current = node.path;
    if (node.isDirectory) {
      onToggleExpanded(node.path);
    } else {
      onFileSelect(node.path);
    }
  };

  return (
    <div>
      <FileTreeContextMenu path={node.path} isDirectory={node.isDirectory}>
        <div
          data-testid={`tree-node-${node.path}`}
          data-path={node.path}
          role="treeitem"
          tabIndex={0}
          aria-expanded={node.isDirectory ? expanded : undefined}
          aria-selected={isSelected}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
              return;
            }

            if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
              const currentEl = e.currentTarget;
              const treeRoot = currentEl.closest<HTMLElement>('[role="tree"]');
              if (!treeRoot) return;
              const items = Array.from(treeRoot.querySelectorAll<HTMLElement>('[role="treeitem"]'));
              const currentIndex = items.indexOf(currentEl);
              if (currentIndex === -1) return;

              if (e.key === 'ArrowDown') {
                if (currentIndex < items.length - 1) {
                  items[currentIndex + 1].focus();
                }
              } else if (e.key === 'ArrowUp') {
                if (currentIndex > 0) {
                  items[currentIndex - 1].focus();
                }
              } else if (e.key === 'ArrowLeft') {
                if (node.isDirectory && expanded) {
                  onToggleExpanded(node.path);
                } else {
                  const parentGroup = currentEl.closest<HTMLElement>('[role="group"]');
                  if (parentGroup) {
                    const parentItem = parentGroup.closest<HTMLElement>('[role="treeitem"]');
                    if (parentItem) {
                      parentItem.focus();
                    }
                  }
                }
              } else if (e.key === 'ArrowRight') {
                if (node.isDirectory && !expanded) {
                  onToggleExpanded(node.path);
                  requestAnimationFrame(() => {
                    const updatedItems = Array.from(
                      treeRoot.querySelectorAll<HTMLElement>('[role="treeitem"]'),
                    );
                    const idx = updatedItems.indexOf(currentEl);
                    if (idx >= 0 && idx < updatedItems.length - 1) {
                      updatedItems[idx + 1].focus();
                    }
                  });
                } else if (
                  node.isDirectory &&
                  expanded &&
                  node.children &&
                  node.children.length > 0
                ) {
                  if (currentIndex < items.length - 1) {
                    items[currentIndex + 1].focus();
                  }
                }
              }
            }
          }}
          style={{
            paddingLeft: `${depth * 8 + 4}px`,
            paddingRight: '8px',
            paddingTop: '2px',
            paddingBottom: '2px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',

            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              display: 'inline-block',
              width: '10px',
              textAlign: 'center',
            }}
          >
            {node.isDirectory ? (expanded ? '▼' : '▶') : ''}
          </span>
          <span
            style={{
              ...(gitEntry && gitEntry.status === 'D'
                ? { color: '#c74e39', textDecoration: 'line-through' }
                : {}),
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {node.isDirectory ? '📁' : '📄'} {node.name}
          </span>
          {gitEntry && !node.isDirectory && (
            <span
              data-testid="git-status-dot"
              title={statusLabel}
              aria-label={`Git status: ${statusLabel}`}
              style={{
                marginLeft: 'auto',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: GIT_STATUS_COLORS[gitEntry.status] || '#888',
                flexShrink: 0,
              }}
            />
          )}
          {dirStatus && (
            <span
              data-testid="dir-status-dot"
              aria-label="Contains uncommitted changes"
              title="Contains uncommitted changes"
              style={{
                marginLeft: 'auto',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#e2c08d',
                flexShrink: 0,
              }}
            />
          )}
        </div>
      </FileTreeContextMenu>
      {expanded && node.children && (
        <div role="group">
          {node.children.map((child: FileNode) => (
            <FileTreeNode
              key={child.path}
              node={child}
              onFileSelect={onFileSelect}
              depth={depth + 1}
              gitPathMap={gitPathMap}
              workspaceRoot={workspaceRoot}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onToggleExpanded={onToggleExpanded}
              lastClickedPathRef={lastClickedPathRef}
            />
          ))}
        </div>
      )}
    </div>
  );
});
