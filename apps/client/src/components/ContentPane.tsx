import { useRef, useState, useCallback, useEffect } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useTerminal } from '../hooks/useTerminal';
import { Terminal } from './Terminal';
import { CodeEditor } from './CodeEditor';
import { TabBar } from './TabBar';
import { sendRequest } from '../lib/send-request';
import { getLanguageFromPath } from '../lib/file-icons';

export function ContentPane({
  workspaceId,
  fileToOpen,
  onFileOpened,
}: {
  workspaceId: string | null;
  fileToOpen?: string | null;
  onFileOpened?: () => void;
}) {
  const { tabs, activeTabId, createTab, closeTab, activateTab } = useTabs();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeFilePath = activeTab?.filePath ?? null;
  const { createTerminal } = useTerminal(null);
  interface FileLoadState {
    path: string;
    content: string;
    language: string | null;
    error: string | null;
  }
  const [fileLoadState, setFileLoadState] = useState<FileLoadState | null>(null);
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fetchRetry, setFetchRetry] = useState(0);

  const terminalRefs = useRef<Map<string, { focus(): void }>>(new Map());
  const creatingRef = useRef(false);

  const handleAddTerminal = async () => {
    if (!workspaceId || creatingRef.current) return;
    creatingRef.current = true;
    try {
      const terminalId = await createTerminal(workspaceId);
      createTab({ type: 'terminal', title: `Terminal ${tabs.length + 1}`, terminalId });
    } catch (err) {
      console.error('Failed to create terminal:', err);
    } finally {
      creatingRef.current = false;
    }
  };

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.filePath && dirtyFiles.has(tab.filePath)) {
        const fileName = tab.filePath.split('/').pop() || tab.filePath;
        if (!window.confirm(`"${fileName}" has unsaved changes. Close without saving?`)) {
          return;
        }
      }
      if (tab?.terminalId) {
        sendRequest('terminal.close', { terminalId: tab.terminalId }).catch(console.error);
      }
      closeTab(tabId);
    },
    [tabs, closeTab, dirtyFiles],
  );

  const handleAddEditor = useCallback(
    (filePath: string) => {
      const existing = tabs.find((t) => t.filePath === filePath);
      if (existing) {
        activateTab(existing.id);
        return;
      }
      createTab({ type: 'editor', title: filePath.split('/').pop() || filePath, filePath });
    },
    [tabs, activateTab, createTab],
  );

  useEffect(() => {
    if (
      activeTab?.type !== 'editor' ||
      !activeTab.filePath ||
      !workspaceId
    )
      return;
    const filePath = activeTab.filePath;
    let cancelled = false;

    sendRequest<{ content: string; language: string }>('file.read', {
      workspaceId,
      path: filePath,
    })
      .then((res) => {
        if (cancelled) return;
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
  }, [activeTab, workspaceId, fetchRetry]);

  const handleSave = useCallback(
    (content: string) => {
      if (!workspaceId || !activeFilePath) return;
      sendRequest('file.write', {
        workspaceId,
        path: activeFilePath,
        content,
      })
        .then(() => {
          setDirtyFiles((prev) => {
            const next = new Set(prev);
            next.delete(activeFilePath);
            return next;
          });
        })
        .then(() => {
          setSaveError(null);
        })
        .catch((err) => {
          console.error('Failed to save file:', err);
          setSaveError('Failed to save file. Please try again.');
        });
    },
    [workspaceId, activeFilePath],
  );

  useEffect(() => {
    if (activeTab?.type === 'terminal') {
      // Small delay to ensure the terminal is visible (display changed from none to block)
      requestAnimationFrame(() => {
        terminalRefs.current.get(activeTabId!)?.focus();
      });
    }
  }, [activeTabId, activeTab?.type]);

  useEffect(() => {
    if (fileToOpen) {
      handleAddEditor(fileToOpen);
      onFileOpened?.();
    }
  }, [fileToOpen, handleAddEditor, onFileOpened]);

  return (
    <div
      data-testid="content-pane"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={activateTab}
        onClose={handleCloseTab}
        onAddTerminal={handleAddTerminal}
        canAddTerminal={!!workspaceId}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tabs
          .filter((t) => t.type === 'terminal' && t.terminalId)
          .map((t) => (
            <div
              key={t.terminalId}
              style={{
                height: '100%',
                display: t.id === activeTabId ? 'block' : 'none',
              }}
            >
              <Terminal
                terminalId={t.terminalId!}
                ref={(el: { focus(): void } | null) => {
                  if (el) terminalRefs.current.set(t.id, el);
                  else terminalRefs.current.delete(t.id);
                }}
              />
            </div>
          ))}
        {activeTab?.type === 'editor' &&
          (() => {
            const isCurrentFile = fileLoadState?.path === activeTab.filePath;
            const isLoading = !isCurrentFile;
            const fileError = isCurrentFile ? fileLoadState!.error : null;
            const fileContent = isCurrentFile ? fileLoadState!.content : '';
            const fileLanguage = isCurrentFile ? fileLoadState!.language : null;

            if (isLoading) {
              return (
                <div
                  style={{
                    color: '#666',
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
                    color: '#e06050',
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div>Failed to load file.</div>
                  <div style={{ fontSize: 12, color: '#a0706a' }}>{fileError}</div>
                  <button
                    onClick={() => setFetchRetry((c) => c + 1)}
                    style={{
                      background: '#e06050',
                      color: '#fff',
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
                  key={activeTab.filePath}
                  content={fileContent}
                  language={fileLanguage ?? undefined}
                  onChange={() => {
                    if (activeTab.filePath) {
                      setDirtyFiles((prev) => {
                        if (prev.has(activeTab.filePath!)) return prev;
                        const next = new Set(prev);
                        next.add(activeTab.filePath!);
                        return next;
                      });
                    }
                  }}
                  onSave={handleSave}
                />
                {saveError && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: '#e06050',
                      color: '#fff',
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
                        onClick={() => handleSave(fileContent)}
                        style={{
                          background: 'rgba(255,255,255,0.2)',
                          color: '#fff',
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
                          color: '#fff',
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
          })()}
        {!activeTab && (
          <div
            style={{
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            No tabs open
          </div>
        )}
      </div>
    </div>
  );
}
