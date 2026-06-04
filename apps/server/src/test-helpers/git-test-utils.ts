/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared test utilities for git handler tests.
 *
 * Provides the `createTestDeps()` helper used by both `git/merge.test.ts` and
 * `git/stash.test.ts` (and any future git sub-handler tests) to avoid
 * duplication of the mock dependency factory.
 */

import type { GitDeps } from '../ws/handlers/git/index';
import { makeGetWorkspaceMock } from './mock-utils';

// ---------------------------------------------------------------------------
// Default workspace data
// ---------------------------------------------------------------------------

/** Standard mock workspace returned by `createTestDeps` for workspace id `'ws-1'`. */
export const DEFAULT_WORKSPACE = {
  id: 'ws-1',
  name: 'Test',
  cwd: '/home/dev/project',
  color: '#007acc',
  sort_order: 0,
} as const;

// ---------------------------------------------------------------------------
// createTestDeps
// ---------------------------------------------------------------------------

/**
 * Build a `GitDeps` object suitable for passing to `registerGitHandlers`.
 *
 * The returned deps include a `getWorkspace` mock that recognises `'ws-1'`
 * (returning {@link DEFAULT_WORKSPACE}) and returns `null` for any other id.
 *
 * @param overrides - Optional mock function overrides to merge into `_mocks`.
 *                    Keys match `GitDeps._mocks` properties (e.g.
 *                    `mergeBranch`, `stashPush`, `getWorkspace`).
 */
export function createTestDeps(overrides: Record<string, any> = {}): GitDeps {
  const getWorkspaceFn = overrides.getWorkspace ?? makeGetWorkspaceMock();

  // Remove getWorkspace from overrides so it isn't spread twice.
  const { getWorkspace: _gw, ...rest } = overrides;

  return {
    persistentDb: {} as any,
    _mocks: {
      getWorkspace: getWorkspaceFn,
      ...rest,
    },
  };
}
