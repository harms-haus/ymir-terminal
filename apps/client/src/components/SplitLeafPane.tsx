import { useState, useCallback, useEffect, forwardRef } from 'react';
import type { AgentStatus } from '@ymir/shared';
import { useTerminalPane } from '../hooks/useTerminalPane';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { DiffViewer } from './DiffViewer';
import { EditorPane } from './EditorPane';
import { GitTreeTab } from './GitTreeTab';
import { TabBar } from './TabBar';
import { useTerminalPanelHandle } from '../hooks/useTerminalPanel';
import type { TerminalPanelHandle } from '../hooks/useTerminalPanel';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';
import { pathBasename } from '../lib/path-utils';

export interface SplitLeafPaneProps {
  paneId: string;
  workspaceId: string | null;
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
  getAgentStatus?: (tabId: string) => AgentStatus | null;
}

export type { TerminalPanelHandle as SplitLeafPaneHandle };

export const SplitLeafPane = forwardRef<TerminalPanelHandle, SplitLeafPaneProps>(
  function SplitLeafPane(
    {
      paneId,
      workspaceId,
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
      getAgentStatus,
    }: SplitLeafPaneProps,
    ref,
  ) {
    const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

    const {
      tabs,
      activeTabId,
      createTab,
      activateTab,
      reorderTabs,
      updateTabTitle,
      updateTabCwd,
      handleCloseTab,
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
      pane: paneId,
      dirtyFiles: externalDirtyFiles ?? dirtyFiles,
      onTerminalRegistered,
      onTerminalUnregistered,
    });

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
          getAgentStatus={getAgentStatus}
        />
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* TerminalManager portals terminals into this container */}
          <div
            ref={terminalContainerRef}
            data-testid="terminal-container"
            style={{ height: '100%', pointerEvents: 'none' }}
          />
          {activeTab?.type === 'editor' && activeTab.filePath && workspaceId && (
            <div style={{ position: 'absolute', inset: 0, background: COLOR_BG_PRIMARY }}>
              <EditorPane
                key={activeTab.filePath}
                workspaceId={workspaceId}
                filePath={activeTab.filePath}
                onDirtyChange={handleDirtyChange}
              />
            </div>
          )}
          {activeTab?.type === 'diff' &&
            activeTab.filePath &&
            workspaceId &&
            activeTab.diffRepoPath && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: COLOR_BG_PRIMARY,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <DiffViewer
                  key={`${activeTab.filePath}-${activeTab.diffRef}`}
                  workspaceId={workspaceId}
                  repoPath={activeTab.diffRepoPath}
                  filePath={activeTab.filePath}
                  staged={activeTab.diffRef === 'staged'}
                  onOpenEditor={handleAddEditor}
                  commitSha={activeTab.diffRef === 'commit' ? activeTab.commitSha : undefined}
                  parentSha={activeTab.diffRef === 'commit' ? activeTab.parentSha : undefined}
                />
              </div>
            )}
          {activeTab?.type === 'git-tree' && activeTab.repoPath != null && workspaceId && (
            <div style={{ position: 'absolute', inset: 0, background: COLOR_BG_PRIMARY }}>
              <GitTreeTab
                workspaceId={workspaceId}
                repoPath={activeTab.repoPath}
                highlightCommitSha={commitToHighlight?.commitSha ?? null}
                onOpenCommitDiff={(commitSha, parentSha, filePath) =>
                  handleAddCommitDiff(commitSha, parentSha, filePath, activeTab.repoPath!)
                }
              />
            </div>
          )}
          {!activeTab && (
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
          )}
        </div>
      </div>
    );
  },
);
