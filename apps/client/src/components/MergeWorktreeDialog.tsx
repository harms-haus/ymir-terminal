import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  COLOR_BORDER_CARD,
  COLOR_TEXT_CARD,
  COLOR_TEXT_CARD_MUTED,
  COLOR_BTN_PRIMARY,
  COLOR_SPINNER_TRACK,
  COLOR_BG_CARD,
} from '../lib/theme';
import { useWorktreeCopyFiles } from '../hooks/useWorkspaces';
import { Dialog } from './Dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MergeWorktreeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (opts: { deleteAfterMerge: boolean; filesToCopy: string[] }) => void;
  branchName: string;
  targetBranch: string;
  isLoading: boolean;
  worktreePath: string;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  message: {
    fontSize: '14px',
    color: COLOR_TEXT_CARD,
    marginBottom: '16px',
    lineHeight: 1.5,
  },
  branchName: {
    fontWeight: 600,
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '24px',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: COLOR_BTN_PRIMARY,
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: '13px',
    color: COLOR_TEXT_CARD_MUTED,
    cursor: 'pointer',
    userSelect: 'none',
  },
  fileListContainer: {
    maxHeight: '150px',
    overflowY: 'auto' as const,
    border: `1px solid ${COLOR_BORDER_CARD}`,
    borderRadius: '6px',
    padding: '8px',
    marginBottom: '24px',
    backgroundColor: COLOR_BG_CARD,
  },
  fileCheckboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 0',
    minHeight: '28px',
  },
  fileCheckboxLabel: {
    fontSize: '13px',
    color: COLOR_TEXT_CARD,
    cursor: 'pointer',
    userSelect: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  noFilesText: {
    fontSize: '13px',
    color: COLOR_TEXT_CARD_MUTED,
    padding: '4px 0',
  },
  sectionLabel: {
    fontSize: '13px',
    color: COLOR_TEXT_CARD_MUTED,
    marginBottom: '8px',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  mergeButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: COLOR_BTN_PRIMARY,
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  mergeButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: 'transparent',
    color: COLOR_TEXT_CARD_MUTED,
    border: `1px solid ${COLOR_BORDER_CARD}`,
    borderRadius: '6px',
    cursor: 'pointer',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: `2px solid ${COLOR_SPINNER_TRACK}`,
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
};

// ---------------------------------------------------------------------------
// Inner form — mounts fresh each time the dialog opens so state resets
// ---------------------------------------------------------------------------

function MergeWorktreeForm({
  onClose,
  onConfirm,
  branchName,
  targetBranch,
  isLoading,
  worktreePath,
  workspaceId,
}: {
  onClose: () => void;
  onConfirm: (opts: { deleteAfterMerge: boolean; filesToCopy: string[] }) => void;
  branchName: string;
  targetBranch: string;
  isLoading: boolean;
  worktreePath: string;
  workspaceId: string;
}) {
  const [deleteAfterMerge, setDeleteAfterMerge] = useState(false);
  // null = not yet initialized from server data; Set = user selection ready
  const [selectedFiles, setSelectedFiles] = useState<Set<string> | null>(null);

  const { data: copyFiles } = useWorktreeCopyFiles(workspaceId, worktreePath);
  const configuredFiles = useMemo(() => copyFiles?.configuredFiles ?? [], [copyFiles]);
  const untrackedFiles = useMemo(() => copyFiles?.untrackedFiles ?? [], [copyFiles]);

  // Initialize file selection once copyFiles data arrives
  if (selectedFiles === null && copyFiles) {
    if (configuredFiles.length > 0) {
      setSelectedFiles(new Set(configuredFiles));
    } else if (untrackedFiles.length > 0) {
      setSelectedFiles(new Set(untrackedFiles));
    } else {
      setSelectedFiles(new Set());
    }
  }

  // Use empty set as fallback while loading
  const effectiveSelectedFiles = useMemo(() => selectedFiles ?? new Set<string>(), [selectedFiles]);

  const toggleFile = useCallback((file: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  }, []);

  const allFiles = [...new Set([...configuredFiles, ...untrackedFiles])];

  const handleConfirm = useCallback(() => {
    if (isLoading) return;
    onConfirm({ deleteAfterMerge, filesToCopy: Array.from(effectiveSelectedFiles) });
  }, [deleteAfterMerge, isLoading, onConfirm, effectiveSelectedFiles]);

  return (
    <div>
      <div style={styles.message}>
        Merge worktree <span style={styles.branchName}>{branchName}</span> into{' '}
        <span style={styles.branchName}>{targetBranch}</span>?
      </div>

      <div style={styles.checkboxRow}>
        <input
          id="worktree-delete-after-merge"
          type="checkbox"
          checked={deleteAfterMerge}
          onChange={(e) => setDeleteAfterMerge(e.target.checked)}
          disabled={isLoading}
          style={styles.checkbox}
        />
        <label htmlFor="worktree-delete-after-merge" style={styles.checkboxLabel}>
          Delete worktree after merge
        </label>
      </div>

      {allFiles.length > 0 && (
        <>
          <div style={styles.sectionLabel}>Files to copy to target</div>
          <div style={styles.fileListContainer}>
            {allFiles.map((file) => (
              <div key={file} style={styles.fileCheckboxRow}>
                <input
                  id={`worktree-copy-file-${file}`}
                  type="checkbox"
                  checked={effectiveSelectedFiles.has(file)}
                  onChange={() => toggleFile(file)}
                  disabled={isLoading}
                  style={styles.checkbox}
                />
                <label
                  htmlFor={`worktree-copy-file-${file}`}
                  title={file}
                  style={styles.fileCheckboxLabel}
                >
                  {file}
                </label>
              </div>
            ))}
          </div>
        </>
      )}
      {allFiles.length === 0 && copyFiles && (
        <div style={styles.noFilesText}>No untracked files</div>
      )}

      <div style={styles.buttonRow}>
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          style={styles.cancelButton}
          data-testid="merge-worktree-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isLoading}
          style={{
            ...styles.mergeButton,
            ...(isLoading ? styles.mergeButtonDisabled : {}),
          }}
          data-testid="merge-worktree-confirm"
        >
          {isLoading && <span style={styles.spinner} />}
          {isLoading ? 'Merging…' : 'Merge'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog wrapper
// ---------------------------------------------------------------------------

export function MergeWorktreeDialog({
  open,
  onClose,
  onConfirm,
  branchName,
  targetBranch,
  isLoading,
  worktreePath,
  workspaceId,
}: MergeWorktreeDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Merge Worktree"
      testId="merge-worktree-dialog"
      wide
    >
      <MergeWorktreeForm
        onClose={onClose}
        onConfirm={onConfirm}
        branchName={branchName}
        targetBranch={targetBranch}
        isLoading={isLoading}
        worktreePath={worktreePath}
        workspaceId={workspaceId}
      />
    </Dialog>
  );
}
