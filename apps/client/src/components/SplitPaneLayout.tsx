import { useMemo } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { TerminalPanelHandle } from '../hooks/useTerminalPanel';
import type { LayoutNode, SplitNode } from '../lib/pane-tree';
import { collectPaneIds } from '../lib/pane-tree';
import { COLOR_BORDER } from '../lib/theme';
import { SplitLeafPane } from './SplitLeafPane';

export interface SplitPaneLayoutProps {
  layout: LayoutNode;
  focusedPaneId: string | null;
  workspaceId: string | null;
  scopeKey?: string | null;
  effectiveCwd?: string;
  fileToOpen?: string | null;
  onFileOpened?: () => void;
  fileToDiff?: { filePath: string; repoPath: string; staged: boolean } | null;
  onDiffOpened?: () => void;
  commitToHighlight?: { commitSha?: string; repoPath: string } | null;
  onCommitHighlighted?: () => void;
  onTerminalRegistered?: (
    terminalId: string,
    tabId: string,
    paneId: string,
    workspaceId: string,
  ) => void;
  onTerminalUnregistered?: (terminalId: string) => void;
  onActiveTabChange?: (paneId: string, activeTabId: string | null) => void;
  onFocusPane?: (paneId: string) => void;
  onSplitRight?: (paneId: string, tabId?: string) => void;
  onSplitDown?: (paneId: string, tabId?: string) => void;
  onClosePane?: (paneId: string) => void;
  dirtyFiles?: Set<string>;
  paneHandleRefs: React.MutableRefObject<Map<string, TerminalPanelHandle>>;
  paneContainerRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onLayoutChanged?: () => void;
}

export function SplitPaneLayout({
  layout,
  focusedPaneId,
  workspaceId,
  scopeKey,
  effectiveCwd,
  fileToOpen,
  onFileOpened,
  fileToDiff,
  onDiffOpened,
  commitToHighlight,
  onCommitHighlighted,
  onTerminalRegistered,
  onTerminalUnregistered,
  onActiveTabChange,
  onFocusPane,
  onSplitRight,
  onSplitDown,
  onClosePane,
  dirtyFiles,
  paneHandleRefs,
  paneContainerRefs,
  onLayoutChanged,
}: SplitPaneLayoutProps) {
  const isOnlyPane = useMemo(() => collectPaneIds(layout).length === 1, [layout]);

  function renderLeafPane(paneId: string) {
    return (
      <SplitLeafPane
        ref={(handle: TerminalPanelHandle | null) => {
          if (handle) {
            paneHandleRefs.current.set(paneId, handle);
          } else {
            paneHandleRefs.current.delete(paneId);
          }
        }}
        paneId={paneId}
        workspaceId={workspaceId}
        scopeKey={scopeKey}
        effectiveCwd={effectiveCwd}
        fileToOpen={fileToOpen}
        onFileOpened={onFileOpened}
        fileToDiff={fileToDiff}
        onDiffOpened={onDiffOpened}
        terminalContainerRef={(el: HTMLDivElement | null) => {
          if (el) {
            paneContainerRefs.current.set(paneId, el);
          } else {
            paneContainerRefs.current.delete(paneId);
          }
        }}
        onTerminalRegistered={
          onTerminalRegistered
            ? (terminalId: string, tabId: string, wsId: string) =>
                onTerminalRegistered(terminalId, tabId, paneId, wsId)
            : undefined
        }
        onTerminalUnregistered={onTerminalUnregistered}
        onActiveTabChange={
          onActiveTabChange
            ? (activeTabId: string | null) => onActiveTabChange(paneId, activeTabId)
            : undefined
        }
        commitToHighlight={commitToHighlight}
        onCommitHighlighted={onCommitHighlighted}
        focused={focusedPaneId === paneId}
        onFocus={onFocusPane ? () => onFocusPane(paneId) : undefined}
        onSplitRight={onSplitRight}
        onSplitDown={onSplitDown}
        onClosePane={onClosePane}
        isOnlyPane={isOnlyPane}
        dirtyFiles={dirtyFiles}
      />
    );
  }

  function renderSplitNode(node: SplitNode) {
    return (
      <Group orientation={node.direction} onLayoutChanged={onLayoutChanged}>
        {renderChild(node.children[0], node.sizes[0])}
        <Separator
          style={{
            background: COLOR_BORDER,
            ...(node.direction === 'horizontal' ? { width: 1 } : { height: 1 }),
          }}
        />
        {renderChild(node.children[1], node.sizes[1])}
      </Group>
    );
  }

  function renderChild(child: LayoutNode, size: string) {
    return (
      <Panel id={child.id} minSize="5%" defaultSize={size}>
        {child.type === 'pane' ? renderLeafPane(child.id) : renderSplitNode(child)}
      </Panel>
    );
  }

  if (layout.type === 'pane') {
    return renderLeafPane(layout.id);
  }

  return renderSplitNode(layout);
}
