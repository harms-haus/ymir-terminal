import { COLOR_DANGER, COLOR_TEXT_DIM } from '../lib/theme';
import { AppContextMenu } from './AppContextMenu';
import type { ContextMenuItem } from './AppContextMenu';

interface SplitPaneContextMenuProps {
  paneId: string;
  isOnlyPane: boolean;
  onSplitRight?: (paneId: string) => void;
  onSplitDown?: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
  children: React.ReactNode;
}

export function SplitPaneContextMenu({
  paneId,
  isOnlyPane,
  onSplitRight,
  onSplitDown,
  onClosePane,
  children,
}: SplitPaneContextMenuProps) {
  const items: ContextMenuItem[] = [
    {
      label: 'Split Right',
      testId: 'split-right',
      action: () => onSplitRight?.(paneId),
    },
    {
      label: 'Split Down',
      testId: 'split-down',
      action: () => onSplitDown?.(paneId),
      separatorAfter: true,
    },
    {
      label: 'Close Pane',
      testId: 'close-pane',
      action: () => onClosePane?.(paneId),
      disabled: isOnlyPane,
      style: {
        cursor: isOnlyPane ? 'not-allowed' : 'pointer',
        color: isOnlyPane ? COLOR_TEXT_DIM : COLOR_DANGER,
      },
    },
  ];

  return (
    <AppContextMenu items={items} testId="pane-context-menu">
      {children}
    </AppContextMenu>
  );
}
