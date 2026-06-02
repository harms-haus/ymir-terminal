import { useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DialogContext } from '../contexts/DialogContext';
import type { ConfirmConfig, DialogConfig, DialogResult, PromptConfig } from '../contexts/DialogContext';
import { Dialog } from './Dialog';
import {
  inputStyle,
  submitButtonBaseStyle,
  cancelButtonStyle,
  dangerButtonStyle,
  buttonRowStyle,
} from '../lib/dialog-styles';
import { COLOR_TEXT_CARD } from '../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveDialog {
  id: number;
  config: DialogConfig;
  resolve: (result: DialogResult) => void;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const messageStyle: React.CSSProperties = {
  fontSize: '14px',
  color: COLOR_TEXT_CARD,
  lineHeight: 1.5,
  marginBottom: '0',
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<ActiveDialog[]>([]);
  const nextId = useRef(0);

  const showDialog = useCallback((config: DialogConfig): Promise<DialogResult> => {
    return new Promise<DialogResult>((resolve) => {
      const id = nextId.current++;
      setDialogs((prev) => [...prev, { id, config, resolve }]);
    });
  }, []);

  const resolveDialog = useCallback((id: number, result: DialogResult) => {
    setDialogs((prev) => {
      const entry = prev.find((d) => d.id === id);
      if (entry) entry.resolve(result);
      return prev.filter((d) => d.id !== id);
    });
  }, []);

  const contextValue = useMemo(() => ({ showDialog }), [showDialog]);

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {createPortal(
        <>
          {dialogs.map((dialog) => {
            const { id, config } = dialog;

            if (config.type === 'confirm') {
              return (
                <ConfirmDialogEntry
                  key={id}
                  config={config}
                  onResult={(confirmed) =>
                    resolveDialog(id, { type: 'confirm', confirmed })
                  }
                />
              );
            }

            return (
              <PromptDialogEntry
                key={id}
                config={config}
                onResult={(value) =>
                  resolveDialog(id, { type: 'prompt', value })
                }
              />
            );
          })}
        </>,
        document.body,
      )}
    </DialogContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog entry
// ---------------------------------------------------------------------------

function ConfirmDialogEntry({
  config,
  onResult,
}: {
  config: ConfirmConfig;
  onResult: (confirmed: boolean) => void;
}) {
  return (
    <Dialog
      open={true}
      onClose={() => onResult(false)}
      title={config.title}
      role="alertdialog"
      testId="confirm-dialog"
    >
      <p style={messageStyle}>{config.message}</p>
      <div style={buttonRowStyle}>
        <button style={cancelButtonStyle} onClick={() => onResult(false)}>
          Cancel
        </button>
        <button
          style={
            config.danger
              ? dangerButtonStyle
              : submitButtonBaseStyle
          }
          onClick={() => onResult(true)}
        >
          {config.confirmLabel ?? 'Confirm'}
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Prompt dialog entry
// ---------------------------------------------------------------------------

function PromptDialogEntry({
  config,
  onResult,
}: {
  config: PromptConfig;
  onResult: (value: string | null) => void;
}) {
  const [value, setValue] = useState(config.defaultValue ?? '');
  const trimmedEmpty = value.trim().length === 0;

  return (
    <Dialog
      open={true}
      onClose={() => onResult(null)}
      title={config.title}
      role="dialog"
      testId="prompt-dialog"
    >
      <p style={messageStyle}>{config.message}</p>
      <input
        style={inputStyle}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={config.placeholder}
        autoFocus
        aria-label={config.message}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            e.preventDefault();
            onResult(value.trim());
          }
        }}
      />
      <div style={buttonRowStyle}>
        <button style={cancelButtonStyle} onClick={() => onResult(null)}>
          Cancel
        </button>
        <button
          style={{
            ...submitButtonBaseStyle,
            ...(trimmedEmpty ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
          }}
          disabled={trimmedEmpty}
          onClick={() => onResult(value)}
        >
          {config.submitLabel ?? 'Submit'}
        </button>
      </div>
    </Dialog>
  );
}
