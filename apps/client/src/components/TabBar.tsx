import React from 'react';
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
} from '../lib/theme';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onAddTerminal: () => void;
  canAddTerminal?: boolean;
}

export function TabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onAddTerminal,
  canAddTerminal = true,
}: TabBarProps) {
  return (
    <div
      data-testid="tab-bar"
      style={{
        height: '35px',
        background: COLOR_BG_SECONDARY,
        display: 'flex',
        alignItems: 'flex-end',
        borderBottom: `1px solid ${COLOR_BORDER}`,
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            onClick={() => onActivate(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              height: '35px',
              lineHeight: '35px',
              fontSize: '13px',
              cursor: 'pointer',
              background: isActive ? COLOR_BG_PRIMARY : COLOR_TAB_INACTIVE,
              color: isActive ? COLOR_TEXT_BRIGHT : COLOR_TAB_INACTIVE_TEXT,
              borderRight: `1px solid ${COLOR_BORDER}`,
              borderBottom: isActive
                ? `1px solid ${COLOR_BG_PRIMARY}`
                : `1px solid ${COLOR_BORDER}`,
              userSelect: 'none',
              position: 'relative',
              maxWidth: '200px',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.title}</span>
            <button
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
        );
      })}
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
          lineHeight: '35px',
          padding: '0 10px',
          height: '35px',
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
