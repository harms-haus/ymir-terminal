import React, { useState, useRef, useEffect } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  COLOR_ACCENT,
  COLOR_BG_PRIMARY,
  COLOR_ERROR,
  COLOR_SWATCH_ACTIVE_BORDER,
  COLOR_SWATCH_BORDER,
  COLOR_TEXT,
  PRESET_COLORS,
} from '../lib/theme';
import {
  getContextMenuCss,
  getMenuContainerStyle,
  menuItemStyle,
  separatorStyle,
} from '../lib/context-menu-styles';

interface WorkspaceItemContextMenuProps {
  workspace: { id: string; name: string; cwd: string; color: string };
  onRename: (id: string, newName: string) => void;
  onSetCwd: (id: string, newCwd: string) => void;
  onRemove: (id: string) => void;
  onChangeColor: (id: string, newColor: string) => void;
  onCreateWorktree?: () => void;
  children: React.ReactNode;
}

const WS_CONTEXT_MENU_CSS = getContextMenuCss('ws-context-menu');

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

  const handleStartRename = () => {
    setEditValue(workspace.name);
    setEditingField('rename');
  };

  const handleStartSetCwd = () => {
    setEditValue(workspace.cwd);
    setEditingField('cwd');
  };

  const commitEdit = () => {
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
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

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

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-testid="ws-context-menu" style={getMenuContainerStyle('180px')}>
          <style>{WS_CONTEXT_MENU_CSS}</style>
          {/* Rename */}
          {editingField === 'rename' ? (
            <div style={{ padding: '6px 12px' }}>
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
          ) : (
            <ContextMenu.Item
              data-testid="ws-menu-rename"
              onSelect={handleStartRename}
              style={menuItemStyle}
            >
              Rename
            </ContextMenu.Item>
          )}

          {/* Set CWD */}
          {editingField === 'cwd' ? (
            <div style={{ padding: '6px 12px' }}>
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
          ) : (
            <ContextMenu.Item
              data-testid="ws-menu-set-cwd"
              onSelect={handleStartSetCwd}
              style={menuItemStyle}
            >
              Set CWD
            </ContextMenu.Item>
          )}

          {/* Change Color */}
          <ContextMenu.Item
            data-testid="ws-menu-change-color"
            style={{ ...menuItemStyle, cursor: 'default' }}
            onSelect={(e) => e.preventDefault()}
          >
            <div style={{ marginBottom: '4px' }}>Change Color</div>
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
          </ContextMenu.Item>

          <ContextMenu.Separator style={separatorStyle} />

          {/* Create Worktree */}
          <ContextMenu.Item
            data-testid="ws-menu-create-worktree"
            onSelect={() => onCreateWorktree?.()}
            style={menuItemStyle}
          >
            Create Worktree…
          </ContextMenu.Item>

          <ContextMenu.Separator style={separatorStyle} />

          {/* Remove */}
          <ContextMenu.Item
            data-testid="ws-menu-remove"
            onSelect={() => {
              if (window.confirm(`Remove workspace "${workspace.name}"?`)) {
                onRemove(workspace.id);
              }
            }}
            style={{ ...menuItemStyle, color: COLOR_ERROR }}
          >
            Remove
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
