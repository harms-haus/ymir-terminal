import '../lib/monaco-loader';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DiffEditor } from '@monaco-editor/react';
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
import type { GitDiffDataResponse, GitCommitDiffResponse } from '@ymir/shared';

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
  commitSha?: string;
  parentSha?: string;
  onOpenEditor: (filePath: string) => void;
}

export function DiffViewer({
  workspaceId,
  repoPath,
  filePath,
  staged,
  commitSha,
  parentSha,
  onOpenEditor,
}: DiffViewerProps) {
  const [mode, setMode] = useState<DiffViewMode>('changes');
  const [diffState, setDiffState] = useState<DiffLoadState | null>(null);
  const [fetchRetry, setFetchRetry] = useState(0);

  const handleOpenEditor = useCallback(() => onOpenEditor(filePath), [onOpenEditor, filePath]);
  const generationRef = useRef(0);
  const currentKey = commitSha
    ? `${workspaceId}:${repoPath}:${filePath}:${commitSha}`
    : `${workspaceId}:${repoPath}:${filePath}:${staged}`;

  useEffect(() => {
    if (!workspaceId || !repoPath || !filePath) return;

    const controller = new AbortController();
    let cancelled = false;
    const gen = ++generationRef.current;

    const requestPromise = commitSha
      ? sendRequest<GitCommitDiffResponse>(
          'git.commitDiff',
          {
            workspaceId,
            repoPath,
            commitSha,
            parentSha: parentSha ?? '',
            filePath,
          },
          { signal: controller.signal },
        )
      : sendRequest<GitDiffDataResponse>(
          'git.diffData',
          {
            workspaceId,
            repoPath,
            filePath,
            staged,
          },
          { signal: controller.signal },
        );

    requestPromise
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
  }, [workspaceId, repoPath, filePath, staged, commitSha, parentSha, fetchRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrentKey = diffState?.key === currentKey;
  const isLoading = !isCurrentKey;
  const diffError = isCurrentKey ? diffState!.error : null;
  const originalContent = isCurrentKey ? diffState!.originalContent : '';
  const modifiedContent = isCurrentKey ? diffState!.modifiedContent : '';
  const additions = isCurrentKey ? diffState!.additions : 0;
  const deletions = isCurrentKey ? diffState!.deletions : 0;

  const langKey = useMemo(() => getLanguageFromPath(filePath), [filePath]);

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
        commitSha={commitSha}
      />
      <div style={{ flex: 1 }}>
        <DiffEditor
          original={originalContent}
          modified={modifiedContent}
          originalLanguage={langKey ?? undefined}
          modifiedLanguage={langKey ?? undefined}
          theme="vs-dark"
          height="100%"
          options={{
            readOnly: true,
            renderSideBySide: mode !== 'inline',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderOverviewRuler: true,
          }}
        />
      </div>
    </div>
  );
}
