import { createContext, useContext } from 'react';

export interface FileTreeContextValue {
  onNewFile?: (parentDir: string) => void;
  onNewFolder?: (parentDir: string) => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
  onOpenEditor?: (path: string) => void;
  onCut?: (path: string) => void;
  onCopy?: (path: string) => void;
  onPaste?: (targetDir: string) => void;
  clipboardHasItem?: boolean;
  workspaceCwd?: string;
}

export const FileTreeContext = createContext<FileTreeContextValue | null>(null);

export function useFileTreeContext(): FileTreeContextValue {
  const ctx = useContext(FileTreeContext);
  if (!ctx) {
    throw new Error('useFileTreeContext must be used within a FileTreeContext.Provider');
  }
  return ctx;
}
