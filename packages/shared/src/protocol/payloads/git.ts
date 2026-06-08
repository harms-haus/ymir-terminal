// ---------------------------------------------------------------------------
// Git types — barrel file
//
// Re-exports all git-related types from focused modules so that existing
// consumers can continue to import from this single entry point.
// ---------------------------------------------------------------------------

export * from './git-operations';
export * from './git-branches';
export * from './git-diff';
export * from './git-stash';
