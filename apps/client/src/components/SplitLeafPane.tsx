import { useState, useCallback, useEffect, forwardRef, useMemo } from 'react';
import { useTerminalPane } from '../hooks/useTerminalPane';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { PaneContent } from './PaneContent';
import { TabBar } from './TabBar';
import { useTerminalPanelHandle } from '../hooks/useTerminalPanel';
import type { TerminalPanelHandle } from '../hooks/useTerminalPanel';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';
import { pathBasename } from '../lib/path-utils';
import { useAgentStatus } from '../hooks/useAgentStatus';
import { sendRequest } from '../lib/send-request';

export interface SplitLeafPaneProps {
  paneId: string;
  workspaceId: string | null;
  scopeKey?: string | null;
  effectiveCwd?: string;
  fileToOpen?: string | null;
  onFileOpened?: () => void;
  fileToDiff?: { filePath: string; repoPath: string; staged: boolean } | null;
  onDiffOpened?: () => void;
  terminalContainerRef?: React.Ref<HTMLDivElement>;
  onTerminalRegistered?: (terminalId: string, tabId: string, workspaceId: string) => void;
  onTerminalUnregistered?: (terminalId: string) => void;
  onActiveTabChange?: (activeTabId: string | null) => void;
  commitToHighlight?: { commitSha?: string; repoPath: string } | null;
  onCommitHighlighted?: () => void;
  focused?: boolean;
  onFocus?: () => void;
  onSplitRight?: (paneId: string, tabId?: string) => void;
  onSplitDown?: (paneId: string, tabId?: string) => void;
  onClosePane?: (paneId: string) => void;
  isOnlyPane?: boolean;
  dirtyFiles?: Set<string>;
}

export type { TerminalPanelHandle as SplitLeafPaneHandle };

export const SplitLeafPane = forwardRef<TerminalPanelHandle, SplitLeafPaneProps>(
  function SplitLeafPane(
    {
      paneId,
      workspaceId,
      scopeKey,
      effectiveCwd,
      fileToOpen,
      onFileOpened,
      fileToDiff,
      onDiffOpened,
      terminalContainerRef,
      onTerminalRegistered,
      onTerminalUnregistered,
      onActiveTabChange,
      commitToHighlight,
      onCommitHighlighted,
      focused,
      onFocus,
      onSplitRight,
      onSplitDown,
      onClosePane,
      isOnlyPane,
      dirtyFiles: externalDirtyFiles,
    }: SplitLeafPaneProps,
    ref,
  ) {
    const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

    const { getStatus, clearStatus, markFocused } = useAgentStatus();

    const {
      tabs,
      activeTabId,
      createTab,
      activateTab: rawActivateTab,
      reorderTabs,
      updateTabTitle,
      updateTabCwd,
      handleCloseTab: rawHandleCloseTab,
      handleCloseRight,
      handleCloseOthers,
      handleRenameTab,
      transferTabOut,
      receiveTab,
      loadRestoredTabs,
      getTabs,
      getActiveTabId,
    } = useTerminalPane({
      workspaceId,
      scopeKey: scopeKey ?? null,
      pane: paneId,
      dirtyFiles: externalDirtyFiles ?? dirtyFiles,
      onTerminalRegistered,
      onTerminalUnregistered,
    });

    // Wrap activateTab to mark agent tabs as focused (done -> idle)
    const activateTab = useCallback(
      (tabId: string) => {
        rawActivateTab(tabId);
        const tab = tabs.find((t) => t.id === tabId);
        if (tab?.type === 'agent' && tab.terminalId) {
          markFocused(tab.terminalId);
        }
      },
      [rawActivateTab, tabs, markFocused],
    );

    // Wrap handleCloseTab to clear agent status on close
    const handleCloseTab = useCallback(
      (tabId: string) => {
        const tab = tabs.find((t) => t.id === tabId);
        if (tab?.type === 'agent' && tab.terminalId) {
          clearStatus(tab.terminalId);
        }
        rawHandleCloseTab(tabId);
      },
      [rawHandleCloseTab, tabs, clearStatus],
    );

    const activeTab = tabs.find((t) => t.id === activeTabId);

    const handleTerminalCreated = useCallback(
      (terminalId: string, tabId: string) => {
        if (workspaceId) {
          onTerminalRegistered?.(terminalId, tabId, workspaceId);
        }
      },
      [onTerminalRegistered, workspaceId],
    );

    const createTerminalTab = useCreateTerminalTab(
      workspaceId,
      tabs,
      createTab,
      handleTerminalCreated,
    );

    const handleAddTerminal = useCallback(
      () => createTerminalTab(effectiveCwd),
      [createTerminalTab, effectiveCwd],
    );

    const handleAddAgent = useCallback(async () => {
      if (!workspaceId) return;
      try {
        const result = await sendRequest<{ terminalId: string }>('terminal.create', {
          workspaceId,
          cols: 80,
          rows: 24,
          command: 'pi',
          cwd: effectiveCwd,
        });
        const tabId = createTab({
          type: 'agent' as const,
          title: 'Agent',
          terminalId: result.terminalId,
        });
        if (onTerminalRegistered && workspaceId) {
          onTerminalRegistered(result.terminalId, tabId, workspaceId);
        }
      } catch (err) {
        console.error('Failed to create agent tab:', err);
      }
    }, [workspaceId, createTab, effectiveCwd, onTerminalRegistered]);

    const handleDirtyChange = useCallback((filePath: string, dirty: boolean) => {
      setDirtyFiles((prev) => {
        if (dirty ? prev.has(filePath) : !prev.has(filePath)) return prev;
        const next = new Set(prev);
        if (dirty) next.add(filePath);
        else next.delete(filePath);
        return next;
      });
    }, []);

    const handleAddEditor = useCallback(
      (filePath: string) => {
        const existing = tabs.find((t) => t.type === 'editor' && t.filePath === filePath);
        if (existing) {
          activateTab(existing.id);
          return;
        }
        createTab({ type: 'editor', title: pathBasename(filePath), filePath });
      },
      [tabs, activateTab, createTab],
    );

    const handleAddDiff = useCallback(
      (filePath: string, repoPath: string, staged: boolean) => {
        const diffRef = staged ? 'staged' : 'unstaged';
        const existing = tabs.find(
          (t) => t.type === 'diff' && t.filePath === filePath && t.diffRef === diffRef,
        );
        if (existing) {
          activateTab(existing.id);
          return;
        }
        const fileName = pathBasename(filePath);
        createTab({
          type: 'diff',
          title: fileName,
          filePath,
          diffRef,
          diffRepoPath: repoPath,
        });
      },
      [tabs, activateTab, createTab],
    );

    const handleAddCommitDiff = useCallback(
      (commitSha: string, parentSha: string, filePath: string, repoPath: string) => {
        const existing = tabs.find(
          (t) =>
            t.type === 'diff' &&
            t.filePath === filePath &&
            t.diffRef === 'commit' &&
            t.commitSha === commitSha,
        );
        if (existing) {
          activateTab(existing.id);
          return;
        }
        const fileName = pathBasename(filePath);
        createTab({
          type: 'diff',
          title: fileName,
          filePath,
          diffRef: 'commit',
          diffRepoPath: repoPath,
          commitSha,
          parentSha,
        });
      },
      [tabs, activateTab, createTab],
    );

    // Notify parent of activeTabId changes
    useEffect(() => {
      onActiveTabChange?.(activeTabId);
    }, [activeTabId, onActiveTabChange]);

    useEffect(() => {
      if (fileToOpen) {
        handleAddEditor(fileToOpen);
        onFileOpened?.();
      }
    }, [fileToOpen, handleAddEditor, onFileOpened]);

    useEffect(() => {
      if (fileToDiff) {
        handleAddDiff(fileToDiff.filePath, fileToDiff.repoPath, fileToDiff.staged);
        onDiffOpened?.();
      }
    }, [fileToDiff, handleAddDiff, onDiffOpened]);

    useEffect(() => {
      if (!commitToHighlight) return;
      // Find or create a git-tree tab for this repoPath
      const existing = tabs.find(
        (t) => t.type === 'git-tree' && t.repoPath === commitToHighlight.repoPath,
      );
      if (existing) {
        activateTab(existing.id);
      } else {
        createTab({
          type: 'git-tree',
          title: 'Git',
          repoPath: commitToHighlight.repoPath,
        });
      }
      // Delay the clear so GitTreeTab receives the SHA in at least one render
      const timer = setTimeout(() => onCommitHighlighted?.(), 100);
      return () => clearTimeout(timer);
    }, [commitToHighlight, tabs, activateTab, createTab, onCommitHighlighted]);

    useTerminalPanelHandle(ref, {
      transferTabOut,
      receiveTab,
      loadRestoredTabs,
      reorderTabs,
      getTabs,
      getActiveTabId,
      updateTabTitle,
      updateTabCwd,
    });

    // Build agent status map for TabBar
    const agentStatusMap = useMemo(() => {
      const map = new Map<string, 'idle' | 'working' | 'done' | 'waiting-for-input'>();
      for (const tab of tabs) {
        if (tab.type === 'agent' && tab.terminalId) {
          const status = getStatus(tab.terminalId);
          if (status) map.set(tab.terminalId, status);
        }
      }
      return map;
    }, [tabs, getStatus]);

    return (
      <div
        data-testid={`split-leaf-pane-${paneId}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          border: focused ? '1px solid var(--accent-dim)' : '1px solid transparent',
          boxSizing: 'border-box',
        }}
        onMouseDown={onFocus}
      >
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={activateTab}
          onClose={handleCloseTab}
          onAddTerminal={handleAddTerminal}
          canAddTerminal={!!workspaceId}
          variant="content"
          onCloseRight={handleCloseRight}
          onCloseOthers={handleCloseOthers}
          onRename={handleRenameTab}
          group={paneId}
          onSplitRight={onSplitRight ? (tabId) => onSplitRight(paneId, tabId) : undefined}
          onSplitDown={onSplitDown ? (tabId) => onSplitDown(paneId, tabId) : undefined}
          onClosePane={onClosePane ? () => onClosePane(paneId) : undefined}
          canClosePane={!isOnlyPane}
          agentStatusMap={agentStatusMap}
        />
        <PaneContent
          activeTab={activeTab}
          terminalContainerRef={terminalContainerRef}
          workspaceId={workspaceId}
          commitToHighlight={commitToHighlight}
          onDirtyChange={handleDirtyChange}
          onOpenEditor={handleAddEditor}
          onOpenCommitDiff={handleAddCommitDiff}
          onOpenAgent={handleAddAgent}
          emptyState={
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: COLOR_TEXT_DIM,
                background: COLOR_BG_PRIMARY,
              }}
            >
              <span>No tabs open</span>
              <button
                onClick={handleAddTerminal}
                disabled={!workspaceId}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '6px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                  opacity: workspaceId ? 1 : 0.5,
                }}
              >
                Open Terminal
              </button>
            </div>
          }
        />
      </div>
    );
  },
);
