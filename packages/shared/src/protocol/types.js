// ---------------------------------------------------------------------------
// WebSocket message envelope types
// ---------------------------------------------------------------------------
/** Wire-protocol version – bump when breaking changes are introduced. */
export const PROTOCOL_VERSION = 1;
// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------
export const ErrorCodes = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_FAILED: 'AUTH_FAILED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  TERMINAL_NOT_FOUND: 'TERMINAL_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  TAB_NOT_FOUND: 'TAB_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  HANDLER_ERROR: 'HANDLER_ERROR',
};
