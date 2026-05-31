import * as ContextMenu from '@radix-ui/react-context-menu';
import { COLOR_DANGER, COLOR_TEXT_DIM } from '../lib/theme';
import {
  getContextMenuCss,
  getMenuContainerStyle,
  menuItemStyle,
  separatorStyle,
} from '../lib/context-menu-styles';

interface PaneContextMenuProps {
  paneId: string;
  isOnlyPane: boolean;
  onSplitRight?: (paneId: string) => void;
  onSplitDown?: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
  children: React.ReactNode;
}

const PANE_CONTEXT_MENU_CSS = getContextMenuCss('pane-context-menu');

export function PaneContextMenu({
  paneId,
  isOnlyPane,
  onSplitRight,
  onSplitDown,
  onClosePane,
  children,
}: PaneContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-testid="pane-context-menu" style={getMenuContainerStyle()}>
          <style>{PANE_CONTEXT_MENU_CSS}</style>
          <ContextMenu.Item
            data-testid="split-right"
            onSelect={() => onSplitRight?.(paneId)}
            style={menuItemStyle}
          >
            Split Right
          </ContextMenu.Item>
          <ContextMenu.Item
            data-testid="split-down"
            onSelect={() => onSplitDown?.(paneId)}
            style={menuItemStyle}
          >
            Split Down
          </ContextMenu.Item>
          <ContextMenu.Separator style={separatorStyle} />
          <ContextMenu.Item
            data-testid="close-pane"
            disabled={isOnlyPane}
            onSelect={() => onClosePane?.(paneId)}
            style={{
              ...menuItemStyle,
              cursor: isOnlyPane ? 'not-allowed' : 'pointer',
              color: isOnlyPane ? COLOR_TEXT_DIM : COLOR_DANGER,
            }}
          >
            Close Pane
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
