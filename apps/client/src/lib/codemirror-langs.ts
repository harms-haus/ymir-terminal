import type { Extension } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';

export const LANG_EXTENSIONS: Record<string, () => Extension> = {
  javascript,
  typescript: () => javascript({ typescript: true }),
  css,
  html,
  json,
  markdown,
  python,
  rust,
};
