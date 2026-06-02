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
  onCut?: (path: string) => void;
  onCopy?: (path: string) => void;
  onPaste?: (targetDir: string) => void;
  clipboardHasItem?: boolean;
  workspaceCwd?: string;
  children: React.ReactNode;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl+';
const shift = isMac ? '⇧' : 'Shift+';

function ShortcutHint({ shortcut }: { shortcut: string }) {
  return (
    <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.6, paddingLeft: '16px' }}>
      {shortcut}
    </span>
  );
}

const FILE_TREE_CONTEXT_MENU_CSS = getContextMenuCss('context-menu');

const flexMenuItemStyle: React.CSSProperties = {
  ...menuItemStyle,
  display: 'flex',
  alignItems: 'center',
};

export function FileTreeContextMenu({
  path,
  isDirectory,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onOpenEditor,
  onCut,
  onCopy,
  onPaste,
  clipboardHasItem,
  workspaceCwd,
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

          <ContextMenu.Separator style={separatorStyle} />

          <ContextMenu.Item
            data-testid="menu-cut"
            onSelect={() => onCut?.(path)}
            style={flexMenuItemStyle}
          >
            Cut
            <ShortcutHint shortcut={`${mod}X`} />
          </ContextMenu.Item>
          <ContextMenu.Item
            data-testid="menu-copy"
            onSelect={() => onCopy?.(path)}
            style={flexMenuItemStyle}
          >
            Copy
            <ShortcutHint shortcut={`${mod}C`} />
          </ContextMenu.Item>

          {isDirectory && (
            <ContextMenu.Item
              data-testid="menu-paste"
              disabled={!clipboardHasItem}
              onSelect={() => onPaste?.(path)}
              style={clipboardHasItem ? flexMenuItemStyle : { ...flexMenuItemStyle, opacity: 0.4 }}
            >
              Paste
              <ShortcutHint shortcut={`${mod}V`} />
            </ContextMenu.Item>
          )}

          <ContextMenu.Separator style={separatorStyle} />

          <ContextMenu.Item
            data-testid="menu-copy-path"
            onSelect={() => {
              const absolutePath = workspaceCwd ? `${workspaceCwd}/${path}` : path;
              navigator.clipboard.writeText(absolutePath);
            }}
            style={flexMenuItemStyle}
          >
            Copy Path
            <ShortcutHint shortcut={`${shift}${mod}C`} />
          </ContextMenu.Item>
          <ContextMenu.Item
            data-testid="menu-copy-relative-path"
            onSelect={() => {
              navigator.clipboard.writeText(path);
            }}
            style={flexMenuItemStyle}
          >
            Copy Relative Path
          </ContextMenu.Item>

          <ContextMenu.Separator style={separatorStyle} />

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
