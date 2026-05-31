import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';
import { useCreateWorkspace } from '../hooks/useWorkspaces';
import { cardStyle, inputGroupStyle, inputStyle, labelStyle } from '../lib/dialog-styles';
import {
  COLOR_BG_LOGIN,
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

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (workspaceId: string, color: string) => void;
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
    margin: '0 0 24px 0',
    color: COLOR_TEXT_CARD,
  },
  inputGroup: inputGroupStyle,
  label: labelStyle,
  input: inputStyle,
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  colorInput: {
    width: '40px',
    height: '36px',
    padding: '2px',
    backgroundColor: COLOR_BG_LOGIN,
    border: `1px solid ${COLOR_BORDER_CARD}`,
    borderRadius: '6px',
    cursor: 'pointer',
  },
  colorHex: {
    fontSize: '13px',
    color: COLOR_TEXT_CARD_MUTED,
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

function CreateWorkspaceForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (workspaceId: string, color: string) => void;
}) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [color, setColor] = useState('#007acc');
  const nameRef = useRef<HTMLInputElement>(null);

  const mutation = useCreateWorkspace();

  // Auto-focus name input on mount
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !path.trim() || mutation.isPending) return;

      try {
        const response = await mutation.mutateAsync({
          name: name.trim(),
          cwd: path.trim(),
          color,
        });
        onCreated(response.workspace.id, color);
      } catch {
        // Error is captured by mutation state
      }
    },
    [name, path, color, mutation, onCreated],
  );

  return (
    <form onSubmit={handleSubmit}>
      {mutation.isError && (
        <div role="alert" style={styles.errorBox} data-testid="create-workspace-error">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to create workspace'}
        </div>
      )}

      <div style={styles.inputGroup}>
        <label htmlFor="workspace-name" style={styles.label}>
          Name
        </label>
        <input
          ref={nameRef}
          id="workspace-name"
          type="text"
          placeholder="My Workspace"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={mutation.isPending}
          style={styles.input}
        />
      </div>

      <div style={styles.inputGroup}>
        <label htmlFor="workspace-path" style={styles.label}>
          Path
        </label>
        <input
          id="workspace-path"
          type="text"
          placeholder="/path/to/project"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={mutation.isPending}
          style={styles.input}
        />
      </div>

      <div style={styles.inputGroup}>
        <label htmlFor="workspace-color" style={styles.label}>
          Color
        </label>
        <div style={styles.colorRow}>
          <input
            id="workspace-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={mutation.isPending}
            style={styles.colorInput}
          />
          <span style={styles.colorHex}>{color}</span>
        </div>
      </div>

      <div style={styles.buttonRow}>
        <button
          type="button"
          onClick={onClose}
          disabled={mutation.isPending}
          style={styles.cancelButton}
          data-testid="create-workspace-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending || !name.trim() || !path.trim()}
          style={{
            ...styles.submitButton,
            ...(mutation.isPending || !name.trim() || !path.trim()
              ? styles.submitButtonDisabled
              : {}),
          }}
          data-testid="create-workspace-submit"
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

export function CreateWorkspaceDialog({ open, onClose, onCreated }: CreateWorkspaceDialogProps) {
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
      <style>{`@media (prefers-reduced-motion: reduce) { [data-testid="create-workspace-dialog"] span[style*="animation: spin"] { animation: none !important; } } [data-testid="create-workspace-dialog"] input:focus-visible { outline: 2px solid var(--accent, #007acc); outline-offset: -1px; }`}</style>
      <div
        data-testid="create-workspace-dialog"
        style={styles.backdrop}
        onClick={handleBackdropClick}
      >
        <div
          ref={cardRef}
          style={styles.card}
          role="dialog"
          aria-modal="true"
          aria-label="Create workspace"
        >
          <h2 style={styles.title}>Create Workspace</h2>
          <CreateWorkspaceForm onClose={onClose} onCreated={onCreated} />
        </div>
      </div>
    </>
  );
}
