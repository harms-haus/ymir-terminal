import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cardStyle } from '../lib/dialog-styles';
import { COLOR_TEXT_CARD, Z_INDEX_DIALOG } from '../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  role?: 'dialog' | 'alertdialog';
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
  zIndex: Z_INDEX_DIALOG,
};

const titleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  margin: '0 0 24px 0',
  color: COLOR_TEXT_CARD,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTOR =
  'input, button, select, textarea, a[href], summary, [contenteditable], [tabindex]:not([tabindex="-1"])';

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
 *
 * Renders via a portal at document.body to escape stacking contexts.
 */
export function Dialog({
  open,
  onClose,
  title,
  role = 'dialog',
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
      const first = card.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }, 0);

    return () => clearTimeout(timer);
  }, [open]);

  // -------------------------------------------------------------------
  // Restore focus to the previously-focused element when dialog closes
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement;
    return () => {
      previouslyFocused?.focus?.();
    };
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

      const focusable = card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
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
  // Lock background scroll when dialog is open
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
  // Render
  // -------------------------------------------------------------------
  if (!open) return null;

  const cardStyleMerged: React.CSSProperties = {
    ...cardStyle,
    ...(wide ? { maxWidth: '520px' } : {}),
  };

  return createPortal(
    <>
      <div data-testid={testId} style={backdropStyle} onClick={handleBackdropClick}>
        <div ref={cardRef} style={cardStyleMerged} role={role} aria-modal="true" aria-label={title}>
          <h2 style={titleStyle}>{title}</h2>
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Module-level style injection (injected once per page load)
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined' && !document.getElementById('ymir-dialog-styles')) {
  const style = document.createElement('style');
  style.id = 'ymir-dialog-styles';
  style.textContent = `
    [data-testid] input:focus-visible,
    [data-testid] button:focus-visible {
      outline: 2px solid var(--accent, #007acc);
      outline-offset: -1px;
    }
    @media (prefers-reduced-motion: reduce) {
      [data-testid] span[style*="animation: spin"] {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}
