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

  useEffect(() => {
    currentValueRef.current = content;
  }, [content]);

  return (
    <div data-testid="code-editor" style={{ height: '100%' }}>
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
        }}
      />
    </div>
  );
}
