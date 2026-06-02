import { useState, useCallback, useMemo } from 'react';
import {
  cancelButtonStyle,
  submitButtonBaseStyle,
  submitButtonDisabledStyle,
  spinnerStyle,
  buttonRowStyle,
} from '../lib/dialog-styles';
import {
  COLOR_BORDER_CARD,
  COLOR_TEXT_CARD,
  COLOR_TEXT_CARD_MUTED,
  COLOR_BTN_PRIMARY,
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
// Component-specific styles
// ---------------------------------------------------------------------------

const messageStyle: React.CSSProperties = {
  fontSize: '14px',
  color: COLOR_TEXT_CARD,
  marginBottom: '16px',
  lineHeight: 1.5,
};

const branchNameStyle: React.CSSProperties = {
  fontWeight: 600,
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '24px',
};

const checkboxStyle: React.CSSProperties = {
  width: '16px',
  height: '16px',
  accentColor: COLOR_BTN_PRIMARY,
  cursor: 'pointer',
};

const checkboxLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: COLOR_TEXT_CARD_MUTED,
  cursor: 'pointer',
  userSelect: 'none',
};

const fileListContainerStyle: React.CSSProperties = {
  maxHeight: '150px',
  overflowY: 'auto' as const,
  border: `1px solid ${COLOR_BORDER_CARD}`,
  borderRadius: '6px',
  padding: '8px',
  marginBottom: '24px',
  backgroundColor: COLOR_BG_CARD,
};

const fileCheckboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 0',
  minHeight: '28px',
};

const fileCheckboxLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: COLOR_TEXT_CARD,
  cursor: 'pointer',
  userSelect: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
};

const noFilesTextStyle: React.CSSProperties = {
  fontSize: '13px',
  color: COLOR_TEXT_CARD_MUTED,
  padding: '4px 0',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: COLOR_TEXT_CARD_MUTED,
  marginBottom: '8px',
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
      <div style={messageStyle}>
        Merge worktree <span style={branchNameStyle}>{branchName}</span> into{' '}
        <span style={branchNameStyle}>{targetBranch}</span>?
      </div>

      <div style={checkboxRowStyle}>
        <input
          id="worktree-delete-after-merge"
          type="checkbox"
          checked={deleteAfterMerge}
          onChange={(e) => setDeleteAfterMerge(e.target.checked)}
          disabled={isLoading}
          style={checkboxStyle}
        />
        <label htmlFor="worktree-delete-after-merge" style={checkboxLabelStyle}>
          Delete worktree after merge
        </label>
      </div>

      {allFiles.length > 0 && (
        <>
          <div style={sectionLabelStyle}>Files to copy to target</div>
          <div style={fileListContainerStyle}>
            {allFiles.map((file) => (
              <div key={file} style={fileCheckboxRowStyle}>
                <input
                  id={`worktree-copy-file-${file}`}
                  type="checkbox"
                  checked={effectiveSelectedFiles.has(file)}
                  onChange={() => toggleFile(file)}
                  disabled={isLoading}
                  style={checkboxStyle}
                />
                <label
                  htmlFor={`worktree-copy-file-${file}`}
                  title={file}
                  style={fileCheckboxLabelStyle}
                >
                  {file}
                </label>
              </div>
            ))}
          </div>
        </>
      )}
      {allFiles.length === 0 && copyFiles && <div style={noFilesTextStyle}>No untracked files</div>}

      <div style={buttonRowStyle}>
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          style={cancelButtonStyle}
          data-testid="merge-worktree-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isLoading}
          style={{
            ...submitButtonBaseStyle,
            ...(isLoading ? submitButtonDisabledStyle : {}),
          }}
          data-testid="merge-worktree-confirm"
        >
          {isLoading && <span style={spinnerStyle} />}
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
