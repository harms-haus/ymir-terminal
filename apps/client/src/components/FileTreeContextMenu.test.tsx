/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { FileTreeContext } from './FileTreeContext';

// ---------------------------------------------------------------------------
// Mock useDialog hooks (used by FileTreeContextMenu for confirm dialogs)
// ---------------------------------------------------------------------------

mock.module('../hooks/useDialog', () => ({
  useConfirm: () => async () => true,
  usePrompt: () => async () => null,
}));

// ---------------------------------------------------------------------------
// Import component under test (after mock)
// ---------------------------------------------------------------------------

const { FileTreeContextMenu } = await import('./FileTreeContextMenu');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderContextMenu(
  overrides: {
    path?: string;
    isDirectory?: boolean;
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
  } = {},
) {
  const onNewFile = overrides.onNewFile ?? mock(() => {});
  const onNewFolder = overrides.onNewFolder ?? mock(() => {});
  const onRename = overrides.onRename ?? mock(() => {});
  const onDelete = overrides.onDelete ?? mock(() => {});
  const onOpenEditor = overrides.onOpenEditor ?? mock(() => {});
  const onCut = overrides.onCut ?? mock(() => {});
  const onCopy = overrides.onCopy ?? mock(() => {});
  const onPaste = overrides.onPaste ?? mock(() => {});

  const contextValue = {
    onNewFile,
    onNewFolder,
    onRename,
    onDelete,
    onOpenEditor,
    onCut,
    onCopy,
    onPaste,
    clipboardHasItem: overrides.clipboardHasItem ?? false,
    workspaceCwd: overrides.workspaceCwd ?? '/home/user/project',
  };

  const result = render(
    React.createElement(
      FileTreeContext.Provider,
      { value: contextValue },
      React.createElement(
        FileTreeContextMenu,
        {
          path: overrides.path ?? '/src',
          isDirectory: overrides.isDirectory ?? true,
        } as React.Attributes & React.ComponentProps<typeof FileTreeContextMenu>,
        React.createElement('div', { 'data-testid': 'trigger' }, 'Trigger'),
      ),
    ),
  );

  return {
    ...result,
    onNewFile,
    onNewFolder,
    onRename,
    onDelete,
    onOpenEditor,
    onCut,
    onCopy,
    onPaste,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('FileTreeContextMenu', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Context menu renders with correct structure for a directory
  // -----------------------------------------------------------------------
  test('renders context menu for a directory', () => {
    const { container } = renderContextMenu({ isDirectory: true });

    const menu = container.querySelector('[data-testid="context-menu"]');
    expect(menu).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. Context menu renders for a file
  // -----------------------------------------------------------------------
  test('renders context menu for a file', () => {
    const { container } = renderContextMenu({ isDirectory: false, path: '/src/index.ts' });

    const menu = container.querySelector('[data-testid="context-menu"]');
    expect(menu).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. Directory context menu contains: New File, New Folder, Rename, Delete
  // -----------------------------------------------------------------------
  test('directory menu contains New File, New Folder, Rename, Delete', () => {
    const { container } = renderContextMenu({ isDirectory: true });

    expect(container.querySelector('[data-testid="menu-new-file"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-new-folder"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-rename"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-delete"]')).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 4. File context menu contains: Open in Editor, Rename, Delete
  // -----------------------------------------------------------------------
  test('file menu contains Open in Editor, Rename, Delete', () => {
    const { container } = renderContextMenu({ isDirectory: false, path: '/src/index.ts' });

    expect(container.querySelector('[data-testid="menu-open-editor"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-rename"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-delete"]')).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 5. File context menu does NOT show New File or New Folder
  // -----------------------------------------------------------------------
  test('file menu does not show New File or New Folder', () => {
    const { container } = renderContextMenu({ isDirectory: false, path: '/src/index.ts' });

    expect(container.querySelector('[data-testid="menu-new-file"]')).toBeNull();
    expect(container.querySelector('[data-testid="menu-new-folder"]')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 6. Directory menu does NOT show Open in Editor
  // -----------------------------------------------------------------------
  test('directory menu does not show Open in Editor', () => {
    const { container } = renderContextMenu({ isDirectory: true });

    expect(container.querySelector('[data-testid="menu-open-editor"]')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 7. 'New File' calls onNewFile with the parent directory path
  // -----------------------------------------------------------------------
  test('New File calls onNewFile with the directory path', () => {
    const onNewFile = mock(() => {});
    const { container } = renderContextMenu({ isDirectory: true, path: '/src', onNewFile });

    const item = container.querySelector('[data-testid="menu-new-file"]') as HTMLElement;
    fireEvent.click(item);

    expect(onNewFile).toHaveBeenCalledWith('/src');
  });

  // -----------------------------------------------------------------------
  // 8. 'New Folder' calls onNewFolder with the parent directory path
  // -----------------------------------------------------------------------
  test('New Folder calls onNewFolder with the directory path', () => {
    const onNewFolder = mock(() => {});
    const { container } = renderContextMenu({ isDirectory: true, path: '/src', onNewFolder });

    const item = container.querySelector('[data-testid="menu-new-folder"]') as HTMLElement;
    fireEvent.click(item);

    expect(onNewFolder).toHaveBeenCalledWith('/src');
  });

  // -----------------------------------------------------------------------
  // 9. 'Rename' calls onRename with the path
  // -----------------------------------------------------------------------
  test('Rename calls onRename with the path', () => {
    const onRename = mock(() => {});
    const { container } = renderContextMenu({ isDirectory: true, path: '/src', onRename });

    const item = container.querySelector('[data-testid="menu-rename"]') as HTMLElement;
    fireEvent.click(item);

    expect(onRename).toHaveBeenCalledWith('/src');
  });

  // -----------------------------------------------------------------------
  // 10. 'Delete' calls onDelete with the path
  // -----------------------------------------------------------------------
  test('Delete calls onDelete with the path', async () => {
    const onDelete = mock(() => {});
    const { container } = renderContextMenu({
      isDirectory: true,
      path: '/src/components',
      onDelete,
    });

    const item = container.querySelector('[data-testid="menu-delete"]') as HTMLElement;
    fireEvent.click(item);

    // The mock useConfirm resolves to true, so onDelete should be called
    // after the async confirm resolves
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('/src/components');
    });
  });

  // -----------------------------------------------------------------------
  // 11. 'Open in Editor' calls onOpenEditor with the file path
  // -----------------------------------------------------------------------
  test('Open in Editor calls onOpenEditor with the file path', () => {
    const onOpenEditor = mock(() => {});
    const { container } = renderContextMenu({
      isDirectory: false,
      path: '/src/index.ts',
      onOpenEditor,
    });

    const item = container.querySelector('[data-testid="menu-open-editor"]') as HTMLElement;
    fireEvent.click(item);

    expect(onOpenEditor).toHaveBeenCalledWith('/src/index.ts');
  });

  // -----------------------------------------------------------------------
  // 12. Directory menu contains Cut, Copy, Paste, Copy Path, Copy Relative Path
  // -----------------------------------------------------------------------
  test('directory menu contains Cut, Copy, Paste, Copy Path, Copy Relative Path', () => {
    const { container } = renderContextMenu({
      isDirectory: true,
      clipboardHasItem: true,
    });

    expect(container.querySelector('[data-testid="menu-cut"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-copy"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-paste"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-copy-path"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-copy-relative-path"]')).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 13. File menu contains Cut, Copy, Copy Path, Copy Relative Path but NOT Paste
  // -----------------------------------------------------------------------
  test('file menu contains Cut, Copy, Copy Path, Copy Relative Path but not Paste', () => {
    const { container } = renderContextMenu({
      isDirectory: false,
      path: '/src/index.ts',
    });

    expect(container.querySelector('[data-testid="menu-cut"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-copy"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-copy-path"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-copy-relative-path"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu-paste"]')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 14. Cut calls onCut with the correct path
  // -----------------------------------------------------------------------
  test('Cut calls onCut with the correct path', () => {
    const onCut = mock(() => {});
    const { container } = renderContextMenu({ isDirectory: true, path: '/src', onCut });

    const item = container.querySelector('[data-testid="menu-cut"]') as HTMLElement;
    fireEvent.click(item);

    expect(onCut).toHaveBeenCalledWith('/src');
  });

  // -----------------------------------------------------------------------
  // 15. Copy calls onCopy with the correct path
  // -----------------------------------------------------------------------
  test('Copy calls onCopy with the correct path', () => {
    const onCopy = mock(() => {});
    const { container } = renderContextMenu({ isDirectory: true, path: '/src', onCopy });

    const item = container.querySelector('[data-testid="menu-copy"]') as HTMLElement;
    fireEvent.click(item);

    expect(onCopy).toHaveBeenCalledWith('/src');
  });

  // -----------------------------------------------------------------------
  // 16. Paste calls onPaste with the correct path (directory only)
  // -----------------------------------------------------------------------
  test('Paste calls onPaste with the correct path for a directory', () => {
    const onPaste = mock(() => {});
    const { container } = renderContextMenu({
      isDirectory: true,
      path: '/src',
      onPaste,
      clipboardHasItem: true,
    });

    const item = container.querySelector('[data-testid="menu-paste"]') as HTMLElement;
    fireEvent.click(item);

    expect(onPaste).toHaveBeenCalledWith('/src');
  });

  // -----------------------------------------------------------------------
  // 17. Copy Path writes absolute path to navigator.clipboard
  // -----------------------------------------------------------------------
  test('Copy Path writes absolute path to navigator.clipboard', async () => {
    const writeText = mock(() => Promise.resolve());
    const originalClipboard = globalThis.navigator.clipboard;
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    try {
      const { container } = renderContextMenu({
        isDirectory: true,
        path: 'src/components',
        workspaceCwd: '/home/user/project',
      });

      const item = container.querySelector('[data-testid="menu-copy-path"]') as HTMLElement;
      fireEvent.click(item);

      expect(writeText).toHaveBeenCalledWith('/home/user/project/src/components');
    } finally {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
      });
    }
  });

  // -----------------------------------------------------------------------
  // 18. Copy Relative Path writes relative path to navigator.clipboard
  // -----------------------------------------------------------------------
  test('Copy Relative Path writes relative path to navigator.clipboard', () => {
    const writeText = mock(() => Promise.resolve());
    const originalClipboard = globalThis.navigator.clipboard;
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    try {
      const { container } = renderContextMenu({
        isDirectory: true,
        path: 'src/components',
      });

      const item = container.querySelector(
        '[data-testid="menu-copy-relative-path"]',
      ) as HTMLElement;
      fireEvent.click(item);

      expect(writeText).toHaveBeenCalledWith('src/components');
    } finally {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
      });
    }
  });

  // -----------------------------------------------------------------------
  // 19. Paste is disabled/greyed when clipboardHasItem is false
  // -----------------------------------------------------------------------
  test('Paste is disabled/greyed when clipboardHasItem is false', () => {
    const onPaste = mock(() => {});
    const { container } = renderContextMenu({
      isDirectory: true,
      onPaste,
      clipboardHasItem: false,
    });

    const item = container.querySelector('[data-testid="menu-paste"]') as HTMLElement;
    expect(item).not.toBeNull();
    // Should have opacity 0.4 when disabled
    const style = (item as HTMLElement).style;
    expect(style.opacity).toBe('0.4');
  });

  // -----------------------------------------------------------------------
  // 20. Paste does not call onPaste when clipboardHasItem is false
  // -----------------------------------------------------------------------
  test('Paste does not call onPaste when clipboardHasItem is false', () => {
    const onPaste = mock(() => {});
    const { container } = renderContextMenu({
      isDirectory: true,
      onPaste,
      clipboardHasItem: false,
    });

    const item = container.querySelector('[data-testid="menu-paste"]') as HTMLElement;
    fireEvent.click(item);

    expect(onPaste).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 21. Paste is not rendered for files
  // -----------------------------------------------------------------------
  test('Paste is not rendered for files', () => {
    const { container } = renderContextMenu({
      isDirectory: false,
      path: '/src/index.ts',
      clipboardHasItem: true,
    });

    expect(container.querySelector('[data-testid="menu-paste"]')).toBeNull();
  });
});
