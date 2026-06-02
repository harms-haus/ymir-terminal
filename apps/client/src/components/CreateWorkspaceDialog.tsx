import { useState, useCallback, useRef, type FormEvent } from 'react';
import { useCreateWorkspace } from '../hooks/useWorkspaces';
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
import { COLOR_BG_LOGIN, COLOR_BORDER_CARD, COLOR_TEXT_CARD_MUTED } from '../lib/theme';
import { Dialog } from './Dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (workspaceId: string, color: string) => void;
}

// ---------------------------------------------------------------------------
// Component-specific styles
// ---------------------------------------------------------------------------

const colorRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const colorInputStyle: React.CSSProperties = {
  width: '40px',
  height: '36px',
  padding: '2px',
  backgroundColor: COLOR_BG_LOGIN,
  border: `1px solid ${COLOR_BORDER_CARD}`,
  borderRadius: '6px',
  cursor: 'pointer',
};

const colorHexStyle: React.CSSProperties = {
  fontSize: '13px',
  color: COLOR_TEXT_CARD_MUTED,
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
        <div role="alert" style={errorBoxStyle} data-testid="create-workspace-error">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to create workspace'}
        </div>
      )}

      <div style={inputGroupStyle}>
        <label htmlFor="workspace-name" style={labelStyle}>
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
          style={inputStyle}
        />
      </div>

      <div style={inputGroupStyle}>
        <label htmlFor="workspace-path" style={labelStyle}>
          Path
        </label>
        <input
          id="workspace-path"
          type="text"
          placeholder="/path/to/project"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={mutation.isPending}
          style={inputStyle}
        />
      </div>

      <div style={inputGroupStyle}>
        <label htmlFor="workspace-color" style={labelStyle}>
          Color
        </label>
        <div style={colorRowStyle}>
          <input
            id="workspace-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={mutation.isPending}
            style={colorInputStyle}
          />
          <span style={colorHexStyle}>{color}</span>
        </div>
      </div>

      <div style={buttonRowStyle}>
        <button
          type="button"
          onClick={onClose}
          disabled={mutation.isPending}
          style={cancelButtonStyle}
          data-testid="create-workspace-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending || !name.trim() || !path.trim()}
          style={{
            ...submitButtonBaseStyle,
            ...(mutation.isPending || !name.trim() || !path.trim()
              ? submitButtonDisabledStyle
              : {}),
          }}
          data-testid="create-workspace-submit"
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

export function CreateWorkspaceDialog({ open, onClose, onCreated }: CreateWorkspaceDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Create Workspace" testId="create-workspace-dialog">
      <CreateWorkspaceForm onClose={onClose} onCreated={onCreated} />
    </Dialog>
  );
}
