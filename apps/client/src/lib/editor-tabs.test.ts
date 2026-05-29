import { describe, test, expect } from 'bun:test';
import type { Tab } from '../hooks/useTabs';
import { findEditorTab, createEditorTabOpts } from './editor-tabs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditorTab(filePath: string, id: string = crypto.randomUUID()): Tab {
  const parts = filePath.split('/');
  return {
    id,
    type: 'editor',
    title: parts[parts.length - 1] || filePath,
    filePath,
  };
}

function makeTerminalTab(title = 'Terminal 1'): Tab {
  return { id: crypto.randomUUID(), type: 'terminal', title, terminalId: crypto.randomUUID() };
}

// ---------------------------------------------------------------------------
// findEditorTab
// ---------------------------------------------------------------------------

describe('findEditorTab', () => {
  test('returns existing tab when file is already open', () => {
    const editorTab = makeEditorTab('/src/main.ts');
    const tabs: Tab[] = [makeTerminalTab(), editorTab, makeEditorTab('/src/utils.ts')];

    const result = findEditorTab(tabs, '/src/main.ts');

    expect(result).toBeDefined();
    expect(result!.id).toBe(editorTab.id);
    expect(result!.filePath).toBe('/src/main.ts');
    expect(result!.type).toBe('editor');
  });

  test('returns undefined when no tab matches the file path', () => {
    const tabs: Tab[] = [makeTerminalTab(), makeEditorTab('/src/utils.ts')];

    const result = findEditorTab(tabs, '/src/main.ts');

    expect(result).toBeUndefined();
  });

  test('does not match terminal tabs even if titles coincide', () => {
    const termTab = makeTerminalTab('main.ts');
    const tabs: Tab[] = [termTab];

    const result = findEditorTab(tabs, '/src/main.ts');

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createEditorTabOpts
// ---------------------------------------------------------------------------

describe('createEditorTabOpts', () => {
  test('creates tab opts with correct type, title, and filePath', () => {
    const opts = createEditorTabOpts('/src/components/App.tsx');

    expect(opts.type).toBe('editor');
    expect(opts.title).toBe('App.tsx');
    expect(opts.filePath).toBe('/src/components/App.tsx');
  });

  test('extracts basename as title from deeply nested path', () => {
    const opts = createEditorTabOpts('/a/b/c/d/e/config.json');

    expect(opts.title).toBe('config.json');
  });

  test('handles filename without directory separators', () => {
    const opts = createEditorTabOpts('README.md');

    expect(opts.title).toBe('README.md');
    expect(opts.filePath).toBe('README.md');
  });
});

// ---------------------------------------------------------------------------
// Single tab per file constraint
// ---------------------------------------------------------------------------

describe('single tab per file constraint', () => {
  test('re-opening the same file returns the existing tab instead of creating a new one', () => {
    const existing = makeEditorTab('/src/index.ts', 'tab-1');
    const tabs: Tab[] = [existing];

    const found = findEditorTab(tabs, '/src/index.ts');

    // File is already open — consumer should NOT call createEditorTabOpts
    expect(found).toBeDefined();
    expect(found!.id).toBe('tab-1');

    // Simulate the guard: only create if not found
    if (!found) {
      const opts = createEditorTabOpts('/src/index.ts');
      const newTab: Tab = { id: 'tab-2', ...opts };
      tabs.push(newTab);
    }

    // Only one editor tab for /src/index.ts should exist
    const editorTabsForFile = tabs.filter(
      (t) => t.type === 'editor' && t.filePath === '/src/index.ts',
    );
    expect(editorTabsForFile.length).toBe(1);
  });

  test('opening a different file creates a new tab', () => {
    const existing = makeEditorTab('/src/index.ts', 'tab-1');
    const tabs: Tab[] = [existing];

    const found = findEditorTab(tabs, '/src/other.ts');

    expect(found).toBeUndefined();

    // Different file — safe to create
    const opts = createEditorTabOpts('/src/other.ts');
    const newTab: Tab = { id: 'tab-2', ...opts };
    tabs.push(newTab);

    expect(tabs.length).toBe(2);
    expect(tabs[1].filePath).toBe('/src/other.ts');
    expect(tabs[1].title).toBe('other.ts');
  });
});
