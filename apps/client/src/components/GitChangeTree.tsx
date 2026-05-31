import { useState, useMemo } from 'react';
import { buildChangeTree } from '../lib/git-change-tree';
import type { ChangeTreeNode } from '../lib/git-change-tree';
import type { GitFileChange } from '@ymir/shared';
import { GIT_STATUS_COLORS, COLOR_TEXT, COLOR_TEXT_MUTED } from '../lib/theme';
import type { GitFileChangeStatus } from '@ymir/shared';
import { GitChangeContextMenu } from './GitChangeContextMenu';

function statusLabel(status?: GitFileChangeStatus): string {
  switch (status) {
    case 'M': return 'Modified';
    case 'A': return 'Added';
    case 'D': return 'Deleted';
    case 'R': return 'Renamed';
    case 'C': return 'Copied';
    case '??': return 'Untracked';
    case '?': return 'Untracked';
    default: return 'Unknown';
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
  isStagedSection,
}: GitChangeTreeProps) {
  const tree = useMemo(() => buildChangeTree(changes), [changes]);

  return (
    <div data-testid="git-change-tree" role="tree" style={{ flex: 1, overflow: 'auto' }}>
      {tree.map((node) => (
        <ChangeTreeNodeComponent
          key={node.path}
          node={node}
          depth={0}
          onStageFile={onStageFile}
          onUnstageFile={onUnstageFile}
          onDiscardFile={onDiscardFile}
          onStageDirectory={onStageDirectory}
          onUnstageDirectory={onUnstageDirectory}
          onOpenEditor={onOpenEditor}
          isStagedSection={isStagedSection}
        />
      ))}
    </div>
  );
}

function ChangeTreeNodeComponent({
  node,
  depth,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageDirectory,
  onUnstageDirectory,
  onOpenEditor,
  isStagedSection,
}: {
  node: ChangeTreeNode;
  depth: number;
  onStageFile?: (path: string) => void;
  onUnstageFile?: (path: string) => void;
  onDiscardFile?: (path: string) => void;
  onStageDirectory?: (path: string) => void;
  onUnstageDirectory?: (path: string) => void;
  onOpenEditor?: (path: string) => void;
  isStagedSection?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

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
        >
          <div
            data-testid={`change-dir-${node.path}`}
            role="treeitem"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: depth * 12 + 4,
              height: 22,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 10, width: 16, color: COLOR_TEXT_MUTED, flexShrink: 0 }}>
              {expanded ? '▼' : '▶'}
            </span>
            <span style={{ color: COLOR_TEXT_MUTED }}>{node.name}</span>
          </div>
        </GitChangeContextMenu>
        {expanded && node.children && (
          <div role="group">
            {node.children.map((child) => (
              <ChangeTreeNodeComponent
                key={child.path}
                node={child}
                depth={depth + 1}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onDiscardFile={onDiscardFile}
                onStageDirectory={onStageDirectory}
                onUnstageDirectory={onUnstageDirectory}
                onOpenEditor={onOpenEditor}
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
    >
      <div
        data-testid={`change-file-${node.path}`}
        role="treeitem"
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: depth * 12 + 4,
          height: 22,
        }}
      >
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
            marginRight: 4,
            fontWeight: 600,
          }}
        >
          {node.status === '??' ? 'U' : node.status}
        </span>
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
      </div>
    </GitChangeContextMenu>
  );
}
