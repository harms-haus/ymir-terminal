import '../lib/monaco-loader';
import { setupMonacoLinks } from '../lib/monaco-links';
import Editor from '@monaco-editor/react';
import { useRef, useEffect } from 'react';

interface CodeEditorProps {
  content: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: (content: string) => void;
}

export function CodeEditor({ content, language, readOnly, onChange, onSave }: CodeEditorProps) {
  const currentValueRef = useRef(content);
  const linkSetupRef = useRef<{ dispose(): void } | null>(null);

  useEffect(() => {
    currentValueRef.current = content;
  }, [content]);

  useEffect(
    () => () => {
      linkSetupRef.current?.dispose();
    },
    [],
  );

  // onKeyDown fallback for test environments (fireEvent.keyDown on wrapper div).
  // In production, Monaco's editor.addCommand handles Ctrl+S internally.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onSave && (e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave(currentValueRef.current);
    }
  };

  return (
    <div data-testid="code-editor" style={{ height: '100%' }} onKeyDown={handleKeyDown}>
      <Editor
        height="100%"
        theme="vs-dark"
        defaultLanguage={language}
        value={content}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
        onChange={(value) => {
          currentValueRef.current = value ?? '';
          onChange?.(value ?? '');
        }}
        onMount={(editor, monaco) => {
          if (onSave) {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
              onSave(currentValueRef.current),
            );
          }
          linkSetupRef.current?.dispose();
          linkSetupRef.current = setupMonacoLinks(monaco);
        }}
      />
    </div>
  );
}
