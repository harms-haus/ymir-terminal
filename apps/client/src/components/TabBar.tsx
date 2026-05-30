import React, { useState, useRef, useCallback, useLayoutEffect } from 'react';
import type { Tab } from '../hooks/useTabs';
import {
  COLOR_BG_PRIMARY,
  COLOR_BG_SECONDARY,
  COLOR_BORDER,
  COLOR_TAB_INACTIVE,
  COLOR_TAB_INACTIVE_TEXT,
  COLOR_TAB_ADD_TEXT,
  COLOR_TEXT,
  COLOR_TEXT_BRIGHT,
  COLOR_TEXT_DIM,
  COLOR_TEXT_MUTED,
  TITLE_BAR_HEIGHT,
} from '../lib/theme';
import { TabContextMenu } from './TabContextMenu';
import { useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';

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

const SortableTab = React.memo(function SortableTab({
  tab,
  tabs,
  tabIdx,
  totalTabs,
  isActive,
  isBottom,
  renamingTabId,
  renameValue,
  renameInputRef,
  onActivate,
  onClose,
  onCloseRight,
  onCloseOthers,
  startRename,
  commitRename,
  cancelRename,
  setRenameValue,
  group,
}: {
  tab: Tab;
  tabs: Tab[];
  tabIdx: number;
  totalTabs: number;
  isActive: boolean;
  isBottom: boolean;
  renamingTabId: string | null;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseRight?: (tabId: string) => void;
  onCloseOthers?: (tabId: string) => void;
  startRename: (tabId: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  setRenameValue: (value: string) => void;
  group?: string;
}) {
  const renameMountTimeRef = useRef(0);
  const isRenaming = tab.id === renamingTabId;

  // Track when rename input mounts for this tab (defense against Radix FocusScope focus theft)
  useLayoutEffect(() => {
    if (isRenaming) {
      renameMountTimeRef.current = Date.now();
    }
  }, [isRenaming]);

  const { ref: sortableRef, isDragging } = useSortable({
    id: tab.id,
    index: tabIdx,
    group,
    type: 'tab',
    accept: ['tab'],
  });

  // Compute tab styling based on variant
  const tabBackground = isBottom
    ? isActive
      ? COLOR_BG_PRIMARY
      : 'transparent'
    : isActive
      ? COLOR_BG_PRIMARY
      : COLOR_TAB_INACTIVE;

  const tabColor = isBottom
    ? isActive
      ? COLOR_TEXT_BRIGHT
      : COLOR_TEXT_MUTED
    : isActive
      ? COLOR_TEXT_BRIGHT
      : COLOR_TAB_INACTIVE_TEXT;

  const tabFontSize = isBottom ? '12px' : '13px';

  const tabBorderBottom = isBottom
    ? '1px solid transparent'
    : isActive
      ? `1px solid ${COLOR_BG_PRIMARY}`
      : `1px solid ${COLOR_BORDER}`;

  // Tooltip: cwd for terminal tabs, filePath for editor tabs
  let tooltipTitle: string | undefined;
  if (tab.type === 'terminal') {
    tooltipTitle = tab.cwd ?? 'Terminal';
  } else if (tab.type === 'editor') {
    tooltipTitle = tab.filePath;
  }

  return (
    <TabContextMenu
      canCloseRight={tabIdx < totalTabs - 1}
      canCloseOthers={totalTabs > 1}
      onClose={() => onClose(tab.id)}
      onCloseRight={() => onCloseRight?.(tab.id)}
      onCloseOthers={() => onCloseOthers?.(tab.id)}
      onRename={() => startRename(tab.id)}
    >
      <div
        ref={sortableRef}
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        data-testid={`tab-${tab.id}`}
        title={renamingTabId === tab.id ? undefined : tooltipTitle}
        onClick={() => {
          if (renamingTabId !== null) return;
          onActivate(tab.id);
        }}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            onClose(tab.id);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            const nextIdx = tabIdx + 1;
            if (nextIdx < tabs.length) {
              const nextTab = document.querySelector(
                `[data-testid="tab-${tabs[nextIdx].id}"]`,
              ) as HTMLElement;
              nextTab?.focus();
            }
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prevIdx = tabIdx - 1;
            if (prevIdx >= 0) {
              const prevTab = document.querySelector(
                `[data-testid="tab-${tabs[prevIdx].id}"]`,
              ) as HTMLElement;
              prevTab?.focus();
            }
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate(tab.id);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0 12px',
          height: `${TITLE_BAR_HEIGHT}px`,
          lineHeight: `${TITLE_BAR_HEIGHT}px`,
          fontSize: tabFontSize,
          cursor: 'pointer',
          background: tabBackground,
          color: tabColor,
          borderRight: `1px solid ${COLOR_BORDER}`,
          borderBottom: tabBorderBottom,
          borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
          userSelect: 'none',
          position: 'relative',
          maxWidth: '200px',
          whiteSpace: 'nowrap',
          opacity: isDragging ? 0.4 : undefined,
        }}
      >
        {tab.id === renamingTabId ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            aria-label={`Rename "${tab.customTitle ?? tab.title}"`}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') cancelRename();
            }}
            onBlur={(e) => {
              // Ignore blur events within 100ms of mount (Radix FocusScope focus theft)
              if (Date.now() - renameMountTimeRef.current < 100) {
                requestAnimationFrame(() => {
                  e.target?.focus?.();
                });
                return;
              }
              commitRename();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              background: COLOR_BG_PRIMARY,
              border: '1px solid var(--accent)',
              borderRadius: '2px',
              color: isActive ? COLOR_TEXT_BRIGHT : COLOR_TAB_INACTIVE_TEXT,
              fontSize: tabFontSize,
              padding: '0 2px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tab.customTitle ?? tab.title}
          </span>
        )}
        <button
          className="tab-close-btn-focus"
          data-testid={`tab-close-${tab.id}`}
          aria-label="Close tab"
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: isActive ? COLOR_TEXT : COLOR_TEXT_DIM,
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            padding: '0 2px',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
          }}
        >
          ×
        </button>
      </div>
    </TabContextMenu>
  );
});

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
  tabsRef.current = tabs;

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
      document.querySelector(`[data-testid="tab-${renamingTabId}"]`)?.focus();
    });
  }, [renamingTabId, renameValue, onRename]);

  const cancelRename = useCallback(() => {
    const tabId = renamingTabId;
    setRenamingTabId(null);
    requestAnimationFrame(() => {
      if (tabId) {
        document.querySelector(`[data-testid="tab-${tabId}"]`)?.focus();
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
      ref={droppableRef}
      role="tablist"
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
        overflowX: 'auto',
      }}
    >
      <style>{`
        .tab-close-btn-focus:focus-visible { outline: 1px solid var(--accent); outline-offset: -1px; }
        .tab-close-btn-focus:hover { background: rgba(255,255,255,0.1); }
        [role="tab"]:focus-visible { outline: 1px solid var(--accent); outline-offset: -1px; }
      `}</style>
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
        }}
      >
        +
      </button>
    </div>
  );
}
