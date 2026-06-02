import { useRef, useCallback } from 'react';
import { AppContextMenu } from './AppContextMenu';
import type { ContextMenuItem } from './AppContextMenu';

interface TabContextMenuProps {
  canCloseRight: boolean; // false when no tabs to the right
  canCloseOthers: boolean; // false when only one tab
  onClose: () => void;
  onCloseRight: () => void;
  onCloseOthers: () => void;
  onRename: () => void;
  onMoveToBottom?: () => void;
  onMoveToContent?: () => void;
  children: React.ReactNode;
}

export function TabContextMenu({
  canCloseRight,
  canCloseOthers,
  onClose,
  onCloseRight,
  onCloseOthers,
  onRename,
  onMoveToBottom,
  onMoveToContent,
  children,
}: TabContextMenuProps) {
  const renameSelectedRef = useRef(false);

  const handleRename = useCallback(() => {
    renameSelectedRef.current = true;
    onRename();
  }, [onRename]);

  const items: ContextMenuItem[] = [
    { label: 'Close', testId: 'tab-menu-close', action: () => onClose() },
    {
      label: 'Close Others',
      testId: 'tab-menu-close-others',
      action: () => onCloseOthers(),
      disabled: !canCloseOthers,
      style: canCloseOthers ? undefined : { opacity: 0.5, cursor: 'default' },
    },
    {
      label: 'Close to the Right',
      testId: 'tab-menu-close-right',
      action: () => onCloseRight(),
      disabled: !canCloseRight,
      style: canCloseRight ? undefined : { opacity: 0.5, cursor: 'default' },
      separatorAfter: true,
    },
    {
      label: 'Rename',
      testId: 'tab-menu-rename',
      action: handleRename,
      separatorAfter: !!(onMoveToBottom || onMoveToContent),
    },
    ...(onMoveToBottom
      ? [
          {
            label: 'Move to Bottom Pane',
            testId: 'tab-menu-move-to-bottom' as const,
            action: onMoveToBottom,
            separatorAfter: !onMoveToContent,
          },
        ]
      : []),
    ...(onMoveToContent
      ? [
          {
            label: 'Move to Content Pane',
            testId: 'tab-menu-move-to-content' as const,
            action: onMoveToContent,
          },
        ]
      : []),
  ];

  const handleCloseAutoFocus = useCallback((e: Event) => {
    if (renameSelectedRef.current) {
      e.preventDefault();
      renameSelectedRef.current = false;
    }
  }, []);

  return (
    <AppContextMenu items={items} testId="tab-context-menu" onCloseAutoFocus={handleCloseAutoFocus}>
      {children}
    </AppContextMenu>
  );
}
