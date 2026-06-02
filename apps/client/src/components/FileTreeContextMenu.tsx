import { AppContextMenu } from './AppContextMenu';
import type { ContextMenuItem } from './AppContextMenu';
import { useConfirm } from '../hooks/useDialog';

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
  const confirm = useConfirm();
  const items: ContextMenuItem[] = [];

  /* Directory-specific items */
  if (isDirectory) {
    items.push(
      { label: 'New File', testId: 'menu-new-file', action: () => onNewFile?.(path) },
      {
        label: 'New Folder',
        testId: 'menu-new-folder',
        action: () => onNewFolder?.(path),
        separatorAfter: true,
      },
    );
  }

  /* File-specific items */
  if (!isDirectory) {
    items.push({
      label: 'Open in Editor',
      testId: 'menu-open-editor',
      action: () => onOpenEditor?.(path),
      separatorAfter: true,
    });
  }

  /* Clipboard items */
  items.push(
    { label: 'Cut', testId: 'menu-cut', action: () => onCut?.(path), shortcutHint: `${mod}X` },
    { label: 'Copy', testId: 'menu-copy', action: () => onCopy?.(path), shortcutHint: `${mod}C` },
  );

  if (isDirectory) {
    items.push({
      label: 'Paste',
      testId: 'menu-paste',
      action: () => onPaste?.(path),
      disabled: !clipboardHasItem,
      shortcutHint: `${mod}V`,
      separatorAfter: true,
    });
  } else {
    /* Still add a separator after Copy for files */
    items[items.length - 1].separatorAfter = true;
  }

  /* Copy path items */
  items.push(
    {
      label: 'Copy Path',
      testId: 'menu-copy-path',
      action: () => {
        const absolutePath = workspaceCwd ? `${workspaceCwd}/${path}` : path;
        try {
          navigator.clipboard.writeText(absolutePath);
        } catch {
          console.warn('Failed to copy to clipboard');
        }
      },
      shortcutHint: `${shift}${mod}C`,
    },
    {
      label: 'Copy Relative Path',
      testId: 'menu-copy-relative-path',
      action: () => {
        try {
          navigator.clipboard.writeText(path);
        } catch {
          console.warn('Failed to copy to clipboard');
        }
      },
      separatorAfter: true,
    },
  );

  /* Rename & Delete */
  items.push(
    {
      label: 'Rename',
      testId: 'menu-rename',
      action: () => onRename?.(path),
      separatorAfter: true,
    },
    {
      label: 'Delete',
      testId: 'menu-delete',
      action: async () => {
        const name = path.split('/').pop() || path;
        const ok = await confirm({
          title: 'Delete File',
          message: `Delete "${name}"? This cannot be undone.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        onDelete?.(path);
      },
      destructive: true,
    },
  );

  return (
    <AppContextMenu items={items} testId="context-menu">
      {children}
    </AppContextMenu>
  );
}
