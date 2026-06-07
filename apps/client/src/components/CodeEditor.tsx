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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LANG_EXTENSIONS: Record<string, () => any> = {
  javascript,
  css,
  html,
  json,
  markdown,
  python,
  rust,
  typescript: () => javascript({ typescript: true }),
};

interface CodeEditorProps {
  content: string;
  language?: string;
  onChange?: (value: string) => void;
  onSave?: (content: string) => void;
}

export function CodeEditor({ content, language, onChange, onSave }: CodeEditorProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extensions: any = useMemo(() => {
    if (language && LANG_EXTENSIONS[language]) return [LANG_EXTENSIONS[language]()];
    return [];
  }, [language]);
  const currentValueRef = useRef(content);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave?.(currentValueRef.current);
    }
  };

  return (
    <CodeMirror
      data-testid="code-editor"
      value={content}
      theme={oneDark}
      extensions={extensions}
      onChange={(value) => {
        currentValueRef.current = value;
        onChange?.(value);
      }}
      height="100%"
      style={{ height: '100%' }}
      onKeyDown={handleKeyDown}
    />
  );
}
