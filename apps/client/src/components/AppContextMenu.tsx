import React from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { COLOR_ERROR } from '../lib/theme';
import {
  getContextMenuCss,
  getMenuContainerStyle,
  menuItemStyle,
  separatorStyle,
} from '../lib/context-menu-styles';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  testId: string;
  disabled?: boolean;
  separatorAfter?: boolean;
  destructive?: boolean;
  /** Shortcut hint text rendered on the right side (e.g. "⌘C") */
  shortcutHint?: string;
  /**
   * Custom content rendered inside the menu item (replaces label + shortcut).
   * When provided, `label` is only used for accessibility.
   */
  content?: React.ReactNode;
  /** Additional inline styles merged onto the menu item */
  style?: React.CSSProperties;
}

export interface AppContextMenuProps {
  items: ContextMenuItem[];
  children: React.ReactNode;
  testId?: string;
  /** Minimum width for the menu container (default: '160px') */
  minWidth?: string;
  /** Called when the menu closes and focus is about to be restored */
  onCloseAutoFocus?: (event: Event) => void;
  /** Extra content rendered as siblings of the menu (e.g., dialogs) */
  extraContent?: React.ReactNode;
}

export function AppContextMenu({
  items,
  children,
  testId = 'app-context-menu',
  minWidth,
  onCloseAutoFocus,
  extraContent,
}: AppContextMenuProps) {
  const css = getContextMenuCss(testId);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          data-testid={testId}
          style={getMenuContainerStyle(minWidth)}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <style>{css}</style>
          {items.map((item, index) => {
            const itemStyle: React.CSSProperties = {
              ...menuItemStyle,
              ...(item.destructive ? { color: COLOR_ERROR } : {}),
              ...(item.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
              ...(item.shortcutHint || item.icon ? { display: 'flex', alignItems: 'center' } : {}),
              ...item.style,
            };

            return (
              <React.Fragment key={`${item.testId}-${index}`}>
                <ContextMenu.Item
                  data-testid={item.testId}
                  disabled={item.disabled}
                  onSelect={() => item.action()}
                  style={itemStyle}
                >
                  {item.icon}
                  {item.content ?? (
                    <>
                      {item.label}
                      {item.shortcutHint && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: '11px',
                            opacity: 0.6,
                            paddingLeft: '16px',
                          }}
                        >
                          {item.shortcutHint}
                        </span>
                      )}
                    </>
                  )}
                </ContextMenu.Item>
                {item.separatorAfter && <ContextMenu.Separator style={separatorStyle} />}
              </React.Fragment>
            );
          })}
        </ContextMenu.Content>
      </ContextMenu.Portal>
      {extraContent}
    </ContextMenu.Root>
  );
}
