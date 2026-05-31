import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { unifiedMergeView } from '@codemirror/merge';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { DiffViewerHeader, type DiffViewMode } from './DiffViewerHeader';
import { sendRequest } from '../lib/send-request';
import { getLanguageFromPath } from '../lib/file-icons';
import {
  COLOR_TEXT_DIM,
  COLOR_ERROR,
  COLOR_ERROR_DETAIL,
  COLOR_TEXT_BRIGHT,
  COLOR_RETRY_BTN_BG,
} from '../lib/theme';
import type { GitDiffDataResponse } from '@ymir/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LANG_EXTENSIONS: Record<string, () => any> = {
  javascript,
  css,
  html,
  json,
  markdown,
  python,
  rust,
};

interface DiffLoadState {
  key: string;
  originalContent: string;
  modifiedContent: string;
  additions: number;
  deletions: number;
  error: string | null;
}

interface DiffViewerProps {
  workspaceId: string;
  repoPath: string;
  filePath: string;
  staged: boolean;
  onOpenEditor: (filePath: string) => void;
}

export function DiffViewer({
  workspaceId,
  repoPath,
  filePath,
  staged,
  onOpenEditor,
}: DiffViewerProps) {
  const [mode, setMode] = useState<DiffViewMode>('changes');
  const [diffState, setDiffState] = useState<DiffLoadState | null>(null);
  const [fetchRetry, setFetchRetry] = useState(0);

  const handleOpenEditor = useCallback(() => onOpenEditor(filePath), [onOpenEditor, filePath]);
  const generationRef = useRef(0);
  const currentKey = `${workspaceId}:${repoPath}:${filePath}:${staged}`;

  useEffect(() => {
    if (!workspaceId || !repoPath || !filePath) return;

    const controller = new AbortController();
    let cancelled = false;
    const gen = ++generationRef.current;

    sendRequest<GitDiffDataResponse>(
      'git.diffData',
      {
        workspaceId,
        repoPath,
        filePath,
        staged,
      },
      { signal: controller.signal },
    )
      .then((result) => {
        if (cancelled || gen !== generationRef.current) return;
        setDiffState({
          key: currentKey,
          originalContent: result.originalContent,
          modifiedContent: result.modifiedContent,
          additions: result.additions,
          deletions: result.deletions,
          error: null,
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (cancelled || gen !== generationRef.current) return;
        setDiffState({
          key: currentKey,
          originalContent: '',
          modifiedContent: '',
          additions: 0,
          deletions: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [workspaceId, repoPath, filePath, staged, fetchRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrentKey = diffState?.key === currentKey;
  const isLoading = !isCurrentKey;
  const diffError = isCurrentKey ? diffState!.error : null;
  const originalContent = isCurrentKey ? diffState!.originalContent : '';
  const modifiedContent = isCurrentKey ? diffState!.modifiedContent : '';
  const additions = isCurrentKey ? diffState!.additions : 0;
  const deletions = isCurrentKey ? diffState!.deletions : 0;

  const langExtension = useMemo(() => {
    const langKey = getLanguageFromPath(filePath);
    if (!langKey) return undefined;
    const extFn = LANG_EXTENSIONS[langKey];
    return extFn ? extFn() : undefined;
  }, [filePath]);

  const extensions = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exts: any[] = [EditorView.editable.of(false)];
    if (langExtension) {
      exts.push(langExtension);
    }
    exts.push(
      unifiedMergeView({
        original: originalContent,
        highlightChanges: true,
        gutter: true,
        syntaxHighlightDeletions: true,
        mergeControls: false,
        collapseUnchanged: mode === 'changes' ? { margin: 3, minSize: 4 } : undefined,
      }),
    );
    return exts;
  }, [mode, originalContent, langExtension]);

  if (isLoading) {
    return (
      <div
        data-testid="diff-viewer"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLOR_TEXT_DIM,
        }}
      >
        Loading diff...
      </div>
    );
  }

  if (diffError) {
    return (
      <div
        data-testid="diff-viewer"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: COLOR_ERROR }}>
          Failed to load diff: <span style={{ color: COLOR_ERROR_DETAIL }}>{diffError}</span>
        </span>
        <button
          onClick={() => setFetchRetry((r) => r + 1)}
          style={{
            background: COLOR_RETRY_BTN_BG,
            color: COLOR_TEXT_BRIGHT,
            border: 'none',
            borderRadius: 4,
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const fileName = filePath.split('/').pop() || filePath;

  return (
    <div
      data-testid="diff-viewer"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <DiffViewerHeader
        fileName={fileName}
        additions={additions}
        deletions={deletions}
        mode={mode}
        onModeChange={setMode}
        onOpenEditor={handleOpenEditor}
      />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <CodeMirror
          key={filePath}
          value={modifiedContent}
          height="100%"
          style={{ height: '100%' }}
          theme={oneDark}
          extensions={extensions}
        />
      </div>
    </div>
  );
}
