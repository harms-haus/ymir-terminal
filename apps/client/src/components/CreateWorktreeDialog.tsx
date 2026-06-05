import { useState, useCallback, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { useCreateWorktree, useWorktreeCopyFiles } from '../hooks/useWorkspaces';
import {
  inputGroupStyle,
  inputStyle,
  labelStyle,
  cancelButtonStyle,
  submitButtonBaseStyle,
  submitButtonDisabledStyle,
  errorBoxStyle,
  spinnerStyle,
  buttonRowStyle,
} from '../lib/dialog-styles';
import {
  COLOR_TEXT_ERROR_CARD,
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_BORDER,
  COLOR_BTN_PRIMARY,
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
// Component-specific styles
// ---------------------------------------------------------------------------

const validationErrorStyle: React.CSSProperties = {
  fontSize: '12px',
  color: COLOR_TEXT_ERROR_CARD,
  marginTop: '4px',
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
  // Only configured files (.worktreecopy) start checked; untracked files start unchecked
  if (copyFilesData && initializedFor !== workspaceId) {
    const initial = new Set<string>();
    copyFilesData.configuredFiles.forEach((f) => initial.add(f));
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
        <div role="alert" style={errorBoxStyle} data-testid="create-worktree-error">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to create worktree'}
        </div>
      )}

      <div style={inputGroupStyle}>
        <label htmlFor="worktree-branch-name" style={labelStyle}>
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
          style={inputStyle}
        />
        {branchNameInvalid && (
          <div style={validationErrorStyle}>
            Branch name can only contain letters, numbers, /, ., spaces, _, and -
          </div>
        )}
      </div>

      <div style={inputGroupStyle}>
        <label htmlFor="worktree-base-ref" style={labelStyle}>
          Base Ref
        </label>
        <input
          id="worktree-base-ref"
          type="text"
          placeholder="HEAD"
          value={startRef}
          onChange={(e) => setStartRef(e.target.value)}
          disabled={mutation.isPending}
          style={inputStyle}
        />
      </div>

      {copyFilesData && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ ...labelStyle, marginBottom: '8px', display: 'block' }}>
            Files to Copy
          </label>
          <div
            style={{
              maxHeight: '250px',
              overflowY: 'auto' as const,
              border: `1px solid ${COLOR_BORDER}`,
              borderRadius: '6px',
              padding: '2px 0',
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
                    gap: '6px',
                    padding: '3px 8px',
                    minHeight: '24px',
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

      <div style={buttonRowStyle}>
        <button
          type="button"
          onClick={onClose}
          style={cancelButtonStyle}
          data-testid="create-worktree-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          style={{
            ...submitButtonBaseStyle,
            ...(submitDisabled ? submitButtonDisabledStyle : {}),
          }}
          data-testid="create-worktree-submit"
        >
          {mutation.isPending && <span style={spinnerStyle} />}
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
