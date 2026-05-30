/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

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
  } = {},
) {
  const onNewFile = overrides.onNewFile ?? mock(() => {});
  const onNewFolder = overrides.onNewFolder ?? mock(() => {});
  const onRename = overrides.onRename ?? mock(() => {});
  const onDelete = overrides.onDelete ?? mock(() => {});
  const onOpenEditor = overrides.onOpenEditor ?? mock(() => {});

  const result = render(
    React.createElement(
      FileTreeContextMenu,
      {
        path: overrides.path ?? '/src',
        isDirectory: overrides.isDirectory ?? true,
        onNewFile,
        onNewFolder,
        onRename,
        onDelete,
        onOpenEditor,
      } as React.Attributes & React.ComponentProps<typeof FileTreeContextMenu>,
      React.createElement('div', { 'data-testid': 'trigger' }, 'Trigger'),
    ),
  );

  return { ...result, onNewFile, onNewFolder, onRename, onDelete, onOpenEditor };
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
    expect(menu).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Context menu renders for a file
  // -----------------------------------------------------------------------
  test('renders context menu for a file', () => {
    const { container } = renderContextMenu({ isDirectory: false, path: '/src/index.ts' });

    const menu = container.querySelector('[data-testid="context-menu"]');
    expect(menu).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 3. Directory context menu contains: New File, New Folder, Rename, Delete
  // -----------------------------------------------------------------------
  test('directory menu contains New File, New Folder, Rename, Delete', () => {
    const { container } = renderContextMenu({ isDirectory: true });

    expect(container.querySelector('[data-testid="menu-new-file"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-new-folder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-rename"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-delete"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 4. File context menu contains: Open in Editor, Rename, Delete
  // -----------------------------------------------------------------------
  test('file menu contains Open in Editor, Rename, Delete', () => {
    const { container } = renderContextMenu({ isDirectory: false, path: '/src/index.ts' });

    expect(container.querySelector('[data-testid="menu-open-editor"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-rename"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-delete"]')).toBeTruthy();
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
  test('Delete calls onDelete with the path', () => {
    const onDelete = mock(() => {});
    const originalConfirm = globalThis.confirm;
    globalThis.confirm = () => true;
    try {
      const { container } = renderContextMenu({
        isDirectory: true,
        path: '/src/components',
        onDelete,
      });

      const item = container.querySelector('[data-testid="menu-delete"]') as HTMLElement;
      fireEvent.click(item);

      expect(onDelete).toHaveBeenCalledWith('/src/components');
    } finally {
      globalThis.confirm = originalConfirm;
    }
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
});
