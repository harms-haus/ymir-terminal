import {
  ErrorCodes,
  type RequestEnvelope,
  type GitBranchesRequest,
  type GitBranchesResponse,
  type GitCheckoutRequest,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, type MessageRouter } from '../../router';
import type { ResolvedGitDeps } from './index';
import { resolveSafeRepoPath } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerBranchesHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const { doListBranches, doCreateBranch, doCheckoutBranch, doGetWorkspace, persistentDb } = deps;

  // --- git.branches -------------------------------------------------------
  router.handle('git.branches', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitBranchesRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branches' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.branches' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.branches');
    if (absPath === null) return;
    const result = await doListBranches(absPath);
    const resp = createResponse(req, result satisfies GitBranchesResponse);
    conn.send(resp);
  });

  // --- git.checkout -------------------------------------------------------
  router.handle('git.checkout', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitCheckoutRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.branch !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.checkout' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, branch',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.checkout' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.checkout');
    if (absPath === null) return;
    if (payload.createNew) {
      await doCreateBranch(absPath, payload.branch);
    } else {
      await doCheckoutBranch(absPath, payload.branch);
    }
    conn.send(createResponse(req, {}));
  });
}
