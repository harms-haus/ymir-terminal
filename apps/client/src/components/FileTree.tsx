import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FileNode, GitStatusResponse } from '@ymir/shared';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { buildGitPathMap, computeDirectoryStatus } from '../lib/git-utils';
import { GIT_STATUS_COLORS } from '../lib/theme';

export type { FileNode };

// ── Flat tree helpers ─────────────────────────────────────────────────────

interface FlatTreeNode {
  node: FileNode;
  depth: number;
}

function flattenTree(nodes: FileNode[], expandedPaths: Set<string>): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];
  function walk(items: FileNode[], depth: number) {
    for (const node of items) {
      result.push({ node, depth });
      if (node.isDirectory && expandedPaths.has(node.path) && node.children) {
        walk(node.children, depth + 1);
      }
    }
  }
  walk(nodes, 0);
  return result;
}

// ── Constants ─────────────────────────────────────────────────────────────

const ROW_HEIGHT = 24;

// ── Props ─────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      const activePath = selectedPath || lastClickedPathRef.current;
      if (!activePath) return;

      if (e.key === 'c' && !e.shiftKey) {
        e.preventDefault();
        onCopy?.(activePath);
      } else if (e.key === 'x' && !e.shiftKey) {
        e.preventDefault();
        onCut?.(activePath);
      } else if (e.key === 'v') {
        const node = nodeMap.get(activePath);
        if (node?.isDirectory && clipboardHasItem) {
          e.preventDefault();
          onPaste?.(activePath);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedPath, nodeMap, onCopy, onCut, onPaste, clipboardHasItem]);

  const toggleExpanded = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // ── Virtualization ─────────────────────────────────────────────────────

  const parentRef = useRef<HTMLDivElement>(null);

  const flatNodes = useMemo(() => flattenTree(tree, expandedPaths), [tree, expandedPaths]);

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index: number) => flatNodes[index]?.node.path ?? index,
    measureElement: (el: HTMLElement) => el.getBoundingClientRect().height,
    // Provide a fallback viewport size for test environments (e.g. happy-dom)
    // that don't compute CSS layout. The ResizeObserver will report the
    // actual size once available.
    initialRect: { width: 400, height: 500 },
    observeElementRect: (instance, cb) => {
      // Skip synchronous getRect(…) to avoid setting scrollRect to 0 in
      // environments where offsetHeight is not computed yet. Instead,
      // initialRect is used until ResizeObserver reports the real size.
      const element = instance.scrollElement;
      if (!element) return;
      const targetWindow = instance.targetWindow;
      if (!targetWindow || !targetWindow.ResizeObserver) return () => {};
      const observer = new targetWindow.ResizeObserver((entries) => {
        for (const entry of entries) {
          const run = () => {
            const box = entry.borderBoxSize?.[0];
            if (box) {
              cb({ width: Math.round(box.inlineSize), height: Math.round(box.blockSize) });
            } else {
              cb({
                width: Math.round(entry.contentRect.width),
                height: Math.round(entry.contentRect.height),
              });
            }
          };
          if (instance.options.useAnimationFrameWithResizeObserver) {
            requestAnimationFrame(run);
          } else {
            run();
          }
        }
      });
      observer.observe(element, { box: 'border-box' });
      return () => observer.unobserve(element);
    },
  });

  return (
    <div
      data-testid="file-tree"
      role="tree"
      style={{
        fontSize: '12px',
        userSelect: 'none',
        height: '100%',
        position: 'relative',
      }}
    >
      <div
        ref={parentRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const { node, depth } = flatNodes[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TreeRow
                  node={node}
                  depth={depth}
                  onFileSelect={onFileSelect}
                  selectedPath={selectedPath}
                  expandedPaths={expandedPaths}
                  onToggleExpanded={toggleExpanded}
                  gitPathMap={gitPathMap}
                  workspaceRoot={workspaceRoot}
                  onNewFile={onNewFile}
                  onNewFolder={onNewFolder}
                  onRename={onRename}
                  onDelete={onDelete}
                  onOpenEditor={onOpenEditor}
                  onCut={onCut}
                  onCopy={onCopy}
                  onPaste={onPaste}
                  clipboardHasItem={clipboardHasItem}
                  workspaceCwd={workspaceCwd}
                  lastClickedPathRef={lastClickedPathRef}
                />
              </div>
            );
          })}
        </div>
        {flatNodes.length === 0 && (
          <div style={{ padding: 8, color: '#888', fontSize: 12 }}>Empty directory</div>
        )}
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────

const GIT_STATUS_LABELS: Record<string, string> = {
  '??': 'untracked',
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
};

// ── TreeRow (individual tree node, rendered as a flat virtual row) ───────

interface TreeRowProps {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
  expandedPaths: Set<string>;
  onToggleExpanded: (path: string) => void;
  gitPathMap: Map<string, { status: string; staged: boolean }>;
  workspaceRoot?: string;
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
  lastClickedPathRef: React.RefObject<string | null>;
}

const TreeRow = React.memo(
  function TreeRow({
    node,
    depth,
    onFileSelect,
    selectedPath,
    expandedPaths,
    onToggleExpanded,
    gitPathMap,
    workspaceRoot,
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
    lastClickedPathRef,
  }: TreeRowProps) {
    const expanded = expandedPaths.has(node.path);

    const isSelected = !node.isDirectory && node.path === selectedPath;

    const relativePath = workspaceRoot ? node.path.slice(workspaceRoot.length + 1) : node.path;
    const gitEntry = gitPathMap.get(relativePath);
    const dirStatus = useMemo(
      () =>
        node.isDirectory ? computeDirectoryStatus(node, gitPathMap, workspaceRoot || '') : null,
      [node, gitPathMap, workspaceRoot],
    );

    const statusLabel = gitEntry
      ? GIT_STATUS_LABELS[gitEntry.status] || gitEntry.status
      : undefined;

    const handleClick = () => {
      lastClickedPathRef.current = node.path;
      if (node.isDirectory) {
        onToggleExpanded(node.path);
      } else {
        onFileSelect(node.path);
      }
    };

    return (
      <FileTreeContextMenu
        path={node.path}
        isDirectory={node.isDirectory}
        onNewFile={onNewFile}
        onNewFolder={onNewFolder}
        onRename={onRename}
        onDelete={onDelete}
        onOpenEditor={onOpenEditor}
        onCut={onCut}
        onCopy={onCopy}
        onPaste={onPaste}
        clipboardHasItem={clipboardHasItem}
        workspaceCwd={workspaceCwd}
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
            paddingLeft: `${depth * 8 + 4}px`,
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
    );
  },
  (prevProps, nextProps) => {
    // Node identity
    if (prevProps.node.path !== nextProps.node.path) return false;
    if (prevProps.node.isDirectory !== nextProps.node.isDirectory) return false;

    // Layout
    if (prevProps.depth !== nextProps.depth) return false;

    // Expanded state — controls chevron direction
    const prevExpanded = prevProps.expandedPaths.has(prevProps.node.path);
    const nextExpanded = nextProps.expandedPaths.has(nextProps.node.path);
    if (prevExpanded !== nextExpanded) return false;

    // Selection state — controls aria-selected attribute
    const prevSelected =
      !prevProps.node.isDirectory && prevProps.node.path === prevProps.selectedPath;
    const nextSelected =
      !nextProps.node.isDirectory && nextProps.node.path === nextProps.selectedPath;
    if (prevSelected !== nextSelected) return false;

    // Git status — controls colour dot and text decoration
    const prevRelPath = prevProps.workspaceRoot
      ? prevProps.node.path.slice(prevProps.workspaceRoot.length + 1)
      : prevProps.node.path;
    const nextRelPath = nextProps.workspaceRoot
      ? nextProps.node.path.slice(nextProps.workspaceRoot.length + 1)
      : nextProps.node.path;
    const prevGitEntry = prevProps.gitPathMap.get(prevRelPath);
    const nextGitEntry = nextProps.gitPathMap.get(nextRelPath);
    if ((prevGitEntry?.status ?? null) !== (nextGitEntry?.status ?? null)) return false;

    // Directory status depends on children — use children length as proxy
    if ((prevProps.node.children?.length ?? 0) !== (nextProps.node.children?.length ?? 0))
      return false;

    // workspaceRoot — affects git relative path computation
    if (prevProps.workspaceRoot !== nextProps.workspaceRoot) return false;

    // clipboardHasItem — controls "Paste" option visibility in context menu
    if (prevProps.clipboardHasItem !== nextProps.clipboardHasItem) return false;

    // workspaceCwd — used by context menu for "Copy Path" items
    if (prevProps.workspaceCwd !== nextProps.workspaceCwd) return false;

    return true;
  },
);
