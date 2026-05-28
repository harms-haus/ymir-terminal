import type { Tab } from '../hooks/useTabs';

export function findEditorTab(tabs: Tab[], filePath: string): Tab | undefined {
  return tabs.find((t) => t.type === 'editor' && t.filePath === filePath);
}

export function createEditorTabOpts(filePath: string): {
  type: 'editor';
  title: string;
  filePath: string;
} {
  const parts = filePath.split('/');
  const title = parts[parts.length - 1] || filePath;
  return { type: 'editor', title, filePath };
}
