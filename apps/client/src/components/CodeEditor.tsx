import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { oneDark } from '@codemirror/theme-one-dark';
import { useMemo, useRef } from 'react';

const LANG_EXTENSIONS: Record<string, () => unknown> = {
  javascript,
  css,
  html,
  json,
  markdown,
  python,
  rust,
};

interface CodeEditorProps {
  content: string;
  language?: string;
  onChange?: (value: string) => void;
  onSave?: (content: string) => void;
}

export function CodeEditor({ content, language, onChange, onSave }: CodeEditorProps) {
  const extensions = useMemo(() => {
    return language && LANG_EXTENSIONS[language] ? [LANG_EXTENSIONS[language]()] : [];
  }, [language]);
  const currentValueRef = useRef(content);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave?.(currentValueRef.current);
    }
  };

  return (
    <div
      data-testid="code-editor"
      style={{ height: '100%', overflow: 'auto' }}
      onKeyDown={handleKeyDown}
    >
      <CodeMirror
        value={content}
        theme={oneDark}
        extensions={extensions}
        onChange={(value) => {
          currentValueRef.current = value;
          onChange?.(value);
        }}
        height="100%"
      />
    </div>
  );
}
