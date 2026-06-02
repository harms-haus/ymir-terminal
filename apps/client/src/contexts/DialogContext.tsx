import { createContext } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfirmConfig = {
  type: 'confirm';
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
};

export type PromptConfig = {
  type: 'prompt';
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
};

export type DialogConfig = ConfirmConfig | PromptConfig;

export type DialogResult =
  | { type: 'confirm'; confirmed: boolean }
  | { type: 'prompt'; value: string | null };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DialogContextValue {
  showDialog: (config: DialogConfig) => Promise<DialogResult>;
}

export const DialogContext = createContext<DialogContextValue | null>(null);
