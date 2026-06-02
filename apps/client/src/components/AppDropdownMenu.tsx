import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { COLOR_ERROR } from '../lib/theme';
import {
  getContextMenuCss,
  getMenuContainerStyle,
  menuItemStyle,
  separatorStyle,
} from '../lib/context-menu-styles';

export interface DropdownMenuItem {
  label: string;
  icon?: React.ReactNode;
  action?: () => void;
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

export interface DropdownMenuSubItem {
  label: string;
  icon?: React.ReactNode;
  testId: string;
  disabled?: boolean;
  separatorAfter?: boolean;
  items: DropdownMenuItem[];
}

export type DropdownMenuEntry = DropdownMenuItem | DropdownMenuSubItem;

function isSubItem(entry: DropdownMenuEntry): entry is DropdownMenuSubItem {
  return 'items' in entry;
}

export interface AppDropdownMenuProps {
  items: DropdownMenuEntry[];
  children: React.ReactNode;
  testId?: string;
  /** Minimum width for the menu container (default: '160px') */
  minWidth?: string;
  /** Alignment of the menu relative to the trigger (default: 'start') */
  align?: 'start' | 'center' | 'end';
  /** Preferred side of the trigger the menu should appear on (default: 'bottom') */
  side?: 'top' | 'bottom';
  /** Called when the menu closes and focus is about to be restored */
  onCloseAutoFocus?: (event: Event) => void;
  /** Extra content rendered as siblings of the menu (e.g., dialogs) */
  extraContent?: React.ReactNode;
}

export function AppDropdownMenu({
  items,
  children,
  testId = 'app-dropdown-menu',
  minWidth,
  align = 'start',
  side = 'bottom',
  onCloseAutoFocus,
  extraContent,
}: AppDropdownMenuProps) {
  const css = getContextMenuCss(testId);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-testid={testId}
          style={getMenuContainerStyle(minWidth)}
          align={align}
          side={side}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <style>{css}</style>
          {items.map((entry, index) => {
            if (isSubItem(entry)) {
              return (
                <DropdownMenu.Sub key={`${entry.testId}-${index}`}>
                  <DropdownMenu.SubTrigger
                    data-testid={entry.testId}
                    disabled={entry.disabled}
                    style={{
                      ...menuItemStyle,
                      display: 'flex',
                      alignItems: 'center',
                      ...(entry.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
                    }}
                  >
                    {entry.icon}
                    {entry.label}
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: '10px',
                        opacity: 0.6,
                        paddingLeft: '16px',
                      }}
                    >
                      ▶
                    </span>
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      style={getMenuContainerStyle(minWidth)}
                    >
                      <style>{css}</style>
                      {entry.items.map((item, subIndex) => {
                        const itemStyle: React.CSSProperties = {
                          ...menuItemStyle,
                          ...(item.destructive ? { color: COLOR_ERROR } : {}),
                          ...(item.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
                          ...(item.shortcutHint || item.icon
                            ? { display: 'flex', alignItems: 'center' }
                            : {}),
                          ...item.style,
                        };

                        return (
                          <React.Fragment key={`${item.testId}-${subIndex}`}>
                            <DropdownMenu.Item
                              data-testid={item.testId}
                              disabled={item.disabled}
                              onSelect={() => item.action?.()}
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
                            </DropdownMenu.Item>
                            {item.separatorAfter && (
                              <DropdownMenu.Separator style={separatorStyle} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                  {entry.separatorAfter && (
                    <DropdownMenu.Separator style={separatorStyle} />
                  )}
                </DropdownMenu.Sub>
              );
            }

            const item = entry;
            const itemStyle: React.CSSProperties = {
              ...menuItemStyle,
              ...(item.destructive ? { color: COLOR_ERROR } : {}),
              ...(item.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
              ...(item.shortcutHint || item.icon
                ? { display: 'flex', alignItems: 'center' }
                : {}),
              ...item.style,
            };

            return (
              <React.Fragment key={`${item.testId}-${index}`}>
                <DropdownMenu.Item
                  data-testid={item.testId}
                  disabled={item.disabled}
                  onSelect={() => item.action?.()}
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
                </DropdownMenu.Item>
                {item.separatorAfter && (
                  <DropdownMenu.Separator style={separatorStyle} />
                )}
              </React.Fragment>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
      {extraContent}
    </DropdownMenu.Root>
  );
}
