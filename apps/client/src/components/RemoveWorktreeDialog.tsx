import { useState, useCallback } from 'react';
import {
  cancelButtonStyle,
  dangerButtonStyle,
  dangerButtonDisabledStyle,
  spinnerStyle,
  buttonRowStyle,
} from '../lib/dialog-styles';
import {
  COLOR_TEXT_CARD,
  COLOR_TEXT_CARD_MUTED,
  COLOR_DANGER,
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
  accentColor: COLOR_DANGER,
  cursor: 'pointer',
};

const checkboxLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: COLOR_TEXT_CARD_MUTED,
  cursor: 'pointer',
  userSelect: 'none',
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
      <div style={messageStyle}>
        Remove worktree <span style={branchNameStyle}>{branchName}</span>?
      </div>

      <div style={checkboxRowStyle}>
        <input
          id="worktree-force-delete"
          type="checkbox"
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
          disabled={isLoading}
          style={checkboxStyle}
        />
        <label htmlFor="worktree-force-delete" style={checkboxLabelStyle}>
          Force delete (removes even with uncommitted changes)
        </label>
      </div>

      <div style={buttonRowStyle}>
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          style={cancelButtonStyle}
          data-testid="remove-worktree-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isLoading}
          style={{
            ...dangerButtonStyle,
            ...(isLoading ? dangerButtonDisabledStyle : {}),
          }}
          data-testid="remove-worktree-confirm"
        >
          {isLoading && <span style={spinnerStyle} />}
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
