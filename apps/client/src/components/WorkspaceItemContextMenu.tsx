import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  COLOR_ACCENT,
  COLOR_BG_PRIMARY,
  COLOR_SWATCH_ACTIVE_BORDER,
  COLOR_SWATCH_BORDER,
  COLOR_TEXT,
  PRESET_COLORS,
} from '../lib/theme';
import { AppContextMenu } from './AppContextMenu';
import type { ContextMenuItem } from './AppContextMenu';

interface WorkspaceItemContextMenuProps {
  workspace: { id: string; name: string; cwd: string; color: string };
  onRename: (id: string, newName: string) => void;
  onSetCwd: (id: string, newCwd: string) => void;
  onRemove: (id: string) => void;
  onChangeColor: (id: string, newColor: string) => void;
  onCreateWorktree?: () => void;
  children: React.ReactNode;
}

export function WorkspaceItemContextMenu({
  workspace,
  onRename,
  onSetCwd,
  onRemove,
  onChangeColor,
  onCreateWorktree,
  children,
}: WorkspaceItemContextMenuProps) {
  const [editingField, setEditingField] = useState<'rename' | 'cwd' | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const handleStartRename = useCallback(() => {
    setEditValue(workspace.name);
    setEditingField('rename');
  }, [workspace.name]);

  const handleStartSetCwd = useCallback(() => {
    setEditValue(workspace.cwd);
    setEditingField('cwd');
  }, [workspace.cwd]);

  const commitEdit = useCallback(() => {
    if (editingField === 'rename') {
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== workspace.name) {
        onRename(workspace.id, trimmed);
      }
    } else if (editingField === 'cwd') {
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== workspace.cwd) {
        onSetCwd(workspace.id, trimmed);
      }
    }
    setEditingField(null);
    setEditValue('');
  }, [editingField, editValue, workspace, onRename, onSetCwd]);

  const cancelEdit = useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit],
  );

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: COLOR_BG_PRIMARY,
    border: `1px solid ${COLOR_ACCENT}`,
    borderRadius: '2px',
    color: COLOR_TEXT,
    fontSize: '13px',
    padding: '2px 4px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const colorSwatches = (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {PRESET_COLORS.map((color) => {
        const testId = `ws-color-swatch-${color.replace('#', '')}`;
        return (
          <div
            key={color}
            role="button"
            tabIndex={0}
            aria-label={`Select color ${color}`}
            data-testid={testId}
            onClick={(e) => {
              e.stopPropagation();
              onChangeColor(workspace.id, color);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onChangeColor(workspace.id, color);
              }
            }}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: color,
              border:
                workspace.color === color
                  ? `2px solid ${COLOR_SWATCH_ACTIVE_BORDER}`
                  : `1px solid ${COLOR_SWATCH_BORDER}`,
              cursor: 'pointer',
              transition: 'transform 0.1s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.2)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
            }}
          />
        );
      })}
    </div>
  );

  const items: ContextMenuItem[] = [
    /* Rename */
    ...(editingField === 'rename'
      ? [
          {
            label: 'Rename',
            testId: 'ws-menu-rename-input',
            action: () => {},
            content: (
              <div style={{ padding: '0', width: '100%' }}>
                <input
                  ref={inputRef}
                  aria-label="Rename workspace"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleInputKeyDown}
                  style={inputStyle}
                />
              </div>
            ),
            style: { padding: '6px 12px' } as React.CSSProperties,
          },
        ]
      : [
          {
            label: 'Rename',
            testId: 'ws-menu-rename',
            action: handleStartRename,
          },
        ]),

    /* Set CWD */
    ...(editingField === 'cwd'
      ? [
          {
            label: 'Set CWD',
            testId: 'ws-menu-set-cwd-input',
            action: () => {},
            content: (
              <div style={{ padding: '0', width: '100%' }}>
                <input
                  ref={inputRef}
                  aria-label="Set workspace directory"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleInputKeyDown}
                  style={inputStyle}
                />
              </div>
            ),
            style: { padding: '6px 12px' } as React.CSSProperties,
          },
        ]
      : [
          {
            label: 'Set CWD',
            testId: 'ws-menu-set-cwd',
            action: handleStartSetCwd,
          },
        ]),

    /* Change Color */
    {
      label: 'Change Color',
      testId: 'ws-menu-change-color',
      action: () => {},
      content: (
        <>
          <div style={{ marginBottom: '4px' }}>Change Color</div>
          {colorSwatches}
        </>
      ),
      style: { cursor: 'default' } as React.CSSProperties,
      separatorAfter: true,
    },

    /* Create Worktree */
    {
      label: 'Create Worktree…',
      testId: 'ws-menu-create-worktree',
      action: () => onCreateWorktree?.(),
      separatorAfter: true,
    },

    /* Remove */
    {
      label: 'Remove',
      testId: 'ws-menu-remove',
      action: () => {
        if (window.confirm(`Remove workspace "${workspace.name}"?`)) {
          onRemove(workspace.id);
        }
      },
      destructive: true,
    },
  ];

  return (
    <AppContextMenu items={items} testId="ws-context-menu" minWidth="180px">
      {children}
    </AppContextMenu>
  );
}
