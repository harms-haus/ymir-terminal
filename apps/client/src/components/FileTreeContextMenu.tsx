import * as ContextMenu from '@radix-ui/react-context-menu';
import { COLOR_ERROR } from '../lib/theme';
import {
  getContextMenuCss,
  getMenuContainerStyle,
  menuItemStyle,
  separatorStyle,
} from '../lib/context-menu-styles';

interface FileTreeContextMenuProps {
  path: string;
  isDirectory: boolean;
  onNewFile?: (parentDir: string) => void;
  onNewFolder?: (parentDir: string) => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
  onOpenEditor?: (path: string) => void;
  children: React.ReactNode;
}

const FILE_TREE_CONTEXT_MENU_CSS = getContextMenuCss('context-menu');

export function FileTreeContextMenu({
  path,
  isDirectory,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onOpenEditor,
  children,
}: FileTreeContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-testid="context-menu" style={getMenuContainerStyle()}>
          <style>{FILE_TREE_CONTEXT_MENU_CSS}</style>

          {isDirectory && (
            <>
              <ContextMenu.Item
                data-testid="menu-new-file"
                onSelect={() => onNewFile?.(path)}
                style={menuItemStyle}
              >
                New File
              </ContextMenu.Item>
              <ContextMenu.Item
                data-testid="menu-new-folder"
                onSelect={() => onNewFolder?.(path)}
                style={menuItemStyle}
              >
                New Folder
              </ContextMenu.Item>
            </>
          )}
          {!isDirectory && (
            <ContextMenu.Item
              data-testid="menu-open-editor"
              onSelect={() => onOpenEditor?.(path)}
              style={menuItemStyle}
            >
              Open in Editor
            </ContextMenu.Item>
          )}
          <ContextMenu.Item
            data-testid="menu-rename"
            onSelect={() => onRename?.(path)}
            style={menuItemStyle}
          >
            Rename
          </ContextMenu.Item>
          <ContextMenu.Separator style={separatorStyle} />
          <ContextMenu.Item
            data-testid="menu-delete"
            onSelect={() => {
              const name = path.split('/').pop() || path;
              if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
                onDelete?.(path);
              }
            }}
            style={{ ...menuItemStyle, color: COLOR_ERROR }}
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
