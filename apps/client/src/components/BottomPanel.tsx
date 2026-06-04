import { useCallback, useEffect, forwardRef } from 'react';
import type { AgentStatus } from '@ymir/shared';
import { useTerminalPane } from '../hooks/useTerminalPane';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { useTerminalPanelHandle } from '../hooks/useTerminalPanel';
import type { TerminalPanelHandle } from '../hooks/useTerminalPanel';
import { TabBar } from './TabBar';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';

export type { TerminalPanelHandle as BottomPanelHandle };

export interface BottomPanelProps {
  workspaceId: string | null;
  scopeKey?: string | null;
  effectiveCwd?: string;
  terminalContainerRef?: React.Ref<HTMLDivElement>;
  onTerminalRegistered?: (terminalId: string, tabId: string, workspaceId: string) => void;
  onTerminalUnregistered?: (terminalId: string) => void;
  onActiveTabChange?: (activeTabId: string | null) => void;
  onMoveToPane?: (tabId: string) => void;
  getAgentStatus?: (tabId: string) => AgentStatus | null;
}

export const BottomPanel = forwardRef<TerminalPanelHandle, BottomPanelProps>(function BottomPanel(
  {
    workspaceId,
    scopeKey,
    effectiveCwd,
    terminalContainerRef,
    onTerminalRegistered,
    onTerminalUnregistered,
    onActiveTabChange,
    onMoveToPane,
    getAgentStatus,
  }: BottomPanelProps,
  ref,
) {
  const {
    tabs,
    activeTabId,
    createTab,
    activateTab,
    updateTabTitle,
    updateTabCwd,
    reorderTabs,
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
    scopeKey: scopeKey ?? null,
    pane: 'bottom',
    onTerminalRegistered,
    onTerminalUnregistered,
    confirmMultipleText: 'terminals? Running processes will be terminated.',
  });

  const handleTerminalCreated = useCallback(
    (terminalId: string, tabId: string) => {
      if (workspaceId) onTerminalRegistered?.(terminalId, tabId, workspaceId);
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

  // Notify parent of activeTabId changes
  useEffect(() => {
    onActiveTabChange?.(activeTabId);
  }, [activeTabId, onActiveTabChange]);

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
      data-testid="bottom-panel"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: COLOR_BG_PRIMARY,
      }}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={activateTab}
        onClose={handleCloseTab}
        onAddTerminal={handleAddTerminal}
        canAddTerminal={!!workspaceId}
        variant="bottom"
        onCloseRight={handleCloseRight}
        onCloseOthers={handleCloseOthers}
        onRename={handleRenameTab}
        onMoveToPane={onMoveToPane}
        getAgentStatus={getAgentStatus}
        group="bottom"
      />
      {/* TerminalManager portals terminals into this container */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div
          ref={terminalContainerRef}
          data-testid="terminal-container"
          style={{ height: '100%', pointerEvents: 'none' }}
        />
        {!activeTabId && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              color: COLOR_TEXT_DIM,
              padding: '8px',
              fontSize: '12px',
              background: COLOR_BG_PRIMARY,
            }}
          >
            No terminal
          </div>
        )}
      </div>
    </div>
  );
});
