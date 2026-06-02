import { useContext, useCallback } from 'react';
import { DialogContext } from '../contexts/DialogContext';

// ---------------------------------------------------------------------------
// useConfirm
// ---------------------------------------------------------------------------

/**
 * Returns a function that opens a confirm dialog and resolves to a boolean.
 *
 * Throws if used outside of a `<DialogProvider>`.
 */
export function useConfirm(): (opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) => Promise<boolean> {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a DialogProvider');
  }

  return useCallback(
    (opts: {
      title: string;
      message: string;
      confirmLabel?: string;
      danger?: boolean;
    }) =>
      ctx
        .showDialog({ type: 'confirm', ...opts })
        .then((result) => (result as { confirmed: boolean }).confirmed),
    [ctx],
  );
}

// ---------------------------------------------------------------------------
// usePrompt
// ---------------------------------------------------------------------------

/**
 * Returns a function that opens a prompt dialog and resolves to the entered
 * string, or `null` if the user cancelled.
 *
 * Throws if used outside of a `<DialogProvider>`.
 */
export function usePrompt(): (opts: {
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
}) => Promise<string | null> {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('usePrompt must be used within a DialogProvider');
  }

  return useCallback(
    (opts: {
      title: string;
      message: string;
      defaultValue?: string;
      placeholder?: string;
      submitLabel?: string;
    }) =>
      ctx
        .showDialog({ type: 'prompt', ...opts })
        .then((result) => (result as { value: string | null }).value),
    [ctx],
  );
}
