import { useEffect, useMemo, useState, useCallback } from 'react';
import type { AgentStatus } from '@ymir/shared';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { TerminalPanelHandle } from '../hooks/useTerminalPanel';
import type { LayoutNode, SplitNode } from '../lib/pane-tree';
import { collectPaneIds } from '../lib/pane-tree';
import { COLOR_BORDER } from '../lib/theme';
import { useStableCallback } from '../hooks/useStableCallback';
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
  getAgentStatus?: (tabId: string) => AgentStatus | null;
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
  getAgentStatus,
}: SplitPaneLayoutProps) {
  const isOnlyPane = useMemo(() => collectPaneIds(layout).length === 1, [layout]);

  // --------------------------------------------------------------------------
  // Stable ref callbacks — created once per paneId to avoid tearing down and
  // rebuilding the ref on every render. Using useState (lazy init) gives a
  // stable mutable Map whose values are read during render.
  // --------------------------------------------------------------------------
  const [paneRefCache] = useState<Map<string, (handle: TerminalPanelHandle | null) => void>>(
    () => new Map(),
  );
  const [containerRefCache] = useState<Map<string, (el: HTMLDivElement | null) => void>>(
    () => new Map(),
  );

  const getPaneRef = useCallback(
    (paneId: string) => {
      let cb = paneRefCache.get(paneId);
      if (!cb) {
        cb = (handle: TerminalPanelHandle | null) => {
          if (handle) paneHandleRefs.current.set(paneId, handle);
          else paneHandleRefs.current.delete(paneId);
        };
        paneRefCache.set(paneId, cb);
      }
      return cb;
    },
    [paneRefCache, paneHandleRefs],
  );

  const getContainerRef = useCallback(
    (paneId: string) => {
      let cb = containerRefCache.get(paneId);
      if (!cb) {
        cb = (el: HTMLDivElement | null) => {
          if (el) paneContainerRefs.current.set(paneId, el);
          else paneContainerRefs.current.delete(paneId);
        };
        containerRefCache.set(paneId, cb);
      }
      return cb;
    },
    [containerRefCache, paneContainerRefs],
  );

  // --------------------------------------------------------------------------
  // Stable base-handler wrappers so the paneId-bound cached callbacks always
  // delegate to the latest prop values without changing identity.
  // --------------------------------------------------------------------------
  const stableOnTerminalRegistered = useStableCallback(
    onTerminalRegistered ??
      ((_terminalId: string, _tabId: string, _paneId: string, _wsId: string) => {}),
  );
  const stableOnActiveTabChange = useStableCallback(
    onActiveTabChange ?? ((_paneId: string, _activeTabId: string | null) => {}),
  );
  const stableOnFocusPane = useStableCallback(onFocusPane ?? ((_paneId: string) => {}));

  // --------------------------------------------------------------------------
  // Stable paneId-bound handler caches
  // --------------------------------------------------------------------------
  const [termRegCache] = useState<
    Map<string, (terminalId: string, tabId: string, wsId: string) => void>
  >(() => new Map());
  const [tabChangeCache] = useState<Map<string, (activeTabId: string | null) => void>>(
    () => new Map(),
  );
  const [focusCache] = useState<Map<string, () => void>>(() => new Map());

  const getTerminalRegistered = useCallback(
    (paneId: string) => {
      if (!onTerminalRegistered) return undefined;
      let cb = termRegCache.get(paneId);
      if (!cb) {
        cb = (terminalId: string, tabId: string, wsId: string) => {
          stableOnTerminalRegistered(terminalId, tabId, paneId, wsId);
        };
        termRegCache.set(paneId, cb);
      }
      return cb;
    },
    [termRegCache, onTerminalRegistered, stableOnTerminalRegistered],
  );

  const getActiveTabChange = useCallback(
    (paneId: string) => {
      if (!onActiveTabChange) return undefined;
      let cb = tabChangeCache.get(paneId);
      if (!cb) {
        cb = (activeTabId: string | null) => {
          stableOnActiveTabChange(paneId, activeTabId);
        };
        tabChangeCache.set(paneId, cb);
      }
      return cb;
    },
    [tabChangeCache, onActiveTabChange, stableOnActiveTabChange],
  );

  const getFocusPane = useCallback(
    (paneId: string) => {
      if (!onFocusPane) return undefined;
      let cb = focusCache.get(paneId);
      if (!cb) {
        cb = () => {
          stableOnFocusPane(paneId);
        };
        focusCache.set(paneId, cb);
      }
      return cb;
    },
    [focusCache, onFocusPane, stableOnFocusPane],
  );

  // --------------------------------------------------------------------------
  // Clean up stale cache entries when layout changes (panes removed)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const currentPaneIds = new Set(collectPaneIds(layout));
    const clean = <T,>(cache: Map<string, T>) => {
      for (const [paneId] of cache) {
        if (!currentPaneIds.has(paneId)) cache.delete(paneId);
      }
    };
    clean(paneRefCache);
    clean(containerRefCache);
    clean(termRegCache);
    clean(tabChangeCache);
    clean(focusCache);
  }, [layout, paneRefCache, containerRefCache, termRegCache, tabChangeCache, focusCache]);

  // --------------------------------------------------------------------------
  // Render helpers
  // --------------------------------------------------------------------------
  function renderLeafPane(paneId: string) {
    return (
      <SplitLeafPane
        ref={getPaneRef(paneId)}
        paneId={paneId}
        workspaceId={workspaceId}
        scopeKey={scopeKey}
        effectiveCwd={effectiveCwd}
        fileToOpen={fileToOpen}
        onFileOpened={onFileOpened}
        fileToDiff={fileToDiff}
        onDiffOpened={onDiffOpened}
        terminalContainerRef={getContainerRef(paneId)}
        onTerminalRegistered={getTerminalRegistered(paneId)}
        onTerminalUnregistered={onTerminalUnregistered}
        onActiveTabChange={getActiveTabChange(paneId)}
        commitToHighlight={commitToHighlight}
        onCommitHighlighted={onCommitHighlighted}
        focused={focusedPaneId === paneId}
        onFocus={getFocusPane(paneId)}
        onSplitRight={onSplitRight}
        onSplitDown={onSplitDown}
        onClosePane={onClosePane}
        isOnlyPane={isOnlyPane}
        dirtyFiles={dirtyFiles}
        getAgentStatus={getAgentStatus}
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
