import { useState } from 'react';
import { FileTreeContextMenu } from './FileTreeContextMenu';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface FileTreeProps {
  tree: FileNode[];
  onFileSelect: (path: string) => void;
  workspaceId: string;
  onNewFile?: (parentDir: string) => void;
  onNewFolder?: (parentDir: string) => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
}

export function FileTree({ tree, onFileSelect, onNewFile, onNewFolder, onRename, onDelete }: FileTreeProps) {
  return (
    <div data-testid="file-tree" style={{ fontSize: '13px', userSelect: 'none' }}>
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          onFileSelect={onFileSelect}
          depth={0}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  node,
  onFileSelect,
  depth,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: {
  node: FileNode;
  onFileSelect: (path: string) => void;
  depth: number;
  onNewFile?: (parentDir: string) => void;
  onNewFolder?: (parentDir: string) => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

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
      >
        <div
          data-testid={`tree-node-${node.path}`}
          onClick={handleClick}
          style={{
            paddingLeft: `${depth * 16 + 8}px`,
            paddingRight: '8px',
            paddingTop: '2px',
            paddingBottom: '2px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {node.isDirectory && <span style={{ fontSize: '10px' }}>{expanded ? '▼' : '▶'}</span>}
          <span>
            {node.isDirectory ? '📁' : '📄'} {node.name}
          </span>
        </div>
      </FileTreeContextMenu>
      {expanded &&
        node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            onFileSelect={onFileSelect}
            depth={depth + 1}
            onNewFile={onNewFile}
            onNewFolder={onNewFolder}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}
