import { useState, useMemo, memo } from 'react';
import { buildChangeTree } from '../lib/git-change-tree';
import type { ChangeTreeNode } from '../lib/git-change-tree';
import type { GitFileChange } from '@ymir/shared';
import { GIT_STATUS_COLORS, COLOR_TEXT } from '../lib/theme';
import type { GitFileChangeStatus } from '@ymir/shared';
import { GitChangeContextMenu } from './GitChangeContextMenu';

function statusLabel(status?: GitFileChangeStatus): string {
  switch (status) {
    case 'M':
      return 'Modified';
    case 'A':
      return 'Added';
    case 'D':
      return 'Deleted';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    case '??':
      return 'Untracked';
    case '?':
      return 'Untracked';
    default:
      return 'Unknown';
  }
}

interface GitChangeTreeProps {
  changes: GitFileChange[];
  onStageFile?: (path: string) => void;
  onUnstageFile?: (path: string) => void;
  onDiscardFile?: (path: string) => void;
  onStageDirectory?: (path: string) => void;
  onUnstageDirectory?: (path: string) => void;
  onOpenEditor?: (path: string) => void;
  onOpenDiff?: (path: string) => void;
  isStagedSection?: boolean;
}

export function GitChangeTree({
  changes,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageDirectory,
  onUnstageDirectory,
  onOpenEditor,
  onOpenDiff,
  isStagedSection,
}: GitChangeTreeProps) {
  const tree = useMemo(() => buildChangeTree(changes), [changes]);

  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  const toggleCollapsed = (path: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div
      data-testid="git-change-tree"
      role="tree"
      style={{ flex: 1, overflow: 'auto', fontSize: '12px', userSelect: 'none' }}
    >
      {tree.map((node) => (
        <ChangeTreeNodeComponent
          key={node.path}
          node={node}
          depth={0}
          collapsedDirs={collapsedDirs}
          onToggleCollapsed={toggleCollapsed}
          onStageFile={onStageFile}
          onUnstageFile={onUnstageFile}
          onDiscardFile={onDiscardFile}
          onStageDirectory={onStageDirectory}
          onUnstageDirectory={onUnstageDirectory}
          onOpenEditor={onOpenEditor}
          onOpenDiff={onOpenDiff}
          isStagedSection={isStagedSection}
        />
      ))}
    </div>
  );
}

const ChangeTreeNodeComponent = memo(
  function ChangeTreeNodeComponent({
    node,
    depth,
    collapsedDirs,
    onToggleCollapsed,
    onStageFile,
    onUnstageFile,
    onDiscardFile,
    onStageDirectory,
    onUnstageDirectory,
    onOpenEditor,
    onOpenDiff,
    isStagedSection,
    isSelected: _isSelected,
  }: {
    node: ChangeTreeNode;
    depth: number;
    collapsedDirs: Set<string>;
    onToggleCollapsed: (path: string) => void;
    onStageFile?: (path: string) => void;
    onUnstageFile?: (path: string) => void;
    onDiscardFile?: (path: string) => void;
    onStageDirectory?: (path: string) => void;
    onUnstageDirectory?: (path: string) => void;
    onOpenEditor?: (path: string) => void;
    onOpenDiff?: (path: string) => void;
    isStagedSection?: boolean;
    isSelected?: boolean;
  }) {
    const expanded = !collapsedDirs.has(node.path);

    if (node.isDirectory) {
      return (
        <div>
          <GitChangeContextMenu
            path={node.path}
            isDirectory={true}
            isStaged={isStagedSection ?? false}
            onStage={isStagedSection ? undefined : onStageDirectory}
            onUnstage={isStagedSection ? onUnstageDirectory : undefined}
            onOpenEditor={onOpenEditor}
            onOpenDiff={onOpenDiff}
          >
            <div
              data-testid={`change-dir-${node.path}`}
              role="treeitem"
              aria-expanded={expanded}
              onClick={() => onToggleCollapsed(node.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                paddingLeft: `${depth * 8 + 6}px`,
                paddingRight: '8px',
                paddingTop: '2px',
                paddingBottom: '2px',
                cursor: 'pointer',
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
                {expanded ? '▼' : '▶'}
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {node.name}
              </span>
            </div>
          </GitChangeContextMenu>
          {expanded && node.children && (
            <div role="group">
              {node.children.map((child) => (
                <ChangeTreeNodeComponent
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  collapsedDirs={collapsedDirs}
                  onToggleCollapsed={onToggleCollapsed}
                  onStageFile={onStageFile}
                  onUnstageFile={onUnstageFile}
                  onDiscardFile={onDiscardFile}
                  onStageDirectory={onStageDirectory}
                  onUnstageDirectory={onUnstageDirectory}
                  onOpenEditor={onOpenEditor}
                  onOpenDiff={onOpenDiff}
                  isStagedSection={isStagedSection}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    // File node
    return (
      <GitChangeContextMenu
        path={node.path}
        isDirectory={false}
        isStaged={isStagedSection ?? false}
        status={node.status}
        onStage={isStagedSection ? undefined : onStageFile}
        onUnstage={isStagedSection ? onUnstageFile : undefined}
        onDiscard={isStagedSection ? undefined : onDiscardFile}
        onOpenEditor={onOpenEditor}
        onOpenDiff={onOpenDiff}
      >
        <div
          data-testid={`change-file-${node.path}`}
          role="treeitem"
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: `${depth * 8 + 4}px`,
            paddingRight: '8px',
            paddingTop: '2px',
            paddingBottom: '2px',
            cursor: 'pointer',
            gap: '4px',
            outline: 'none',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              color: COLOR_TEXT,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {node.name}
          </span>
          <span
            aria-label={statusLabel(node.status)}
            title={statusLabel(node.status)}
            style={{
              width: 14,
              height: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: GIT_STATUS_COLORS[node.status!],
              flexShrink: 0,
              fontWeight: 600,
              marginLeft: 'auto',
            }}
          >
            {node.status === '??' ? 'U' : node.status}
          </span>
        </div>
      </GitChangeContextMenu>
    );
  },
  (prev, next) => {
    return (
      prev.node.path === next.node.path &&
      prev.node.status === next.node.status &&
      prev.depth === next.depth &&
      prev.isSelected === next.isSelected &&
      prev.isStagedSection === next.isStagedSection &&
      prev.collapsedDirs.has(prev.node.path) === next.collapsedDirs.has(next.node.path) &&
      (prev.node.children?.length ?? 0) === (next.node.children?.length ?? 0)
    );
  },
);
