import {
  ErrorCodes,
  type RequestEnvelope,
  type GitWorktreeListRequest,
  type GitWorktreeListResponse,
  type GitWorktreeCreateRequest,
  type GitWorktreeCreateResponse,
  type GitWorktreeRemoveRequest,
  type GitWorktreeMergeRequest,
  type GitWorktreeMergeResponse,
  type GitWorktreeCopyFilesRequest,
  type GitWorktreeCopyFilesResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, type MessageRouter } from '../../router';
import { join } from 'node:path';
import type { ResolvedGitDeps } from './index';
import { safePath } from './shared';

// ---------------------------------------------------------------------------
// Local helper – shared file-copy logic used by create & merge
// ---------------------------------------------------------------------------

/**
 * Copy a list of relative file paths from `srcDir` to `destDir`, then write
 * the confirmed list to `.worktreecopy` in `configDir`.
 *
 * Silently skips `.worktreecopy` entries and individual files that fail due
 * to path-traversal or copy errors.
 */
async function copyWorktreeFiles(
  srcDir: string,
  destDir: string,
  configDir: string,
  files: string[],
  copyFileFn: (src: string, dest: string) => Promise<void>,
  safePathFn: (base: string, rel: string) => string,
  writeConfigFn: (dir: string, files: string[]) => Promise<void>,
): Promise<void> {
  for (const relPath of files) {
    if (relPath === '.worktreecopy') continue;
    try {
      const srcAbs = safePathFn(srcDir, relPath);
      const dstAbs = safePathFn(destDir, relPath);
      await copyFileFn(srcAbs, dstAbs);
    } catch {
      // Path traversal or copy failure — skip
    }
  }

  // Write confirmed list to .worktreecopy in config dir
  await writeConfigFn(configDir, files);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorktreeHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const {
    doListWorktrees,
    doCreateWorktree,
    doRemoveWorktree,
    doMergeWorktree,
    doListUntrackedFiles,
    doReadWorktreeCopyConfig,
    doWriteWorktreeCopyConfig,
    doCopyFile,
    doInvalidateAndRefresh,
    doGetWorkspace,
    persistentDb,
  } = deps;

  // --- git.worktreeList ---------------------------------------------------
  router.handle('git.worktreeList', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitWorktreeListRequest>;
    const payload = req.payload;

    if (!payload || typeof payload !== 'object' || typeof payload.workspaceId !== 'string') {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeList' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing required field: workspaceId',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeList' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const worktrees = await doListWorktrees(workspace.cwd);
    const resp = createResponse(req, { worktrees } satisfies GitWorktreeListResponse);
    conn.send(resp);
  });

  // --- git.worktreeCopyFiles ---------------------------------------------
  router.handle('git.worktreeCopyFiles', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitWorktreeCopyFilesRequest>;
    const payload = req.payload;

    if (!payload || typeof payload !== 'object' || typeof payload.workspaceId !== 'string') {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeCopyFiles' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing required field: workspaceId',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeCopyFiles' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    let resolvedDir: string;
    if (payload.dirPath) {
      try {
        resolvedDir = safePath(workspace.cwd, payload.dirPath);
      } catch {
        conn.send(
          createError(
            { id: req.id, channel: req.channel ?? 'git.worktreeCopyFiles' },
            ErrorCodes.PERMISSION_DENIED,
            'Path traversal detected',
          ),
        );
        return;
      }
    } else {
      resolvedDir = workspace.cwd;
    }

    const [untrackedFiles, configuredFiles] = await Promise.all([
      doListUntrackedFiles(resolvedDir),
      doReadWorktreeCopyConfig(resolvedDir),
    ]);

    conn.send(
      createResponse(req, {
        untrackedFiles,
        configuredFiles,
      } satisfies GitWorktreeCopyFilesResponse),
    );
  });

  // --- git.worktreeCreate -------------------------------------------------
  router.handle('git.worktreeCreate', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitWorktreeCreateRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.branchName !== 'string' ||
      !/^[a-zA-Z0-9\/. _-]+$/.test(payload.branchName)
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeCreate' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, branchName',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeCreate' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    try {
      const worktree = await doCreateWorktree(workspace.cwd, payload.branchName, payload.startRef);

      const filesToCopy: string[] = payload.filesToCopy ?? [];
      if (filesToCopy.length > 0) {
        // Copy from main → worktree
        await copyWorktreeFiles(
          workspace.cwd,
          worktree.path,
          workspace.cwd,
          filesToCopy,
          doCopyFile,
          safePath,
          doWriteWorktreeCopyConfig,
        );
      }

      // ALWAYS copy .worktreecopy to the worktree if it exists
      try {
        await doCopyFile(
          join(workspace.cwd, '.worktreecopy'),
          join(worktree.path, '.worktreecopy'),
        );
      } catch {
        // .worktreecopy may not exist yet, that's OK
      }

      void doInvalidateAndRefresh(workspace.cwd);
      const resp = createResponse(req, { worktree } satisfies GitWorktreeCreateResponse);
      conn.send(resp);
    } catch (err) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeCreate' },
          ErrorCodes.INTERNAL_ERROR,
          err instanceof Error ? err.message : 'Failed to create worktree',
        ),
      );
    }
  });

  // --- git.worktreeMerge -------------------------------------------------
  router.handle('git.worktreeMerge', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitWorktreeMergeRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.worktreePath !== 'string' ||
      payload.worktreePath.length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeMerge' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, worktreePath',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeMerge' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    try {
      const resolved = safePath(workspace.cwd, payload.worktreePath);

      const filesToCopy: string[] = payload.filesToCopy ?? [];
      if (filesToCopy.length > 0) {
        // Copy from worktree → main
        await copyWorktreeFiles(
          resolved,
          workspace.cwd,
          workspace.cwd,
          filesToCopy,
          doCopyFile,
          safePath,
          doWriteWorktreeCopyConfig,
        );
      }

      const result = await doMergeWorktree(workspace.cwd, resolved, {
        targetBranch: payload.targetBranch,
        deleteAfterMerge: payload.deleteAfterMerge,
      });
      void doInvalidateAndRefresh(workspace.cwd);
      const resp = createResponse(req, {
        success: result.success,
        message: result.message,
        worktreeRemoved: result.worktreeRemoved,
      } satisfies GitWorktreeMergeResponse);
      conn.send(resp);
    } catch (err) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeMerge' },
          ErrorCodes.INTERNAL_ERROR,
          err instanceof Error ? err.message : 'Failed to merge worktree',
        ),
      );
    }
  });

  // --- git.worktreeRemove -------------------------------------------------
  router.handle('git.worktreeRemove', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitWorktreeRemoveRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.worktreePath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeRemove' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, worktreePath',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeRemove' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    let resolvedPath: string;
    try {
      resolvedPath = safePath(workspace.cwd, payload.worktreePath);
    } catch {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeRemove' },
          ErrorCodes.PERMISSION_DENIED,
          'Worktree path must be within the workspace',
        ),
      );
      return;
    }

    try {
      await doRemoveWorktree(workspace.cwd, resolvedPath, payload.force);
      void doInvalidateAndRefresh(workspace.cwd);
      conn.send(createResponse(req, null));
    } catch (err) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.worktreeRemove' },
          ErrorCodes.INTERNAL_ERROR,
          err instanceof Error ? err.message : 'Failed to remove worktree',
        ),
      );
    }
  });
}
