import {
  ErrorCodes,
  type RequestEnvelope,
  type GitDiffDataRequest,
  type GitDiffDataResponse,
  type GitCommitDetailsRequest,
  type GitCommitDetailsResponse,
  type GitCommitDiffRequest,
  type GitCommitDiffResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, type MessageRouter } from '../../router';
import type { ResolvedGitDeps } from './index';
import { resolveSafeRepoPath, SHA_REGEX } from './shared';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerDiffHandlers(router: MessageRouter, deps: ResolvedGitDeps): void {
  const { doGetDiffData, doGetCommitDetails, doGetCommitFileDiff, doGetWorkspace, persistentDb } =
    deps;

  // --- git.diffData --------------------------------------------------------
  router.handle('git.diffData', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitDiffDataRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.filePath !== 'string' ||
      typeof payload.staged !== 'boolean'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.diffData' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, filePath, staged',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.diffData' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    if (payload.filePath.includes('..') || payload.filePath.startsWith('/')) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.diffData' },
          ErrorCodes.INVALID_MESSAGE,
          'Invalid file path',
        ),
      );
      return;
    }

    const absRepoPath = resolveSafeRepoPath(
      workspace.cwd,
      payload.repoPath,
      conn,
      req,
      'git.diffData',
    );
    if (absRepoPath === null) return;
    const result = await doGetDiffData(absRepoPath, payload.filePath, payload.staged);
    conn.send(
      createResponse(req, { ...result, filePath: payload.filePath } satisfies GitDiffDataResponse),
    );
  });

  // --- git.commitDetails ---------------------------------------------------
  router.handle('git.commitDetails', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitCommitDetailsRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.commitSha !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitDetails' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, commitSha',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitDetails' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    if (!SHA_REGEX.test(payload.commitSha)) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitDetails' },
          ErrorCodes.INVALID_MESSAGE,
          'Invalid commit SHA format',
        ),
      );
      return;
    }

    const gitDir = resolveSafeRepoPath(
      workspace.cwd,
      payload.repoPath,
      conn,
      req,
      'git.commitDetails',
    );
    if (gitDir === null) return;
    const result = await doGetCommitDetails(gitDir, payload.commitSha);
    if (!result) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitDetails' },
          ErrorCodes.INVALID_MESSAGE,
          `Commit not found: ${payload.commitSha}`,
        ),
      );
      return;
    }

    const resp = createResponse(req, {
      commitSha: payload.commitSha,
      body: result.body,
      files: result.files,
    } satisfies GitCommitDetailsResponse);
    conn.send(resp);
  });

  // --- git.commitDiff ------------------------------------------------------
  router.handle('git.commitDiff', async (conn: ClientConnection, envelope) => {
    const req = envelope as RequestEnvelope<GitCommitDiffRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.commitSha !== 'string' ||
      typeof payload.parentSha !== 'string' ||
      typeof payload.filePath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitDiff' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, commitSha, parentSha, filePath',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitDiff' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    if (!SHA_REGEX.test(payload.commitSha)) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitDiff' },
          ErrorCodes.INVALID_MESSAGE,
          'Invalid commit SHA format',
        ),
      );
      return;
    }

    if (payload.parentSha !== '' && !SHA_REGEX.test(payload.parentSha)) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitDiff' },
          ErrorCodes.INVALID_MESSAGE,
          'Invalid parent SHA format',
        ),
      );
      return;
    }

    if (payload.filePath && (payload.filePath.includes('..') || payload.filePath.startsWith('/'))) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commitDiff' },
          ErrorCodes.INVALID_MESSAGE,
          'Invalid file path',
        ),
      );
      return;
    }

    const absRepoPath = resolveSafeRepoPath(
      workspace.cwd,
      payload.repoPath,
      conn,
      req,
      'git.commitDiff',
    );
    if (absRepoPath === null) return;
    const result = await doGetCommitFileDiff(
      absRepoPath,
      payload.commitSha,
      payload.parentSha,
      payload.filePath,
    );
    conn.send(
      createResponse(req, {
        ...result,
        filePath: payload.filePath,
      } satisfies GitCommitDiffResponse),
    );
  });
}
