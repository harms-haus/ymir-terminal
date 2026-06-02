import { useState, useCallback } from 'react';
import {
  COLOR_BORDER_CARD,
  COLOR_TEXT_CARD,
  COLOR_TEXT_CARD_MUTED,
  COLOR_DANGER,
  COLOR_SPINNER_TRACK,
} from '../lib/theme';
import { Dialog } from './Dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RemoveWorktreeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (force: boolean) => void;
  branchName: string;
  isLoading: boolean;
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
    accentColor: COLOR_DANGER,
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: '13px',
    color: COLOR_TEXT_CARD_MUTED,
    cursor: 'pointer',
    userSelect: 'none',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  removeButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: COLOR_DANGER,
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  removeButtonDisabled: {
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

function RemoveWorktreeForm({
  onClose,
  onConfirm,
  branchName,
  isLoading,
}: {
  onClose: () => void;
  onConfirm: (force: boolean) => void;
  branchName: string;
  isLoading: boolean;
}) {
  const [force, setForce] = useState(false);

  const handleConfirm = useCallback(() => {
    if (isLoading) return;
    onConfirm(force);
  }, [force, isLoading, onConfirm]);

  return (
    <div>
      <div style={styles.message}>
        Remove worktree <span style={styles.branchName}>{branchName}</span>?
      </div>

      <div style={styles.checkboxRow}>
        <input
          id="worktree-force-delete"
          type="checkbox"
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
          disabled={isLoading}
          style={styles.checkbox}
        />
        <label htmlFor="worktree-force-delete" style={styles.checkboxLabel}>
          Force delete (removes even with uncommitted changes)
        </label>
      </div>

      <div style={styles.buttonRow}>
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          style={styles.cancelButton}
          data-testid="remove-worktree-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isLoading}
          style={{
            ...styles.removeButton,
            ...(isLoading ? styles.removeButtonDisabled : {}),
          }}
          data-testid="remove-worktree-confirm"
        >
          {isLoading && <span style={styles.spinner} />}
          {isLoading ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog wrapper
// ---------------------------------------------------------------------------

export function RemoveWorktreeDialog({
  open,
  onClose,
  onConfirm,
  branchName,
  isLoading,
}: RemoveWorktreeDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Remove Worktree" testId="remove-worktree-dialog">
      <RemoveWorktreeForm
        onClose={onClose}
        onConfirm={onConfirm}
        branchName={branchName}
        isLoading={isLoading}
      />
    </Dialog>
  );
}
