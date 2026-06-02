import { useEffect, useRef, useCallback, type FormEvent, type ReactNode } from 'react';
import { cardStyle } from '../lib/dialog-styles';
import {
  COLOR_BORDER_CARD,
  COLOR_BTN_PRIMARY,
  COLOR_TEXT_CARD,
  COLOR_TEXT_CARD_MUTED,
} from '../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  children: ReactNode;
  testId?: string;
  wide?: boolean;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const titleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  margin: '0 0 24px 0',
  color: COLOR_TEXT_CARD,
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '24px',
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: 500,
  backgroundColor: 'transparent',
  color: COLOR_TEXT_CARD_MUTED,
  border: `1px solid ${COLOR_BORDER_CARD}`,
  borderRadius: '6px',
  cursor: 'pointer',
};

const submitButtonBase: React.CSSProperties = {
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
};

const submitButtonDisabledStyle: React.CSSProperties = {
  opacity: 0.6,
  cursor: 'not-allowed',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Generic dialog shell.
 *
 * Handles:
 * - Focus trap (Tab cycling) and auto-focus first input on mount
 * - Escape key → onClose
 * - Backdrop click → onClose
 * - Optional form wrapper with Cancel / Submit action buttons
 *
 * When `onSubmit` is provided the dialog wraps children in a `<form>` and
 * renders a Cancel + Submit button row. When omitted, children are rendered
 * as-is (useful for dialogs that manage their own action buttons).
 */
export function Dialog({
  open,
  onClose,
  title,
  onSubmit,
  submitLabel = 'Submit',
  submitDisabled = false,
  children,
  testId = 'dialog',
  wide = false,
}: DialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------
  // Auto-focus first focusable element when the dialog opens
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    // Small delay to ensure children have rendered
    const timer = setTimeout(() => {
      const card = cardRef.current;
      if (!card) return;
      const first = card.querySelector<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 0);

    return () => clearTimeout(timer);
  }, [open]);

  // -------------------------------------------------------------------
  // Focus trap — cycle Tab through focusable elements inside the card
  // -------------------------------------------------------------------
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

  // -------------------------------------------------------------------
  // Close on Escape
  // -------------------------------------------------------------------
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

  // -------------------------------------------------------------------
  // Backdrop click → close
  // -------------------------------------------------------------------
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // -------------------------------------------------------------------
  // Form submission prevention
  // -------------------------------------------------------------------
  const handleFormSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      onSubmit?.();
    },
    [onSubmit],
  );

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  if (!open) return null;

  const cardStyleMerged: React.CSSProperties = {
    ...cardStyle,
    ...(wide ? { maxWidth: '520px' } : {}),
  };

  const content = onSubmit ? (
    <form onSubmit={handleFormSubmit}>
      {children}
      <div style={buttonRowStyle}>
        <button type="button" onClick={onClose} style={cancelButtonStyle}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          style={{
            ...submitButtonBase,
            ...(submitDisabled ? submitButtonDisabledStyle : {}),
          }}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  ) : (
    children
  );

  return (
    <>
      <style>{`@media (prefers-reduced-motion: reduce) { [data-testid="${testId}"] span[style*="animation: spin"] { animation: none !important; } } [data-testid="${testId}"] input:focus-visible { outline: 2px solid var(--accent, #007acc); outline-offset: -1px; } [data-testid="${testId}"] button:focus-visible { outline: 2px solid var(--accent, #007acc); outline-offset: 2px; }`}</style>
      <div data-testid={testId} style={backdropStyle} onClick={handleBackdropClick}>
        <div
          ref={cardRef}
          style={cardStyleMerged}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <h2 style={titleStyle}>{title}</h2>
          {content}
        </div>
      </div>
    </>
  );
}
