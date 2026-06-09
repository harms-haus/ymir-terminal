/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Override @monaco-editor/react mock — capture callbacks for direct testing
// ---------------------------------------------------------------------------

let capturedOnChange: ((value: string | undefined) => void) | undefined;
let capturedOnMount:
  | ((
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      monaco: any,
    ) => void)
  | undefined;
let capturedDefaultLanguage: string | undefined;
let capturedValue: string | undefined;
let capturedOptions: Record<string, unknown> | undefined;
let capturedTheme: string | undefined;

let addCommandCaptured: Array<{ id: number; handler: () => void }> = [];

const mockEditor = {
  addCommand: (_id: number, handler: () => void) => {
    addCommandCaptured.push({ id: _id, handler });
  },
};

const mockMonaco = {
  KeyMod: { CtrlCmd: 2048 },
  KeyCode: { KeyS: 49 },
  languages: {
    registerLinkProvider: mock(() => ({ dispose: mock(() => {}) })),
  },
  editor: {
    registerLinkOpener: mock(() => ({ dispose: mock(() => {}) })),
  },
};

const MockMonacoEditor = ({
  value,
  onChange,
  onMount,
  defaultLanguage,
  options,
  theme,
  height,
}: {
  value?: string;
  onChange?: (value: string | undefined) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMount?: (editor: any, monaco: any) => void;
  defaultLanguage?: string;
  options?: Record<string, unknown>;
  theme?: string;
  height?: string;
}) => {
  capturedOnChange = onChange;
  capturedOnMount = onMount;
  capturedDefaultLanguage = defaultLanguage;
  capturedValue = value;
  capturedOptions = options;
  capturedTheme = theme;
  void height;
  return React.createElement(
    'div',
    {
      'data-testid': 'monaco-editor',
      'data-default-language': defaultLanguage ?? '',
      'data-theme': theme ?? '',
    },
    React.createElement('div', { 'data-testid': 'cm-content' }, value),
  );
};

mock.module('@monaco-editor/react', () => ({
  default: MockMonacoEditor,
}));

// Trackable mock for setupMonacoLinks — returns a disposable we can inspect
let lastLinkDisposable: { dispose: ReturnType<typeof mock> } | null = null;

const setupMonacoLinksMock = mock(() => {
  lastLinkDisposable = { dispose: mock(() => {}) };
  return lastLinkDisposable;
});

mock.module('../lib/monaco-links', () => ({
  setupMonacoLinks: setupMonacoLinksMock,
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
  filePath?: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: (content: string) => void;
  basicSetup?: boolean | object;
}) {
  capturedOnChange = undefined;
  capturedOnMount = undefined;
  capturedDefaultLanguage = undefined;
  capturedValue = undefined;
  capturedOptions = undefined;
  capturedTheme = undefined;
  addCommandCaptured = [];
  setupMonacoLinksMock.mockClear();
  lastLinkDisposable = null;
  const result = render(React.createElement(CodeEditor, props));
  // If onMount was captured, call it so addCommand gets registered
  if (capturedOnMount) {
    capturedOnMount(mockEditor, mockMonaco);
  }
  return result;
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
  // 2. Accepts language prop and passes it as defaultLanguage
  // -----------------------------------------------------------------------
  test('accepts language prop and passes it to Monaco', () => {
    renderCodeEditor({ content: 'let x = 1;', language: 'javascript' });

    expect(capturedDefaultLanguage).toBe('javascript');
  });

  test('no defaultLanguage without language prop', () => {
    renderCodeEditor({ content: 'some text' });

    expect(capturedDefaultLanguage).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 3. Passes value to Monaco Editor
  // -----------------------------------------------------------------------
  test('passes content as value to Monaco', () => {
    renderCodeEditor({ content: 'const x: number = 1;', language: 'typescript' });

    expect(capturedValue).toBe('const x: number = 1;');
    expect(capturedDefaultLanguage).toBe('typescript');
  });

  // -----------------------------------------------------------------------
  // 4. Registers Ctrl+S save command via onMount
  // -----------------------------------------------------------------------
  test('registers save command when onSave is provided', () => {
    const onSave = mock((_content: string) => {});
    renderCodeEditor({ content: 'save me', onSave });

    // addCommand should have been called once for Ctrl+S
    expect(addCommandCaptured.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 5. Calls onSave when Ctrl+S handler fires
  // -----------------------------------------------------------------------
  test('calls onSave when Ctrl+S handler is triggered', () => {
    const onSave = mock((_content: string) => {});
    renderCodeEditor({ content: 'save me', onSave });

    // Trigger the registered save command handler
    addCommandCaptured[0].handler();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('save me');
  });

  // -----------------------------------------------------------------------
  // 6. Theme should be vs-dark
  // -----------------------------------------------------------------------
  test('passes vs-dark theme to Monaco', () => {
    renderCodeEditor({ content: 'theme test' });

    expect(capturedTheme).toBe('vs-dark');
  });

  // -----------------------------------------------------------------------
  // 7. Accepts onChange callback
  // -----------------------------------------------------------------------
  test('calls onChange when content changes', () => {
    const onChange = mock((_value: string) => {});
    renderCodeEditor({ content: 'initial', onChange });

    // Simulate Monaco calling onChange directly (captured from mock props)
    expect(capturedOnChange).toBeTruthy();
    capturedOnChange!('updated');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('updated');
  });

  // -----------------------------------------------------------------------
  // 8. Passes sensible default options
  // -----------------------------------------------------------------------
  test('passes default editor options', () => {
    renderCodeEditor({ content: 'options test' });

    expect(capturedOptions).toMatchObject({
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
    });
  });

  // -----------------------------------------------------------------------
  // 9. Does not register save command when onSave is not provided
  // -----------------------------------------------------------------------
  test('does not register save command when onSave is omitted', () => {
    renderCodeEditor({ content: 'no save' });

    expect(addCommandCaptured.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 10. Passes readOnly option
  // -----------------------------------------------------------------------
  test('passes readOnly option to Monaco', () => {
    renderCodeEditor({ content: 'readonly test', readOnly: true });

    expect(capturedOptions).toMatchObject({ readOnly: true });
  });
});

// ---------------------------------------------------------------------------
// Link detection (monaco-links integration)
// ---------------------------------------------------------------------------

describe('link detection', () => {
  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Registers Monaco link setup on mount
  // -----------------------------------------------------------------------
  test('registers Monaco link setup on mount', () => {
    renderCodeEditor({ content: 'https://example.com' });

    expect(setupMonacoLinksMock).toHaveBeenCalled();
    expect(setupMonacoLinksMock).toHaveBeenCalledWith(mockMonaco);
  });

  // -----------------------------------------------------------------------
  // 2. Disposes link setup on unmount
  // -----------------------------------------------------------------------
  test('disposes link setup on unmount', () => {
    const { unmount } = renderCodeEditor({ content: 'https://example.com' });

    expect(lastLinkDisposable).toBeTruthy();
    const disposeSpy = lastLinkDisposable!.dispose;

    unmount();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 3. Link setup does not interfere with Ctrl+S
  // -----------------------------------------------------------------------
  test('does not interfere with Ctrl+S save', () => {
    const onSave = mock((_content: string) => {});
    renderCodeEditor({ content: 'save me', onSave });

    // setupMonacoLinks was registered
    expect(setupMonacoLinksMock).toHaveBeenCalled();

    // Ctrl+S command still works
    expect(addCommandCaptured.length).toBe(1);
    addCommandCaptured[0].handler();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('save me');
  });
});
