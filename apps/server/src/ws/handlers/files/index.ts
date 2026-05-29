import type { MessageRouter } from '../../router';
import { registerTreeHandlers } from './tree';
import { registerCrudHandlers } from './crud';

// Re-export FileDeps for consumers
export type { FileDeps } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerFileHandlers(
  router: MessageRouter,
  deps: import('./shared').FileDeps,
): void {
  registerTreeHandlers(router, deps);
  registerCrudHandlers(router, deps);
}
