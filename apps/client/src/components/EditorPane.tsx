import { useRef, useState, useCallback, useEffect } from 'react';
import { CodeEditor } from './CodeEditor';
import { sendRequest } from '../lib/send-request';
import { getLanguageFromPath } from '../lib/file-icons';
import {
  COLOR_ERROR,
  COLOR_ERROR_DETAIL,
  COLOR_RETRY_BTN_BG,
  COLOR_TEXT_BRIGHT,
  COLOR_TEXT_DIM,
} from '../lib/theme';

interface FileLoadState {
  path: string;
  content: string;
  language: string | null;
  error: string | null;
}

interface EditorPaneProps {
  workspaceId: string;
  filePath: string;
  onDirtyChange: (filePath: string, dirty: boolean) => void;
}

export function EditorPane({ workspaceId, filePath, onDirtyChange }: EditorPaneProps) {
  const [fileLoadState, setFileLoadState] = useState<FileLoadState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fetchRetry, setFetchRetry] = useState(0);

  const currentContentRef = useRef<string>('');
  const loadedContentRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;

    sendRequest<{ content: string; language: string }>('file.read', {
      workspaceId,
      path: filePath,
    })
      .then((res) => {
        if (cancelled) return;
        loadedContentRef.current = res.content;
        setFileLoadState({
          path: filePath,
          content: res.content,
          language: res.language || getLanguageFromPath(filePath) || null,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setFileLoadState({
          path: filePath,
          content: '',
          language: null,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, filePath, fetchRetry]);

  const handleEditorChange = useCallback(
    (value: string) => {
      currentContentRef.current = value;
      if (value !== loadedContentRef.current) {
        onDirtyChange(filePath, true);
      } else {
        onDirtyChange(filePath, false);
      }
    },
    [filePath, onDirtyChange],
  );

  const handleSave = useCallback(
    (content: string) => {
      sendRequest('file.write', {
        workspaceId,
        path: filePath,
        content,
      })
        .then(() => {
          onDirtyChange(filePath, false);
        })
        .then(() => {
          setSaveError(null);
        })
        .catch((err) => {
          console.error('Failed to save file:', err);
          setSaveError('Failed to save file. Please try again.');
        });
    },
    [workspaceId, filePath, onDirtyChange],
  );

  const isCurrentFile = fileLoadState?.path === filePath;
  const isLoading = !isCurrentFile;
  const fileError = isCurrentFile ? fileLoadState!.error : null;
  const fileContent = isCurrentFile ? fileLoadState!.content : '';
  const fileLanguage = isCurrentFile ? fileLoadState!.language : null;

  if (isLoading) {
    return (
      <div
        style={{
          color: COLOR_TEXT_DIM,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        Loading...
      </div>
    );
  }

  if (fileError) {
    return (
      <div
        style={{
          color: COLOR_ERROR,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div>Failed to load file.</div>
        <div style={{ fontSize: 12, color: COLOR_ERROR_DETAIL }}>{fileError}</div>
        <button
          onClick={() => setFetchRetry((c) => c + 1)}
          style={{
            background: COLOR_ERROR,
            color: COLOR_TEXT_BRIGHT,
            border: 'none',
            borderRadius: 4,
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: 13,
            alignSelf: 'flex-start',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <CodeEditor
        key={filePath}
        content={fileContent}
        language={fileLanguage ?? undefined}
        onChange={handleEditorChange}
        onSave={handleSave}
      />
      {saveError && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: COLOR_ERROR,
            color: COLOR_TEXT_BRIGHT,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13,
          }}
        >
          <span>{saveError}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleSave(currentContentRef.current)}
              style={{
                background: COLOR_RETRY_BTN_BG,
                color: COLOR_TEXT_BRIGHT,
                border: 'none',
                borderRadius: 4,
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Retry
            </button>
            <button
              onClick={() => setSaveError(null)}
              style={{
                background: 'none',
                color: COLOR_TEXT_BRIGHT,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
