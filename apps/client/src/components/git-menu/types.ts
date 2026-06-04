import type { DropdownMenuSubItem } from '../AppDropdownMenu';
import type { PickerItem } from '../GenericPicker';

// ---------------------------------------------------------------------------
// Shared context passed to every menu-builder function.
// ---------------------------------------------------------------------------

export interface MenuContext {
  confirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
  }) => Promise<boolean>;
  prompt: (opts: {
    title: string;
    message: string;
    defaultValue?: string;
    placeholder?: string;
    submitLabel?: string;
  }) => Promise<string | null>;
  doAction: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  pickItem: (title: string, items: PickerItem[]) => Promise<string | null>;
}

/**
 * Every sub-menu builder takes a {@link MenuContext} and returns a single
 * {@link DropdownMenuSubItem} ready to be spliced into the top-level menu.
 */
export type MenuBuilder = (ctx: MenuContext) => DropdownMenuSubItem;
