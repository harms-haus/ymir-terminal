import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';
import { useCreateWorktree } from '../hooks/useWorkspaces';
import { cardStyle, inputGroupStyle, inputStyle, labelStyle } from '../lib/dialog-styles';
import {
  COLOR_BORDER_CARD,
  COLOR_TEXT_CARD,
  COLOR_TEXT_CARD_MUTED,
  COLOR_BTN_PRIMARY,
  COLOR_BG_ERROR_CARD,
  COLOR_BORDER_ERROR_CARD,
  COLOR_TEXT_ERROR_CARD,
  COLOR_SPINNER_TRACK,
} from '../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateWorktreeDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  workspaceId: string | null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const BRANCH_NAME_RE = /^[a-zA-Z0-9\/. _-]+$/;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  card: cardStyle,
  title: {
    fontSize: '20px',
    fontWeight: 600,
    margin: '0 0 24px 0',
    color: COLOR_TEXT_CARD,
  },
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
}: {
  onClose: () => void;
  onCreated: () => void;
  workspaceId: string | null;
}) {
  const [branchName, setBranchName] = useState('');
  const [startRef, setStartRef] = useState('');
  const [touched, setTouched] = useState(false);
  const branchRef = useRef<HTMLInputElement>(null);

  const mutation = useCreateWorktree();

  // Auto-focus branch name input on mount
  useEffect(() => {
    branchRef.current?.focus();
  }, []);

  const branchNameInvalid = touched && branchName.length > 0 && !BRANCH_NAME_RE.test(branchName);
  const submitDisabled =
    mutation.isPending || !branchName.trim() || branchNameInvalid || !workspaceId;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!branchName.trim() || !workspaceId || mutation.isPending) return;
      if (!BRANCH_NAME_RE.test(branchName)) return;

      try {
        await mutation.mutateAsync({
          workspaceId,
          branchName: branchName.trim(),
          startRef: startRef.trim() || undefined,
        });
        onCreated();
      } catch {
        // Error is captured by mutation state
      }
    },
    [branchName, startRef, workspaceId, mutation, onCreated],
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
// Outer dialog — controls visibility, Escape key, backdrop click
// ---------------------------------------------------------------------------

export function CreateWorktreeDialog({
  open,
  onClose,
  onCreated,
  workspaceId,
}: CreateWorktreeDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const card = cardRef.current;
      if (!card) return;

      const focusable = card.querySelectorAll<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <>
      <style>{`@media (prefers-reduced-motion: reduce) { [data-testid="create-worktree-dialog"] span[style*="animation: spin"] { animation: none !important; } } [data-testid="create-worktree-dialog"] input:focus-visible { outline: 2px solid var(--accent, #007acc); outline-offset: -1px; }`}</style>
      <div
        data-testid="create-worktree-dialog"
        style={styles.backdrop}
        onClick={handleBackdropClick}
      >
        <div
          ref={cardRef}
          style={styles.card}
          role="dialog"
          aria-modal="true"
          aria-label="Create worktree"
        >
          <h2 style={styles.title}>Create Worktree</h2>
          <CreateWorktreeForm onClose={onClose} onCreated={onCreated} workspaceId={workspaceId} />
        </div>
      </div>
    </>
  );
}
