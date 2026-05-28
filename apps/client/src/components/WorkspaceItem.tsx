import { useState, useRef, useEffect } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';

const PRESET_COLORS = [
  '#007acc',
  '#e06050',
  '#4ec9b0',
  '#dcdcaa',
  '#c586c0',
  '#569cd6',
  '#ce9178',
  '#b5cea8',
];

interface WorkspaceItemProps {
  workspace: { id: string; name: string; cwd: string; color: string };
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onSetCwd: (id: string, newCwd: string) => void;
  onRemove: (id: string) => void;
  onChangeColor: (id: string, newColor: string) => void;
}

export function WorkspaceItem({
  workspace,
  isActive,
  onSelect,
  onRename,
  onSetCwd,
  onRemove,
  onChangeColor,
}: WorkspaceItemProps) {
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

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          data-testid={`workspace-item-${workspace.id}`}
          role="button"
          tabIndex={0}
          aria-label={`Workspace: ${workspace.name}`}
          onClick={() => onSelect(workspace.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(workspace.id);
            }
          }}
          style={{
            padding: '6px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isActive ? '#37373d' : 'transparent',
          }}
        >
          <div
            data-testid={`ws-color-${workspace.id}`}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: workspace.color || '#007acc',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '13px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {workspace.name}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#999',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {workspace.cwd}
            </div>
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          data-testid="ws-context-menu"
          style={{
            background: '#252526',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '4px 0',
            minWidth: '180px',
            zIndex: 1000,
          }}
        >
          <style>{`
            [data-testid="ws-context-menu"] [role="menuitem"]:focus-visible {
              outline: 2px solid #007acc;
              outline-offset: -2px;
            }
            [data-testid="ws-context-menu"] [role="menuitem"]:hover {
              background: #094771;
            }
          `}</style>
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
                style={{
                  width: '100%',
                  background: '#1e1e1e',
                  border: '1px solid #007acc',
                  borderRadius: '2px',
                  color: '#ccc',
                  fontSize: '13px',
                  padding: '2px 4px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <ContextMenu.Item
              data-testid="ws-menu-rename"
              onSelect={handleStartRename}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#ccc',
                outline: 'none',
              }}
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
                style={{
                  width: '100%',
                  background: '#1e1e1e',
                  border: '1px solid #007acc',
                  borderRadius: '2px',
                  color: '#ccc',
                  fontSize: '13px',
                  padding: '2px 4px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <ContextMenu.Item
              data-testid="ws-menu-set-cwd"
              onSelect={handleStartSetCwd}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#ccc',
                outline: 'none',
              }}
            >
              Set CWD
            </ContextMenu.Item>
          )}

          {/* Change Color */}
          <ContextMenu.Item
            data-testid="ws-menu-change-color"
            style={{
              padding: '6px 12px',
              cursor: 'default',
              fontSize: '13px',
              color: '#ccc',
              outline: 'none',
            }}
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
                          ? '2px solid #fff'
                          : '1px solid rgba(255,255,255,0.2)',
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

          <ContextMenu.Separator
            style={{ height: '1px', background: '#333', margin: '4px 0' }}
          />

          {/* Remove */}
          <ContextMenu.Item
            data-testid="ws-menu-remove"
            onSelect={() => {
              if (window.confirm(`Remove workspace "${workspace.name}"?`)) {
                onRemove(workspace.id);
              }
            }}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#e06050',
              outline: 'none',
            }}
          >
            Remove
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
