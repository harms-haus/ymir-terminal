import React, { useRef, useLayoutEffect } from 'react';
import type { Tab } from '../hooks/useTabs';
import {
  COLOR_BG_PRIMARY,
  COLOR_BORDER,
  COLOR_TAB_INACTIVE,
  COLOR_TAB_INACTIVE_TEXT,
  COLOR_TEXT,
  COLOR_TEXT_BRIGHT,
  COLOR_TEXT_DIM,
  COLOR_TEXT_MUTED,
  TITLE_BAR_HEIGHT,
} from '../lib/theme';
import { TabContextMenu } from './TabContextMenu';
import { useSortable } from '@dnd-kit/react/sortable';

export const SortableTab = React.memo(function SortableTab({
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
  onMoveToBottom,
  onMoveToContent,
  onSplitRight,
  onSplitDown,
  onClosePane,
  canClosePane,
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
  onMoveToBottom?: () => void;
  onMoveToContent?: () => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onClosePane?: () => void;
  canClosePane?: boolean;
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
  } else if (tab.type === 'diff') {
    tooltipTitle = tab.filePath ? `${tab.filePath} (diff)` : 'Diff';
  } else if (tab.type === 'git-tree') {
    tooltipTitle = tab.repoPath ? `Git History — ${tab.repoPath}` : 'Git History';
  }

  return (
    <TabContextMenu
      canCloseRight={tabIdx < totalTabs - 1}
      canCloseOthers={totalTabs > 1}
      onClose={() => onClose(tab.id)}
      onCloseRight={() => onCloseRight?.(tab.id)}
      onCloseOthers={() => onCloseOthers?.(tab.id)}
      onRename={() => startRename(tab.id)}
      onMoveToBottom={onMoveToBottom}
      onMoveToContent={onMoveToContent}
      onSplitRight={onSplitRight}
      onSplitDown={onSplitDown}
      onClosePane={onClosePane}
      canClosePane={canClosePane}
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
          height: `${TITLE_BAR_HEIGHT - 2}px`,
          lineHeight: `${TITLE_BAR_HEIGHT - 2}px`,
          fontSize: tabFontSize,
          cursor: 'pointer',
          background: tabBackground,
          color: tabColor,
          borderRight: `1px solid ${COLOR_BORDER}`,
          borderBottom: tabBorderBottom,
          borderTop: isActive ? '2px solid var(--accent-dim)' : '2px solid transparent',
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
          <span
            data-testid={`tab-title-${tab.id}`}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
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
