import { useMemo, useState } from 'react';
import type { FileNode, GitStatusResponse } from '@ymir/shared';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { buildGitPathMap, computeDirectoryStatus, GIT_STATUS_COLORS } from '../lib/git-tree-status';
import './FileTreeContextMenu.css';

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
}: FileTreeProps) {
  const gitPathMap = useMemo(() => buildGitPathMap(gitStatus), [gitStatus]);

  return (
    <div data-testid="file-tree" role="tree" style={{ fontSize: '13px', userSelect: 'none' }}>
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          onFileSelect={onFileSelect}
          depth={0}
          gitPathMap={gitPathMap}
          workspaceRoot={workspaceRoot}
          selectedPath={selectedPath}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onRename={onRename}
          onDelete={onDelete}
          onOpenEditor={onOpenEditor}
        />
      ))}
    </div>
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

function FileTreeNode({
  node,
  onFileSelect,
  depth,
  gitPathMap,
  workspaceRoot,
  selectedPath,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onOpenEditor,
}: {
  node: FileNode;
  onFileSelect: (path: string) => void;
  depth: number;
  gitPathMap: Map<string, { status: string; staged: boolean }>;
  workspaceRoot?: string;
  selectedPath?: string;
  onNewFile?: (parentDir: string) => void;
  onNewFolder?: (parentDir: string) => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
  onOpenEditor?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isSelected = !node.isDirectory && node.path === selectedPath;

  const relativePath = workspaceRoot ? node.path.slice(workspaceRoot.length + 1) : node.path;
  const gitEntry = gitPathMap.get(relativePath);
  const dirStatus = useMemo(
    () => (node.isDirectory ? computeDirectoryStatus(node, gitPathMap, workspaceRoot || '') : null),
    [node, gitPathMap, workspaceRoot],
  );

  const statusLabel = gitEntry ? GIT_STATUS_LABELS[gitEntry.status] || gitEntry.status : undefined;

  const handleClick = () => {
    if (node.isDirectory) {
      setExpanded(!expanded);
    } else {
      onFileSelect(node.path);
    }
  };

  return (
    <div>
      <FileTreeContextMenu
        path={node.path}
        isDirectory={node.isDirectory}
        onNewFile={onNewFile}
        onNewFolder={onNewFolder}
        onRename={onRename}
        onDelete={onDelete}
        onOpenEditor={onOpenEditor}
      >
        <div
          data-testid={`tree-node-${node.path}`}
          role="treeitem"
          tabIndex={0}
          aria-expanded={node.isDirectory ? expanded : undefined}
          aria-selected={isSelected}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            }
          }}
          style={{
            paddingLeft: `${depth * 16 + 8}px`,
            paddingRight: '8px',
            paddingTop: '2px',
            paddingBottom: '2px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            outline: 'none',
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
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onRename={onRename}
              onDelete={onDelete}
              onOpenEditor={onOpenEditor}
            />
          ))}
        </div>
      )}
    </div>
  );
}
