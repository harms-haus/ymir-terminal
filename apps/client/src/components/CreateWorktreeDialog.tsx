import { useState, useCallback, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { useCreateWorktree, useWorktreeCopyFiles } from '../hooks/useWorkspaces';
import { inputGroupStyle, inputStyle, labelStyle } from '../lib/dialog-styles';
import {
  COLOR_BORDER_CARD,
  COLOR_TEXT_CARD_MUTED,
  COLOR_BTN_PRIMARY,
  COLOR_BG_ERROR_CARD,
  COLOR_BORDER_ERROR_CARD,
  COLOR_TEXT_ERROR_CARD,
  COLOR_SPINNER_TRACK,
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_BORDER,
} from '../lib/theme';
import { Dialog } from './Dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateWorktreeDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  workspaceId: string | null;
  workspaceCwd?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const BRANCH_NAME_RE = /^[a-zA-Z0-9\/. _-]+$/;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  inputGroup: inputGroupStyle,
  label: labelStyle,
  input: inputStyle,
  validationError: {
    fontSize: '12px',
    color: COLOR_TEXT_ERROR_CARD,
    marginTop: '4px',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '24px',
  },
  submitButton: {
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
  submitButtonDisabled: {
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
  errorBox: {
    backgroundColor: COLOR_BG_ERROR_CARD,
    border: `1px solid ${COLOR_BORDER_ERROR_CARD}`,
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '16px',
    fontSize: '13px',
    color: COLOR_TEXT_ERROR_CARD,
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

function CreateWorktreeForm({
  onClose,
  onCreated,
  workspaceId,
  workspaceCwd,
}: {
  onClose: () => void;
  onCreated: () => void;
  workspaceId: string | null;
  workspaceCwd?: string;
}) {
  const [branchName, setBranchName] = useState('');
  const [startRef, setStartRef] = useState('');
  const [touched, setTouched] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId);
  const branchRef = useRef<HTMLInputElement>(null);

  const mutation = useCreateWorktree();
  const { data: copyFilesData, isLoading: copyFilesLoading } = useWorktreeCopyFiles(
    workspaceId ?? null,
    workspaceCwd,
  );

  // Auto-focus branch name input on mount
  useEffect(() => {
    branchRef.current?.focus();
  }, []);

  // Reset file selection when workspaceId changes
  if (workspaceId !== prevWorkspaceId) {
    setPrevWorkspaceId(workspaceId);
    setSelectedFiles(new Set());
    setInitializedFor(null);
  }

  // Initialize selected files from copy-files data (once per workspaceId)
  if (copyFilesData && initializedFor !== workspaceId) {
    const initial = new Set<string>();
    if (copyFilesData.configuredFiles.length > 0) {
      copyFilesData.configuredFiles.forEach((f) => initial.add(f));
    } else {
      copyFilesData.untrackedFiles.forEach((f) => initial.add(f));
    }
    setSelectedFiles(initial);
    setInitializedFor(workspaceId);
  }

  const toggleFile = useCallback((file: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }, []);

  const allFiles = useMemo(() => {
    if (!copyFilesData) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    // Add configured files first (these are the important ones)
    for (const f of copyFilesData.configuredFiles) {
      if (!seen.has(f)) {
        seen.add(f);
        result.push(f);
      }
    }
    // Then add untracked files not already listed
    for (const f of copyFilesData.untrackedFiles) {
      if (!seen.has(f)) {
        seen.add(f);
        result.push(f);
      }
    }
    return result;
  }, [copyFilesData]);

  const branchNameInvalid = touched && branchName.length > 0 && !BRANCH_NAME_RE.test(branchName);
  const submitDisabled =
    mutation.isPending || !branchName.trim() || branchNameInvalid || !workspaceId;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!branchName.trim() || !workspaceId || mutation.isPending) return;
      if (!BRANCH_NAME_RE.test(branchName)) return;

      try {
        const filesToCopy = Array.from(selectedFiles);
        await mutation.mutateAsync({
          workspaceId,
          branchName: branchName.trim(),
          startRef: startRef.trim() || undefined,
          filesToCopy,
        });
        onCreated();
      } catch {
        // Error is captured by mutation state
      }
    },
    [branchName, startRef, workspaceId, mutation, onCreated, selectedFiles],
  );

  return (
    <form onSubmit={handleSubmit}>
      {mutation.isError && (
        <div role="alert" style={styles.errorBox} data-testid="create-worktree-error">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to create worktree'}
        </div>
      )}

      <div style={styles.inputGroup}>
        <label htmlFor="worktree-branch-name" style={styles.label}>
          Branch Name
        </label>
        <input
          ref={branchRef}
          id="worktree-branch-name"
          type="text"
          placeholder="my-feature"
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={mutation.isPending}
          style={styles.input}
        />
        {branchNameInvalid && (
          <div style={styles.validationError}>
            Branch name can only contain letters, numbers, /, ., spaces, _, and -
          </div>
        )}
      </div>

      <div style={styles.inputGroup}>
        <label htmlFor="worktree-base-ref" style={styles.label}>
          Base Ref
        </label>
        <input
          id="worktree-base-ref"
          type="text"
          placeholder="HEAD"
          value={startRef}
          onChange={(e) => setStartRef(e.target.value)}
          disabled={mutation.isPending}
          style={styles.input}
        />
      </div>

      {copyFilesData && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ ...labelStyle, marginBottom: '8px', display: 'block' }}>
            Files to Copy
          </label>
          <div
            style={{
              maxHeight: '150px',
              overflowY: 'auto' as const,
              border: `1px solid ${COLOR_BORDER}`,
              borderRadius: '6px',
              padding: '4px 0',
            }}
          >
            {copyFilesLoading ? (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: COLOR_TEXT_MUTED }}>
                Loading files…
              </div>
            ) : allFiles.length === 0 ? (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: COLOR_TEXT_MUTED }}>
                No untracked files
              </div>
            ) : (
              allFiles.map((file) => (
                <label
                  key={file}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    minHeight: '28px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    color: COLOR_TEXT,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file)}
                    onChange={() => toggleFile(file)}
                    style={{
                      width: '14px',
                      height: '14px',
                      accentColor: COLOR_BTN_PRIMARY,
                      cursor: 'pointer',
                    }}
                  />
                  <span
                    title={file}
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {file}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}

      <div style={styles.buttonRow}>
        <button
          type="button"
          onClick={onClose}
          style={styles.cancelButton}
          data-testid="create-worktree-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          style={{
            ...styles.submitButton,
            ...(submitDisabled ? styles.submitButtonDisabled : {}),
          }}
          data-testid="create-worktree-submit"
        >
          {mutation.isPending && <span style={styles.spinner} />}
          {mutation.isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Dialog wrapper
// ---------------------------------------------------------------------------

export function CreateWorktreeDialog({
  open,
  onClose,
  onCreated,
  workspaceId,
  workspaceCwd,
}: CreateWorktreeDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create Worktree"
      testId="create-worktree-dialog"
      wide
    >
      <CreateWorktreeForm
        onClose={onClose}
        onCreated={onCreated}
        workspaceId={workspaceId}
        workspaceCwd={workspaceCwd}
      />
    </Dialog>
  );
}
