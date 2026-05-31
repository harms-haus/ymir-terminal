import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Tab } from '../hooks/useTabs';
import {
  COLOR_BG_SECONDARY,
  COLOR_BORDER,
  COLOR_TAB_ADD_TEXT,
  TITLE_BAR_HEIGHT,
} from '../lib/theme';
import { SortableTab } from './SortableTab';
import { useDroppable } from '@dnd-kit/react';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onAddTerminal: () => void;
  canAddTerminal?: boolean;
  variant?: 'content' | 'bottom';
  onCloseRight?: (tabId: string) => void;
  onCloseOthers?: (tabId: string) => void;
  onRename?: (tabId: string, newTitle: string) => void;
  group?: string;
}

export function TabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onAddTerminal,
  canAddTerminal = true,
  variant = 'content',
  onCloseRight,
  onCloseOthers,
  onRename,
  group,
}: TabBarProps) {
  // Inline rename state
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const startRename = useCallback((tabId: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return;
    setRenamingTabId(tabId);
    setRenameValue(tab.customTitle ?? tab.title);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, []);

  const commitRename = useCallback(() => {
    if (renamingTabId === null) return;
    const trimmed = renameValue.trim();
    const tab = tabsRef.current.find((t) => t.id === renamingTabId);
    if (tab) {
      onRename?.(renamingTabId, trimmed);
    }
    setRenamingTabId(null);
    requestAnimationFrame(() => {
      (
        document.querySelector(`[data-testid="tab-${renamingTabId}"]`) as HTMLElement | null
      )?.focus();
    });
  }, [renamingTabId, renameValue, onRename]);

  const cancelRename = useCallback(() => {
    const tabId = renamingTabId;
    setRenamingTabId(null);
    requestAnimationFrame(() => {
      if (tabId) {
        (document.querySelector(`[data-testid="tab-${tabId}"]`) as HTMLElement | null)?.focus();
      }
    });
  }, [renamingTabId]);

  const isBottom = variant === 'bottom';

  const { ref: droppableRef, isDropTarget } = useDroppable({
    id: `tab-bar-${group || 'default'}`,
    type: 'tab-bar',
    accept: ['tab'],
    data: { group },
  });

  return (
    <div
      data-testid="tab-bar"
      style={{
        height: `${TITLE_BAR_HEIGHT}px`,
        background: isDropTarget ? 'rgba(255, 255, 255, 0.04)' : COLOR_BG_SECONDARY,
        boxShadow: isDropTarget ? 'inset 0 0 0 1px var(--accent)' : undefined,
        transition: 'background 0.15s, box-shadow 0.15s',
        display: 'flex',
        alignItems: 'flex-end',
        borderBottom: `1px solid ${COLOR_BORDER}`,
        flexShrink: 0,
      }}
    >
      <style>{`
        .tab-close-btn-focus:focus-visible { outline: 1px solid var(--accent, #007acc); outline-offset: -1px; }
        .tab-close-btn-focus:hover { background: rgba(255,255,255,0.1); }
        [role="tab"]:focus-visible { outline: 1px solid var(--accent, #007acc); outline-offset: -1px; }
      `}</style>
      {/* Scrollable tabs container */}
      <div
        ref={droppableRef}
        role="tablist"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-end',
          overflowX: 'auto',
        }}
      >
        {tabs.map((tab, tabIdx) => (
          <SortableTab
            key={tab.id}
            tab={tab}
            tabs={tabs}
            tabIdx={tabIdx}
            totalTabs={tabs.length}
            isActive={tab.id === activeTabId}
            isBottom={isBottom}
            renamingTabId={renamingTabId}
            renameValue={renameValue}
            renameInputRef={renameInputRef}
            onActivate={onActivate}
            onClose={onClose}
            onCloseRight={onCloseRight}
            onCloseOthers={onCloseOthers}
            startRename={startRename}
            commitRename={commitRename}
            cancelRename={cancelRename}
            setRenameValue={setRenameValue}
            group={group}
          />
        ))}
      </div>
      {/* + button OUTSIDE the scroll container so it stays fixed at right edge */}
      <button
        data-testid="tab-add"
        aria-label="Add tab"
        disabled={!canAddTerminal}
        onClick={onAddTerminal}
        style={{
          background: 'none',
          border: 'none',
          color: COLOR_TAB_ADD_TEXT,
          cursor: canAddTerminal ? 'pointer' : 'not-allowed',
          opacity: canAddTerminal ? undefined : 0.3,
          fontSize: '18px',
          lineHeight: `${TITLE_BAR_HEIGHT}px`,
          padding: '0 10px',
          height: `${TITLE_BAR_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        +
      </button>
    </div>
  );
}
