import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Tab } from '../hooks/useTabs';
import {
  COLOR_BG_SECONDARY,
  COLOR_BORDER,
  COLOR_TAB_ADD_TEXT,
  TITLE_BAR_HEIGHT,
} from '../lib/theme';
import { SortableTab } from './SortableTab';
import { COLOR_DANGER } from '../lib/theme';
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
  onMoveToPane?: (tabId: string) => void;
  group?: string;
  onSplitRight?: (tabId?: string) => void;
  onSplitDown?: (tabId?: string) => void;
  onClosePane?: () => void;
  canClosePane?: boolean;
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
  onMoveToPane,
  group,
  onSplitRight,
  onSplitDown,
  onClosePane,
  canClosePane,
}: TabBarProps) {
  // Inline rename state
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Empty-area context menu state (manual, no Radix)
  const [emptyMenuPos, setEmptyMenuPos] = useState<{ x: number; y: number } | null>(null);

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

  // Build menu items for empty-area right-click
  const hasSplitActions = onSplitRight || onSplitDown || onClosePane;

  const handleBarContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Only show the empty-area menu if NOT clicking on a tab or the + button
      const target = e.target as HTMLElement;
      if (target.closest('[role="tab"]') || target.closest('[data-testid="tab-add"]')) {
        return;
      }
      if (!hasSplitActions) return;
      e.preventDefault();
      setEmptyMenuPos({ x: e.clientX, y: e.clientY });
    },
    [hasSplitActions],
  );

  // Close empty-area menu on outside click or Escape
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!emptyMenuPos) return;
    const close = (e?: Event) => {
      if (e && menuRef.current?.contains(e.target as Node)) return;
      setEmptyMenuPos(null);
    };
    const onClick = (e: Event) => close(e);
    const onContextMenu = (e: Event) => close(e);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // Use a microtask to avoid the opening click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('click', onClick);
      document.addEventListener('contextmenu', onContextMenu);
      document.addEventListener('keydown', onKeyDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', onClick);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [emptyMenuPos]);

  return (
    <div
      data-testid="tab-bar"
      onContextMenu={handleBarContextMenu}
      style={{
        height: `${TITLE_BAR_HEIGHT}px`,
        background: isDropTarget ? 'rgba(255, 255, 255, 0.04)' : COLOR_BG_SECONDARY,
        boxShadow: isDropTarget ? 'inset 0 0 0 1px var(--accent)' : undefined,
        transition: 'background 0.15s, box-shadow 0.15s',
        display: 'flex',
        alignItems: 'flex-end',
        borderBottom: `1px solid ${COLOR_BORDER}`,
        flexShrink: 0,
        position: 'relative',
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
            onMoveToBottom={
              onMoveToPane && tab.terminalId && variant === 'content'
                ? () => onMoveToPane(tab.id)
                : undefined
            }
            onMoveToContent={
              onMoveToPane && tab.terminalId && variant === 'bottom'
                ? () => onMoveToPane(tab.id)
                : undefined
            }
            onSplitRight={onSplitRight ? () => onSplitRight(tab.id) : undefined}
            onSplitDown={onSplitDown ? () => onSplitDown(tab.id) : undefined}
            onClosePane={onClosePane}
            canClosePane={canClosePane}
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
      {/* Manual context menu for empty-area right-click (no Radix, avoids nesting) */}
      {emptyMenuPos && (
        <div
          data-testid="tab-bar-context-menu"
          style={{
            position: 'fixed',
            left: emptyMenuPos.x,
            top: emptyMenuPos.y,
            minWidth: 160,
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: 6,
            padding: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 9999,
          }}
        >
          {onSplitRight && (
            <div
              data-testid="tab-bar-split-right"
              role="menuitem"
              style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 3 }}
              onClick={() => {
                setEmptyMenuPos(null);
                onSplitRight();
              }}
            >
              Split Right
            </div>
          )}
          {onSplitDown && (
            <div
              data-testid="tab-bar-split-down"
              role="menuitem"
              style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 3 }}
              onClick={() => {
                setEmptyMenuPos(null);
                onSplitDown();
              }}
            >
              Split Down
            </div>
          )}
          {onClosePane && (
            <div
              data-testid="tab-bar-close-pane"
              role="menuitem"
              style={{
                padding: '6px 12px',
                fontSize: 13,
                cursor: canClosePane ? 'pointer' : 'not-allowed',
                borderRadius: 3,
                opacity: canClosePane ? 1 : 0.4,
                color: COLOR_DANGER,
              }}
              onClick={() => {
                if (!canClosePane) return;
                setEmptyMenuPos(null);
                onClosePane();
              }}
            >
              Close Pane
            </div>
          )}
        </div>
      )}
    </div>
  );
}
