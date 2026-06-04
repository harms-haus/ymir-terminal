import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { sendRequest } from '../lib/send-request';

interface ClipboardState {
  mode: 'copy' | 'cut' | null;
  sourcePath: string | null; // relative path within workspace
  workspaceId: string | null;
}

interface FileClipboardContextValue {
  clipboard: ClipboardState;
  cut: (path: string, workspaceId: string) => void;
  copy: (path: string, workspaceId: string) => void;
  clear: () => void;
  paste: (targetDir: string, workspaceId: string) => Promise<void>;
}

const FileClipboardContext = createContext<FileClipboardContextValue | null>(null);

export function FileClipboardProvider({ children }: { children: ReactNode }) {
  const [clipboard, setClipboard] = useState<ClipboardState>({
    mode: null,
    sourcePath: null,
    workspaceId: null,
  });

  const cut = useCallback((path: string, workspaceId: string) => {
    setClipboard({ mode: 'cut', sourcePath: path, workspaceId });
  }, []);

  const copy = useCallback((path: string, workspaceId: string) => {
    setClipboard({ mode: 'copy', sourcePath: path, workspaceId });
  }, []);

  const clear = useCallback(() => {
    setClipboard({ mode: null, sourcePath: null, workspaceId: null });
  }, []);

  const paste = useCallback(
    async (targetDir: string, workspaceId: string) => {
      if (!clipboard.mode || !clipboard.sourcePath || !clipboard.workspaceId) return;
      if (clipboard.workspaceId !== workspaceId) return;
      if (clipboard.sourcePath === targetDir) return;
      // Prevent pasting into a child of the source (would cause infinite recursion for copy or data loss for cut)
      if (targetDir.startsWith(clipboard.sourcePath + '/')) return;

      const channel = clipboard.mode === 'copy' ? 'file.copy' : 'file.move';
      await sendRequest(channel, {
        workspaceId,
        srcPath: clipboard.sourcePath,
        destDir: targetDir,
      });
      // Only clear on success
      setClipboard({ mode: null, sourcePath: null, workspaceId: null });
    },
    [clipboard],
  );

  const value = useMemo(
    () => ({ clipboard, cut, copy, clear, paste }),
    [clipboard, cut, copy, clear, paste],
  );

  return <FileClipboardContext.Provider value={value}>{children}</FileClipboardContext.Provider>;
}

export function useFileClipboard(): FileClipboardContextValue {
  const context = useContext(FileClipboardContext);
  if (!context) {
    throw new Error('useFileClipboard must be used within a FileClipboardProvider');
  }
  return context;
}
