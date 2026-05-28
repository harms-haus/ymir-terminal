import { describe, test, expect } from 'bun:test';
import { getFileIconName, getLanguageFromPath } from './file-icons';

describe('getFileIconName', () => {
  test("returns 'typescript' for .ts files", () => {
    expect(getFileIconName('test.ts')).toBe('typescript');
  });

  test("returns 'react_ts' for .tsx files", () => {
    expect(getFileIconName('test.tsx')).toBe('react_ts');
  });

  test("returns 'javascript' for .js files", () => {
    expect(getFileIconName('test.js')).toBe('javascript');
  });

  test("returns 'react' for .jsx files", () => {
    expect(getFileIconName('test.jsx')).toBe('react');
  });

  test("returns 'css' for .css files", () => {
    expect(getFileIconName('test.css')).toBe('css');
  });

  test("returns 'json' for .json files", () => {
    expect(getFileIconName('test.json')).toBe('json');
  });

  test("returns 'markdown' for .md files", () => {
    expect(getFileIconName('test.md')).toBe('markdown');
  });

  test("returns 'python' for .py files", () => {
    expect(getFileIconName('test.py')).toBe('python');
  });

  test("returns 'rust' for .rs files", () => {
    expect(getFileIconName('test.rs')).toBe('rust');
  });

  test("returns 'makefile' for Makefile", () => {
    expect(getFileIconName('Makefile')).toBe('makefile');
  });

  test("returns 'file' for unknown extensions", () => {
    expect(getFileIconName('unknown.xyz')).toBe('file');
  });

  test("returns 'folder' for folder", () => {
    expect(getFileIconName('folder')).toBe('folder');
  });

  test("returns 'folder_open' for folder.open", () => {
    expect(getFileIconName('folder.open')).toBe('folder_open');
  });
});

describe('getLanguageFromPath', () => {
  test("returns 'typescript' for .ts path", () => {
    expect(getLanguageFromPath('test.ts')).toBe('typescript');
  });

  test("returns null for unknown extension", () => {
    expect(getLanguageFromPath('unknown.xyz')).toBeNull();
  });
});
