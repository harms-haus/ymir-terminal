/**
 * Centralized theme constants for the Ymir Terminal UI.
 *
 * Every colour, spacing, and font value that was previously inlined in
 * component files is exported from here so there is a single source of truth.
 */

// ── Background colours ──────────────────────────────────────────────────────

/** Main editor / content area background */
export const COLOR_BG_PRIMARY = '#1e1e1e';

/** Sidebar, panel, and tab-bar background */
export const COLOR_BG_SECONDARY = '#252526';

/** Inactive tab background */
export const COLOR_TAB_INACTIVE = '#2d2d2d';

/** Active workspace-item highlight */
export const COLOR_WORKSPACE_ACTIVE = '#37373d';

// ── Login / dialog palette (GitHub-dark inspired) ───────────────────────────

/** Login page & dialog outer background */
export const COLOR_BG_LOGIN = '#0d1117';

/** Login card & dialog card background */
export const COLOR_BG_CARD = '#161b22';

/** Login / dialog border */
export const COLOR_BORDER_CARD = '#30363d';

/** Primary text colour for login / dialogs */
export const COLOR_TEXT_CARD = '#e6edf3';

/** Muted / secondary text in login / dialogs */
export const COLOR_TEXT_CARD_MUTED = '#8b949e';

/** Primary action button (sign-in, create) */
export const COLOR_BTN_PRIMARY = '#238636';

/** Error background in login / dialogs */
export const COLOR_BG_ERROR_CARD = '#3d1114';

/** Error border in login / dialogs */
export const COLOR_BORDER_ERROR_CARD = '#6e2d2f';

/** Error text in login / dialogs */
export const COLOR_TEXT_ERROR_CARD = '#f85149';

// ── Border / separator ──────────────────────────────────────────────────────

/** Standard 1 px border used everywhere */
export const COLOR_BORDER = '#333';

// ── Text colours ────────────────────────────────────────────────────────────

/** Default body text */
export const COLOR_TEXT = '#ccc';

/** Bright text (active tab title, close button on active tab) */
export const COLOR_TEXT_BRIGHT = '#fff';

/** Muted / secondary text (inactive tabs, labels) */
export const COLOR_TEXT_MUTED = '#888';

/** Dimmed / placeholder text */
export const COLOR_TEXT_DIM = '#666';

/** Inactive tab text */
export const COLOR_TAB_INACTIVE_TEXT = '#aaa';

/** Add-tab button text */
export const COLOR_TAB_ADD_TEXT = '#999';

/** Workspace-item CWD text */
export const COLOR_WORKSPACE_CWD = '#999';

// ── Accent ──────────────────────────────────────────────────────────────────

/** Primary accent (status-bar bg, active tab underline, focus rings) */
export const COLOR_ACCENT = '#007acc';

/** Hover highlight for context-menu items */
export const COLOR_HOVER_BG = '#094771';

// ── Status colours ──────────────────────────────────────────────────────────

/** Connected indicator */
export const COLOR_STATUS_CONNECTED = '#4caf50';

/** Reconnecting indicator */
export const COLOR_STATUS_RECONNECTING = '#ff9800';

/** Disconnected indicator */
export const COLOR_STATUS_DISCONNECTED = '#f44336';

// ── Error / danger colours ──────────────────────────────────────────────────

/** Error text (file-load errors, delete items) */
export const COLOR_ERROR = '#e06050';

/** Error detail / secondary text */
export const COLOR_ERROR_DETAIL = '#a0706a';

/** Danger action text (close-pane) */
export const COLOR_DANGER = '#c74e39';

// ── Git status colours ──────────────────────────────────────────────────────

export const COLOR_GIT_MODIFIED = '#e2c08d';
export const COLOR_GIT_ADDED = '#73c991';
export const COLOR_GIT_DELETED = '#c74e39';
export const COLOR_GIT_RENAMED = '#73c991';
export const COLOR_GIT_COPIED = '#73c991';
export const COLOR_GIT_UNTRACKED = '#888';

/** Lookup table for git status letter → colour */
export const GIT_STATUS_COLORS: Record<string, string> = {
  M: COLOR_GIT_MODIFIED,
  A: COLOR_GIT_ADDED,
  D: COLOR_GIT_DELETED,
  R: COLOR_GIT_RENAMED,
  C: COLOR_GIT_COPIED,
  '??': COLOR_GIT_UNTRACKED,
};

// ── Misc ────────────────────────────────────────────────────────────────────

/** Resize separator hover colour (CSS) */
export const COLOR_RESIZER_HOVER = '#555';

/** Context-menu active colour swatch border */
export const COLOR_SWATCH_ACTIVE_BORDER = '#fff';

/** Swatch default border */
export const COLOR_SWATCH_BORDER = 'rgba(255,255,255,0.2)';

/** Spinner track (semi-transparent white) */
export const COLOR_SPINNER_TRACK = 'rgba(255, 255, 255, 0.3)';

/** Close-btn hover background */
export const COLOR_CLOSE_BTN_HOVER_BG = 'rgba(255,255,255,0.1)';

/** Retry button background (inside error bar) */
export const COLOR_RETRY_BTN_BG = 'rgba(255,255,255,0.2)';

// ── Scrollbar ────────────────────────────────────────────────────────────────

/** Scrollbar thumb color (darker than sidebar background) */
export const COLOR_SCROLLBAR_THUMB = '#3a3a3a';

/** Scrollbar thumb hover color */
export const COLOR_SCROLLBAR_THUMB_HOVER = '#4a4a4a';

/** Scrollbar width in pixels */
export const SCROLLBAR_WIDTH = 4;

// ── Preset workspace colours ────────────────────────────────────────────────

export const PRESET_COLORS = [
  '#007acc',
  '#e06050',
  '#4ec9b0',
  '#dcdcaa',
  '#c586c0',
  '#569cd6',
  '#ce9178',
  '#b5cea8',
] as const;

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

export const COLOR_TOPBAR_BG = '#1e1e1e'; // Matches COLOR_BG_PRIMARY — like empty editor pane
export const COLOR_TOPBAR_BORDER = '#333';
export const COLOR_TOPBAR_HOVER_BG = 'rgba(255,255,255,0.08)';
export const COLOR_TOPBAR_ACTIVE_BG = 'rgba(255,255,255,0.15)';

// ---------------------------------------------------------------------------
// Command bar
// ---------------------------------------------------------------------------

export const COLOR_COMMANDBAR_BG = 'rgba(255,255,255,0.06)';
export const COLOR_COMMANDBAR_BORDER = '#444';
export const COLOR_COMMANDBAR_ACTIVE_BORDER = '#555';
export const COLOR_COMMANDBAR_HOVER_BG = 'rgba(255,255,255,0.1)';
export const COLOR_COMMANDBAR_SELECTED_BG = '#094771';

// ── Layout sizing ──────────────────────────────────────────────────────────────

export const TITLE_BAR_HEIGHT = 35;

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

export const ANIMATION_DURATION_MS = 260;
export const ANIMATION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const ANIMATION_TRANSITION = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)';
