/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Override @uiw/react-codemirror mock — capture onChange callback for direct testing
// ---------------------------------------------------------------------------

let capturedOnChange: ((value: string) => void) | undefined;

const MockCodeMirror = ({
  value,
  onChange,
  extensions,
  theme,
  height,
  style,
  'data-testid': dataTestId,
  onKeyDown,
}: {
  value: string;
  onChange?: (value: string) => void;
  extensions?: unknown[];
  theme?: unknown;
  height?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) => {
  capturedOnChange = onChange;
  return React.createElement(
    'div',
    {
      'data-testid': dataTestId ?? 'mock-codemirror',
      'data-extensions-count': extensions?.length ?? 0,
      'data-theme': theme ? 'set' : 'unset',
      'data-height': height ?? '',
      style,
      onKeyDown,
    },
    React.createElement('div', { 'data-testid': 'cm-content' }, value),
  );
};

mock.module('@uiw/react-codemirror', () => ({
  default: MockCodeMirror,
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

const { CodeEditor } = await import('./CodeEditor');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCodeEditor(props: {
  content: string;
  language?: string;
  onChange?: (value: string) => void;
  onSave?: (content: string) => void;
}) {
  capturedOnChange = undefined;
  return render(React.createElement(CodeEditor, props));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Cleanup: restore all mocked modules so other test files see the originals
afterAll(() => {
  mock.restore();
});

describe('CodeEditor', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. CodeEditor renders with initial content
  // -----------------------------------------------------------------------
  test('renders with initial content', () => {
    const { getByTestId } = renderCodeEditor({ content: 'hello world' });

    expect(getByTestId('code-editor')).toBeTruthy();
    expect(getByTestId('cm-content').textContent).toBe('hello world');
  });

  // -----------------------------------------------------------------------
  // 2. Accepts language prop for syntax highlighting
  // -----------------------------------------------------------------------
  test('accepts language prop and provides extensions', () => {
    const { getByTestId } = renderCodeEditor({ content: 'let x = 1;', language: 'javascript' });

    expect(getByTestId('code-editor').getAttribute('data-extensions-count')).toBe('1');
  });

  test('no extensions when language is not provided', () => {
    const { getByTestId } = renderCodeEditor({ content: 'some text' });

    expect(getByTestId('code-editor').getAttribute('data-extensions-count')).toBe('0');
  });

  test('no extensions when language is unrecognized', () => {
    const { getByTestId } = renderCodeEditor({ content: 'some text', language: 'brainfuck' });

    expect(getByTestId('code-editor').getAttribute('data-extensions-count')).toBe('0');
  });

  // -----------------------------------------------------------------------
  // 3. Accepts onSave callback
  // -----------------------------------------------------------------------
  test('calls onSave when Ctrl+S is pressed', () => {
    const onSave = mock((content: string) => {
      void content;
    });
    const { getByTestId } = renderCodeEditor({ content: 'save me', onSave });

    const editor = getByTestId('code-editor');
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('save me');
  });

  test('calls onSave when Cmd+S is pressed (macOS)', () => {
    const onSave = mock((content: string) => {
      void content;
    });
    const { getByTestId } = renderCodeEditor({ content: 'save me', onSave });

    const editor = getByTestId('code-editor');
    fireEvent.keyDown(editor, { key: 's', metaKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('save me');
  });

  // -----------------------------------------------------------------------
  // 4. Accepts onChange callback
  // -----------------------------------------------------------------------
  test('calls onChange when content changes', () => {
    const onChange = mock((value: string) => {
      void value;
    });
    renderCodeEditor({ content: 'initial', onChange });

    // Simulate CodeMirror calling onChange directly (captured from mock props)
    expect(capturedOnChange).toBeTruthy();
    capturedOnChange!('updated');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('updated');
  });
});
