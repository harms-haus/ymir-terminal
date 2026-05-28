import * as ContextMenu from '@radix-ui/react-context-menu';

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
        <ContextMenu.Content
          data-testid="context-menu"
          style={{
            background: '#252526',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '4px 0',
            minWidth: '160px',
            zIndex: 1000,
          }}
        >
          {isDirectory && (
            <>
              <ContextMenu.Item
                data-testid="menu-new-file"
                onSelect={() => onNewFile?.(path)}
                style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#ccc', outline: 'none' }}
              >
                New File
              </ContextMenu.Item>
              <ContextMenu.Item
                data-testid="menu-new-folder"
                onSelect={() => onNewFolder?.(path)}
                style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#ccc', outline: 'none' }}
              >
                New Folder
              </ContextMenu.Item>
            </>
          )}
          {!isDirectory && (
            <ContextMenu.Item
              data-testid="menu-open-editor"
              onSelect={() => onOpenEditor?.(path)}
              style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#ccc', outline: 'none' }}
            >
              Open in Editor
            </ContextMenu.Item>
          )}
          <ContextMenu.Item
            data-testid="menu-rename"
            onSelect={() => onRename?.(path)}
            style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#ccc', outline: 'none' }}
          >
            Rename
          </ContextMenu.Item>
          <ContextMenu.Separator style={{ height: '1px', background: '#333', margin: '4px 0' }} />
          <ContextMenu.Item
            data-testid="menu-delete"
            onSelect={() => onDelete?.(path)}
            style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#c74e39', outline: 'none' }}
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
