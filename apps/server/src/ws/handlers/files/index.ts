import type { MessageRouter } from '../../router';
import type { FileDeps } from './shared';
import { registerTreeHandlers } from './tree';
import { registerCrudHandlers } from './crud';

// Re-export FileDeps for consumers
export type { FileDeps } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerFileHandlers(
  router: MessageRouter,
  deps: FileDeps,
): void {
  registerTreeHandlers(router, deps);
  registerCrudHandlers(router, deps);
}
