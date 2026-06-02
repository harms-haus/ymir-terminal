import type { CSSProperties } from 'react';
import {
  COLOR_BG_CARD,
  COLOR_BG_LOGIN,
  COLOR_BG_ERROR_CARD,
  COLOR_BORDER_CARD,
  COLOR_BORDER_ERROR_CARD,
  COLOR_BTN_PRIMARY,
  COLOR_DANGER,
  COLOR_SPINNER_TRACK,
  COLOR_TEXT_CARD,
  COLOR_TEXT_CARD_MUTED,
  COLOR_TEXT_ERROR_CARD,
} from './theme';

// ---------------------------------------------------------------------------
// Shared styles for dialog / login cards
// ---------------------------------------------------------------------------

/** Shared card shell – callers may override `padding`, `maxWidth`, etc. */
export const cardStyle: CSSProperties = {
  backgroundColor: COLOR_BG_CARD,
  border: `1px solid ${COLOR_BORDER_CARD}`,
  borderRadius: '12px',
  padding: '32px',
  width: '100%',
  maxWidth: '420px',
  boxSizing: 'border-box',
  color: COLOR_TEXT_CARD,
};

/** Input group wrapper – adds vertical spacing between fields. */
export const inputGroupStyle: CSSProperties = {
  marginBottom: '16px',
};

/** Form label. */
export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  marginBottom: '8px',
  color: COLOR_TEXT_CARD,
};

/** Text / password input field. */
export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '14px',
  backgroundColor: COLOR_BG_LOGIN,
  border: `1px solid ${COLOR_BORDER_CARD}`,
  borderRadius: '6px',
  color: COLOR_TEXT_CARD,
  outline: 'none',
  boxSizing: 'border-box',
};

// ---------------------------------------------------------------------------
// Shared button / dialog action styles
// ---------------------------------------------------------------------------

/** Cancel / secondary button. */
export const cancelButtonStyle: CSSProperties = {
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: 500,
  backgroundColor: 'transparent',
  color: COLOR_TEXT_CARD_MUTED,
  border: `1px solid ${COLOR_BORDER_CARD}`,
  borderRadius: '6px',
  cursor: 'pointer',
};

/** Primary submit button (e.g. Create, Merge). */
export const submitButtonBaseStyle: CSSProperties = {
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

/** Disabled overlay for submit buttons. */
export const submitButtonDisabledStyle: CSSProperties = {
  opacity: 0.6,
  cursor: 'not-allowed',
};

/** Destructive / danger button (e.g. Remove). */
export const dangerButtonStyle: CSSProperties = {
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
};

/** Disabled overlay for danger buttons. */
export const dangerButtonDisabledStyle: CSSProperties = {
  opacity: 0.6,
  cursor: 'not-allowed',
};

/** Error message box for dialog forms. */
export const errorBoxStyle: CSSProperties = {
  backgroundColor: COLOR_BG_ERROR_CARD,
  border: `1px solid ${COLOR_BORDER_ERROR_CARD}`,
  borderRadius: '6px',
  padding: '10px 12px',
  marginBottom: '16px',
  fontSize: '13px',
  color: COLOR_TEXT_ERROR_CARD,
};

/** Loading spinner (14×14, border-based, spin animation). */
export const spinnerStyle: CSSProperties = {
  width: '14px',
  height: '14px',
  border: `2px solid ${COLOR_SPINNER_TRACK}`,
  borderTopColor: '#ffffff',
  borderRadius: '50%',
  animation: 'spin 0.6s linear infinite',
};

/** Bottom action row for dialog forms. */
export const buttonRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '24px',
};
