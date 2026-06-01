import { useRef } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  getContextMenuCss,
  getMenuContainerStyle,
  menuItemStyle,
  separatorStyle,
} from '../lib/context-menu-styles';

const CONTEXT_MENU_CSS = getContextMenuCss('tab-context-menu');

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

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          data-testid="tab-context-menu"
          style={getMenuContainerStyle()}
          onCloseAutoFocus={(e) => {
            if (renameSelectedRef.current) {
              e.preventDefault();
              renameSelectedRef.current = false;
            }
          }}
        >
          <style>{CONTEXT_MENU_CSS}</style>

          <ContextMenu.Item
            data-testid="tab-menu-close"
            onSelect={() => onClose()}
            style={menuItemStyle}
          >
            Close
          </ContextMenu.Item>
          <ContextMenu.Item
            data-testid="tab-menu-close-others"
            disabled={!canCloseOthers}
            onSelect={() => onCloseOthers()}
            style={
              canCloseOthers ? menuItemStyle : { ...menuItemStyle, opacity: 0.5, cursor: 'default' }
            }
          >
            Close Others
          </ContextMenu.Item>
          <ContextMenu.Item
            data-testid="tab-menu-close-right"
            disabled={!canCloseRight}
            onSelect={() => onCloseRight()}
            style={
              canCloseRight ? menuItemStyle : { ...menuItemStyle, opacity: 0.5, cursor: 'default' }
            }
          >
            Close to the Right
          </ContextMenu.Item>
          <ContextMenu.Separator style={separatorStyle} />
          <ContextMenu.Item
            data-testid="tab-menu-rename"
            onSelect={() => {
              renameSelectedRef.current = true;
              onRename();
            }}
            style={menuItemStyle}
          >
            Rename
          </ContextMenu.Item>
          {onMoveToBottom && (
            <>
              <ContextMenu.Separator style={separatorStyle} />
              <ContextMenu.Item
                data-testid="tab-menu-move-to-bottom"
                onSelect={onMoveToBottom}
                style={menuItemStyle}
              >
                Move to Bottom Pane
              </ContextMenu.Item>
            </>
          )}
          {onMoveToContent && (
            <>
              <ContextMenu.Separator style={separatorStyle} />
              <ContextMenu.Item
                data-testid="tab-menu-move-to-content"
                onSelect={onMoveToContent}
                style={menuItemStyle}
              >
                Move to Content Pane
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
