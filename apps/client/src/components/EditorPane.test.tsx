/// <reference lib="dom" />
import { setupTestDom, setupAllMocks } from '../test-helpers/mock-setup';
await setupTestDom();
setupAllMocks();

import { describe, test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, cleanup, act } from '@testing-library/react';

import React from 'react';

// ---------------------------------------------------------------------------
// Mock sendRequest — capture and control responses
// ---------------------------------------------------------------------------

let sendRequestResolve: ((value: unknown) => void) | null = null;
let sendRequestReject: ((err: unknown) => void) | null = null;

const mockSendRequest = mock((_channel: string, _payload: unknown) => {
  return new Promise((resolve, reject) => {
    sendRequestResolve = resolve;
    sendRequestReject = reject;
  });
});

mock.module('../lib/send-request', () => ({
  sendRequest: mockSendRequest,
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

const { EditorPane } = await import('./EditorPane');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EditorPaneProps {
  workspaceId: string;
  filePath: string;
  onDirtyChange: (filePath: string, dirty: boolean) => void;
}

function renderEditorPane(overrides?: Partial<EditorPaneProps>) {
  const props: EditorPaneProps = {
    workspaceId: 'ws-1',
    filePath: '/src/index.ts',
    onDirtyChange: mock(() => {}),
    ...overrides,
  };
  return {
    ...render(React.createElement(EditorPane, props)),
    props,
  };
}

/** Resolve the pending sendRequest with a successful file response. */
async function resolveFileLoad(content: string, language = 'typescript') {
  await act(async () => {
    sendRequestResolve!({ content, language });
  });
}

/** Reject the pending sendRequest with an error. */
async function rejectFileLoad(message: string) {
  await act(async () => {
    sendRequestReject!(new Error(message));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

describe('EditorPane', () => {
  afterEach(() => {
    cleanup();
    sendRequestResolve = null;
    sendRequestReject = null;
    mockSendRequest.mockClear();
  });

  // -----------------------------------------------------------------------
  // 1. Renders editor without crashing
  // -----------------------------------------------------------------------
  test('renders editor without crashing', async () => {
    const { container } = renderEditorPane();
    // Initially shows loading state
    expect(container.textContent).toContain('Loading...');

    await resolveFileLoad('hello');
    // After load, loading indicator is gone and editor is rendered
    expect(container.textContent).not.toContain('Loading...');
  });

  // -----------------------------------------------------------------------
  // 2. Loads file on mount — sendRequest is called with correct args
  // -----------------------------------------------------------------------
  test('loads file on mount by calling sendRequest', () => {
    renderEditorPane({ workspaceId: 'ws-42', filePath: '/src/app.ts' });

    expect(mockSendRequest).toHaveBeenCalledTimes(1);
    expect(mockSendRequest).toHaveBeenCalledWith('file.read', {
      workspaceId: 'ws-42',
      path: '/src/app.ts',
    });
  });

  // -----------------------------------------------------------------------
  // 3. Displays content — file content is passed to the editor
  // -----------------------------------------------------------------------
  test('displays file content in the editor', async () => {
    const { getByTestId } = renderEditorPane();
    await resolveFileLoad('const x = 42;');

    // The mock CodeMirror renders content inside data-testid="cm-content"
    expect(getByTestId('cm-content').textContent).toBe('const x = 42;');
  });

  // -----------------------------------------------------------------------
  // 4. Calls onDirtyChange when content changes
  // -----------------------------------------------------------------------
  test('calls onDirtyChange when content changes', async () => {
    const onDirtyChange = mock((_filePath: string, _dirty: boolean) => {});
    const { getByTestId } = renderEditorPane({ onDirtyChange });
    await resolveFileLoad('initial content');

    // Verify the CodeEditor and CodeMirror mock rendered — the actual
    // onChange → onDirtyChange wiring is exercised in the next test.
    // The mock passes through data-testid from CodeEditor, so it renders as "code-editor".
    expect(getByTestId('code-editor')).toBeTruthy();
    expect(onDirtyChange).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4b. (Direct) onDirtyChange fires via captured CodeMirror onChange
  // -----------------------------------------------------------------------
  test('calls onDirtyChange when CodeMirror onChange fires', async () => {
    // Override the @uiw/react-codemirror mock to capture onChange
    let capturedOnChange: ((value: string) => void) | undefined;

    mock.module('@uiw/react-codemirror', () => {
      const CapturingMock = ({
        value,
        onChange,
        ...rest
      }: {
        value: string;
        onChange?: (value: string) => void;
        'data-testid'?: string;
        [key: string]: unknown;
      }) => {
        capturedOnChange = onChange;
        return React.createElement(
          'div',
          { 'data-testid': rest['data-testid'] ?? 'mock-codemirror' },
          React.createElement('div', { 'data-testid': 'cm-content' }, value),
        );
      };
      return { default: CapturingMock };
    });

    // Re-import to get fresh component with new mock
    const { EditorPane: FreshEditorPane } = await import('./EditorPane');

    const onDirtyChange = mock((_filePath: string, _dirty: boolean) => {});
    render(
      React.createElement(FreshEditorPane, {
        workspaceId: 'ws-1',
        filePath: '/src/index.ts',
        onDirtyChange,
      }),
    );

    // Resolve the file load
    await act(async () => {
      sendRequestResolve!({ content: 'hello', language: 'typescript' });
    });

    expect(capturedOnChange).toBeTruthy();

    // Simulate CodeMirror firing onChange
    await act(async () => {
      capturedOnChange!('modified content');
    });

    expect(onDirtyChange).toHaveBeenCalledTimes(1);
    expect(onDirtyChange).toHaveBeenCalledWith('/src/index.ts', true);
  });

  // -----------------------------------------------------------------------
  // 5. Handles read error — mock error response, verify no crash
  // -----------------------------------------------------------------------
  test('handles read error without crashing', async () => {
    const { container } = renderEditorPane();
    await rejectFileLoad('File not found');

    // Should show error state, not crash
    expect(container.textContent).toContain('Failed to load file.');
    expect(container.textContent).toContain('File not found');

    // Should have a Retry button
    const retryBtn = container.querySelector('button');
    expect(retryBtn).toBeTruthy();
    expect(retryBtn!.textContent).toBe('Retry');
  });
});
