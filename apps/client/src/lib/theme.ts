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

/** Lookup table for git status letter → colour */
export const GIT_STATUS_COLORS: Record<string, string> = {
  M: '#e2c08d',
  A: '#73c991',
  D: '#c74e39',
  R: '#73c991',
  C: '#73c991',
  '??': '#888',
};

// ── Git graph colours ──────────────────────────────────────────────────────

/** Colour palette for git commit-graph lanes */
export const GIT_GRAPH_COLORS = [
  '#007acc',
  '#4ec9b0',
  '#c586c0',
  '#dcdcaa',
  '#e06050',
  '#569cd6',
  '#ce9178',
  '#b5cea8',
] as const;

// ── Git panel UI ────────────────────────────────────────────────────────────

/** Git panel repo header background */
export const COLOR_GIT_REPO_HEADER_BG = 'rgba(255,255,255,0.04)';

/** Git panel commit button background */
export const COLOR_GIT_COMMIT_BG = 'rgba(46,160,67,0.5)';

/** Git panel commit button border */
export const COLOR_GIT_COMMIT_BORDER = '#2ea043';

/** Git panel commit button text */
export const COLOR_GIT_COMMIT_TEXT = '#e6edf3';

/** Git panel commit button disabled text */
export const COLOR_GIT_COMMIT_DISABLED = '#484f58';

/** Git panel commit button hover background */
export const COLOR_GIT_COMMIT_HOVER_BG = 'rgba(46,160,67,0.6)';

/** Git panel branch button background */
export const COLOR_GIT_BRANCH_BG = 'rgba(255,255,255,0.06)';

/** Git panel branch button border */
export const COLOR_GIT_BRANCH_BORDER = '#444';

/** Git panel branch button hover background */
export const COLOR_GIT_BRANCH_HOVER = 'rgba(255,255,255,0.08)';

/** Git panel action button background */
export const COLOR_GIT_ACTION_BG = 'rgba(255,255,255,0.06)';

/** Git panel action button hover background */
export const COLOR_GIT_ACTION_HOVER = 'rgba(255,255,255,0.1)';

/** Git panel section header text */
export const COLOR_GIT_SECTION_HEADER = '#888';

/** Git panel badge background */
export const COLOR_GIT_BADGE_BG = 'rgba(255,255,255,0.1)';

/** Git panel badge text */
export const COLOR_GIT_BADGE_TEXT = '#aaa';

// ── Diff viewer ─────────────────────────────────────────────────────────────

/** Diff viewer header bar background */
export const COLOR_DIFF_HEADER_BG = COLOR_BG_SECONDARY;

/** Diff viewer header border */
export const COLOR_DIFF_HEADER_BORDER = COLOR_BORDER;

/** Diff additions text color */
export const COLOR_DIFF_ADDITIONS = '#73c991';

/** Diff deletions text color */
export const COLOR_DIFF_DELETIONS = '#e06050';

/** Diff viewer toggle button active background */
export const COLOR_DIFF_TOGGLE_ACTIVE_BG = COLOR_HOVER_BG;

// ── Misc ────────────────────────────────────────────────────────────────────

/** Context-menu active colour swatch border */
export const COLOR_SWATCH_ACTIVE_BORDER = '#fff';

/** Swatch default border */
export const COLOR_SWATCH_BORDER = 'rgba(255,255,255,0.2)';

/** Spinner track (semi-transparent white) */
export const COLOR_SPINNER_TRACK = 'rgba(255, 255, 255, 0.3)';

/** Retry button background (inside error bar) */
export const COLOR_RETRY_BTN_BG = 'rgba(255,255,255,0.2)';

// ── Scrollbar ────────────────────────────────────────────────────────────────

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
// Connection manager
// ---------------------------------------------------------------------------

/** Connection-manager popover background */
export const COLOR_CONN_POPOVER_BG = COLOR_BG_SECONDARY;

/** Connection-manager popover border */
export const COLOR_CONN_POPOVER_BORDER = '#444';

/** Hover background for connection-manager items */
export const COLOR_CONN_ITEM_HOVER_BG = COLOR_HOVER_BG;

/** Active/selected background for connection-manager items */
export const COLOR_CONN_ITEM_ACTIVE_BG = 'rgba(255,255,255,0.08)';

/** Section header text in the connection-manager popover */
export const COLOR_CONN_SECTION_HEADER = COLOR_TEXT_MUTED;

/** Item body text in the connection-manager popover */
export const COLOR_CONN_ITEM_TEXT = COLOR_TEXT;

/** Item label (name) text in the connection-manager popover */
export const COLOR_CONN_ITEM_LABEL = COLOR_TEXT_BRIGHT;

/** Max width of the connection-manager trigger button */
export const CONN_TRIGGER_MAX_WIDTH = 200;

/** Min width of the connection-manager popover */
export const CONN_POPOVER_MIN_WIDTH = 280;

/** Max height of the connection-manager popover */
export const CONN_POPOVER_MAX_HEIGHT = 400;

// ---------------------------------------------------------------------------
// Command bar
// ---------------------------------------------------------------------------

export const COLOR_COMMANDBAR_BG = 'rgba(255,255,255,0.06)';
export const COLOR_COMMANDBAR_BORDER = '#444';
export const COLOR_COMMANDBAR_ACTIVE_BORDER = '#555';
export const COLOR_COMMANDBAR_SELECTED_BG = '#094771';

// ── Layout sizing ──────────────────────────────────────────────────────────────

export const TITLE_BAR_HEIGHT = 28;

/** Top bar height in pixels (includes command bar, toggle buttons, etc.) */
export const TOP_BAR_HEIGHT = 28;

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

export const ANIMATION_TRANSITION = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)';

// ── Window controls (Tauri frameless title bar) ──────────────────────────────

/** Window control button width */
export const WINDOW_CTRL_WIDTH = 46;

/** Window control button height (matches TOP_BAR_HEIGHT) */
export const WINDOW_CTRL_HEIGHT = TOP_BAR_HEIGHT;

/** Window control icon size */
export const WINDOW_CTRL_ICON_SIZE = 16;

/** Close button hover background color */
export const COLOR_WINDOW_CLOSE_HOVER = '#e81123';

/** Close button hover icon color */
export const COLOR_WINDOW_CLOSE_HOVER_ICON = '#fff';

/** Minimize/maximize button hover background */
export const COLOR_WINDOW_CTRL_HOVER = 'rgba(255,255,255,0.08)';

/** Window control button default icon color */
export const COLOR_WINDOW_CTRL_ICON = COLOR_TEXT;

// ── Z-Index Layers ────────────────────────────────────────────────────────────

/** The top bar / title bar chrome */
export const Z_INDEX_TOPBAR = 10;

/** Dropdown menus, popovers, and floating pickers */
export const Z_INDEX_DROPDOWN = 1000;

/** Z-index layer for the connection-manager popover */
export const Z_INDEX_CONN_POPOVER = Z_INDEX_DROPDOWN;

/** Right-click context menus */
export const Z_INDEX_CONTEXT_MENU = 1000;

/** Modal dialogs and overlays */
export const Z_INDEX_DIALOG = 1100;

/** Command palette / quick-open bar */
export const Z_INDEX_COMMAND_BAR = 1201;
