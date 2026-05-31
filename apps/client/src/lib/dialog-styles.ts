import type { CSSProperties } from 'react';
import {
  COLOR_BG_CARD,
  COLOR_BG_LOGIN,
  COLOR_BORDER_CARD,
  COLOR_TEXT_CARD,
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

/** Focus ring for inputs – used via `:focus-visible` CSS rules. */
export const inputFocusStyle: CSSProperties = {
  outline: '2px solid var(--accent, #007acc)',
  outlineOffset: '-1px',
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
