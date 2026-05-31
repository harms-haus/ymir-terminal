import { useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Tab } from '../hooks/useTabs';
import { useTerminalPane } from '../hooks/useTerminalPane';
import { useCreateTerminalTab } from '../hooks/useCreateTerminalTab';
import { TabBar } from './TabBar';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';

export interface BottomPanelHandle {
  transferTabOut: (
    tabId: string,
  ) => { terminalId: string; title: string; cwd?: string; customTitle?: string } | null;
  receiveTab: (terminalId: string, title: string, cwd?: string, customTitle?: string) => string;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  getTabs: () => Tab[];
  getActiveTabId: () => string | null;
  updateTabTitle: (tabId: string, title: string) => void;
  updateTabCwd: (tabId: string, cwd: string) => void;
}

export interface BottomPanelProps {
  workspaceId: string | null;
  terminalContainerRef?: React.Ref<HTMLDivElement>;
  onTerminalRegistered?: (terminalId: string, tabId: string, workspaceId: string) => void;
  onTerminalUnregistered?: (terminalId: string) => void;
  onActiveTabChange?: (activeTabId: string | null) => void;
}

export const BottomPanel = forwardRef<BottomPanelHandle, BottomPanelProps>(function BottomPanel(
  {
    workspaceId,
    terminalContainerRef,
    onTerminalRegistered,
    onTerminalUnregistered,
    onActiveTabChange,
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
    getTabs,
    getActiveTabId,
  } = useTerminalPane({
    workspaceId,
    pane: 'bottom',
    onTerminalRegistered: onTerminalRegistered
      ? (terminalId, tabId, wsId) => onTerminalRegistered(terminalId, tabId, wsId)
      : undefined,
    onTerminalUnregistered,
    confirmMultipleText: 'terminals? Running processes will be terminated.',
  });

  const handleTerminalCreated = useCallback(
    (terminalId: string, tabId: string) => {
      if (workspaceId) onTerminalRegistered?.(terminalId, tabId, workspaceId);
    },
    [onTerminalRegistered, workspaceId],
  );

  const handleAddTerminal = useCreateTerminalTab(
    workspaceId,
    tabs,
    createTab,
    handleTerminalCreated,
  );

  // Notify parent of activeTabId changes
  useEffect(() => {
    onActiveTabChange?.(activeTabId);
  }, [activeTabId, onActiveTabChange]);

  useImperativeHandle(
    ref,
    () => ({
      transferTabOut,
      receiveTab,
      reorderTabs,
      getTabs,
      getActiveTabId,
      updateTabTitle,
      updateTabCwd,
    }),
    [
      transferTabOut,
      receiveTab,
      reorderTabs,
      getTabs,
      getActiveTabId,
      updateTabTitle,
      updateTabCwd,
    ],
  );

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
