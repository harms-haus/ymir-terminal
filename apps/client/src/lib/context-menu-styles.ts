import {
  COLOR_ACCENT,
  COLOR_BG_SECONDARY,
  COLOR_BORDER,
  COLOR_HOVER_BG,
  COLOR_TEXT,
  Z_INDEX_CONTEXT_MENU,
} from './theme';

/**
 * Base style for context menu items.
 * Override specific properties (e.g. `color`, `cursor`) as needed per item.
 */
export const menuItemStyle: React.CSSProperties = {
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: '13px',
  color: COLOR_TEXT,
  outline: 'none',
};

/**
 * Base style for context menu containers.
 * Accepts an optional `minWidth` override (default: `'160px'`).
 */
export function getMenuContainerStyle(minWidth: string = '160px'): React.CSSProperties {
  return {
    background: COLOR_BG_SECONDARY,
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: '4px',
    padding: '4px 0',
    minWidth,
    zIndex: Z_INDEX_CONTEXT_MENU,
  };
}

export const separatorStyle: React.CSSProperties = {
  height: '1px',
  background: COLOR_BORDER,
  margin: '4px 0',
};

/**
 * Returns a CSS string for hover/focus styles scoped to the given `data-testid`.
 * Inject via a `<style>` tag inside the context menu content.
 */
export function getContextMenuCss(testId: string): string {
  return `
    [data-testid="${testId}"] [role="menuitem"]:focus-visible {
      outline: 2px solid ${COLOR_ACCENT};
      outline-offset: -2px;
    }
    [data-testid="${testId}"] [role="menuitem"]:hover {
      background: ${COLOR_HOVER_BG};
    }
  `;
}
