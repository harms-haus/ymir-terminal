import { useState, useCallback, useEffect, useRef } from 'react';
import { cardStyle } from '../lib/dialog-styles';
import {
  COLOR_BG_LOGIN,
  COLOR_BORDER_CARD,
  COLOR_TEXT_CARD,
  COLOR_TEXT_CARD_MUTED,
  COLOR_BTN_PRIMARY,
  COLOR_DANGER,
  COLOR_SPINNER_TRACK,
} from '../lib/theme';

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
    margin: '0 0 16px 0',
    color: COLOR_TEXT_CARD,
  },
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
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Auto-focus cancel button on mount
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

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
        <label
          htmlFor="worktree-force-delete"
          style={styles.checkboxLabel}
        >
          Force delete (removes even with uncommitted changes)
        </label>
      </div>

      <div style={styles.buttonRow}>
        <button
          ref={cancelRef}
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
// Outer dialog — controls visibility, Escape key, backdrop click
// ---------------------------------------------------------------------------

export function RemoveWorktreeDialog({
  open,
  onClose,
  onConfirm,
  branchName,
  isLoading,
}: RemoveWorktreeDialogProps) {
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
      <style>{`@media (prefers-reduced-motion: reduce) { [data-testid="remove-worktree-dialog"] span[style*="animation: spin"] { animation: none !important; } } [data-testid="remove-worktree-dialog"] input:focus-visible { outline: 2px solid var(--accent, #007acc); outline-offset: -1px; }`}</style>
      <div
        data-testid="remove-worktree-dialog"
        style={styles.backdrop}
        onClick={handleBackdropClick}
      >
        <div
          ref={cardRef}
          style={styles.card}
          role="dialog"
          aria-modal="true"
          aria-label="Remove worktree"
        >
          <h2 style={styles.title}>Remove Worktree</h2>
          <RemoveWorktreeForm
            onClose={onClose}
            onConfirm={onConfirm}
            branchName={branchName}
            isLoading={isLoading}
          />
        </div>
      </div>
    </>
  );
}
