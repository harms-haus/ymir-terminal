import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type GitStatusRequest,
  type GitStatusResponse,
  type GitLogRequest,
  type GitLogResponse,
  type GitRepoDiscoveryRequest,
  type GitRepoDiscoveryResponse,
  type GitStageRequest,
  type GitUnstageRequest,
  type GitDiscardRequest,
  type GitCommitRequest,
  type GitCommitResponse,
  type GitBranchesRequest,
  type GitBranchesResponse,
  type GitCheckoutRequest,
  type GitPushRequest,
  type GitFetchRequest,
  type GitDiffDataRequest,
  type GitDiffDataResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../connection';
import { createError, createResponse, type MessageRouter } from '../router';
import { getGitStatus as nativeGetGitStatus } from '../../git/status';
import { getGitStatusEnhanced as nativeGetGitStatusEnhanced } from '../../git/status';
import { getGitLog as nativeGetGitLog } from '../../git/log';
import { discoverRepos as nativeDiscoverRepos } from '../../git/discovery';
import {
  stageFiles as nativeStageFiles,
  unstageFiles as nativeUnstageFiles,
  discardChanges as nativeDiscardChanges,
  commitChanges as nativeCommitChanges,
} from '../../git/operations';
import {
  listBranches as nativeListBranches,
  createBranch as nativeCreateBranch,
  checkoutBranch as nativeCheckoutBranch,
} from '../../git/branches';
import { pushBranch as nativePushBranch, fetchRemote as nativeFetchRemote } from '../../git/remote';
import { getDiffData as nativeGetDiffData } from '../../git/diff';
import type { Database } from 'bun:sqlite';
import type { Workspace } from '../../db/persistent';
import { getWorkspace as dbGetWorkspace } from '../../db/persistent';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface GitDeps {
  persistentDb: Database;
  /** Internal: allows tests to inject mock functions. */
  _mocks?: {
    getGitStatus?: (dirPath: string) => Promise<GitStatusResponse | null>;
    getGitStatusEnhanced?: (
      dirPath: string,
    ) => Promise<
      (GitStatusResponse & { hasRemote: boolean; ahead: number; behind: number }) | null
    >;
    getGitLog?: (
      dirPath: string,
      skip: number,
      limit: number,
    ) => Promise<import('@ymir/shared').GitLogItem[]>;
    getWorkspace?: (db: Database, id: string) => Workspace | null;
    discoverRepos?: (
      workspaceCwd: string,
      maxDepth?: number,
    ) => Promise<import('@ymir/shared').GitRepoInfo[]>;
    stageFiles?: (dirPath: string, files: string[]) => Promise<void>;
    unstageFiles?: (dirPath: string, files: string[]) => Promise<void>;
    discardChanges?: (dirPath: string, files: string[]) => Promise<void>;
    commitChanges?: (dirPath: string, message: string) => Promise<string>;
    listBranches?: (
      dirPath: string,
    ) => Promise<{ branches: import('@ymir/shared').GitBranch[]; current: string | null }>;
    createBranch?: (dirPath: string, name: string) => Promise<void>;
    checkoutBranch?: (dirPath: string, name: string) => Promise<void>;
    pushBranch?: (dirPath: string, branch: string) => Promise<void>;
    fetchRemote?: (dirPath: string) => Promise<void>;
    getDiffData?: (
      repoDir: string,
      filePath: string,
      staged: boolean,
    ) => Promise<{
      originalContent: string;
      modifiedContent: string;
      additions: number;
      deletions: number;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGitHandlers(router: MessageRouter, deps: GitDeps): void {
  const doGetGitStatus = deps._mocks?.getGitStatus ?? nativeGetGitStatus;
  const doGetGitStatusEnhanced = deps._mocks?.getGitStatusEnhanced ?? nativeGetGitStatusEnhanced;
  const doGetGitLog = deps._mocks?.getGitLog ?? nativeGetGitLog;
  const doGetWorkspace = deps._mocks?.getWorkspace ?? dbGetWorkspace;
  const doDiscoverRepos = deps._mocks?.discoverRepos ?? nativeDiscoverRepos;
  const doStageFiles = deps._mocks?.stageFiles ?? nativeStageFiles;
  const doUnstageFiles = deps._mocks?.unstageFiles ?? nativeUnstageFiles;
  const doDiscardChanges = deps._mocks?.discardChanges ?? nativeDiscardChanges;
  const doCommitChanges = deps._mocks?.commitChanges ?? nativeCommitChanges;
  const doListBranches = deps._mocks?.listBranches ?? nativeListBranches;
  const doCreateBranch = deps._mocks?.createBranch ?? nativeCreateBranch;
  const doCheckoutBranch = deps._mocks?.checkoutBranch ?? nativeCheckoutBranch;
  const doPushBranch = deps._mocks?.pushBranch ?? nativePushBranch;
  const doFetchRemote = deps._mocks?.fetchRemote ?? nativeFetchRemote;
  const doGetDiffData = deps._mocks?.getDiffData ?? nativeGetDiffData;

  // --- git.status ---------------------------------------------------------
  router.handle('git.status', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitStatusRequest>;
    const payload = req.payload;

    if (payload == null || typeof payload !== 'object' || typeof payload.workspaceId !== 'string') {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'git.status' },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required field: workspaceId',
      );
      conn.send(err);
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel: req.channel ?? 'git.status' },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      conn.send(err);
      return;
    }

    const gitDir = payload.repoPath ? join(workspace.cwd, payload.repoPath) : workspace.cwd;

    if (payload.repoPath) {
      const result = await doGetGitStatusEnhanced(gitDir);

      const resp: ResponseEnvelope<GitStatusResponse> = createResponse(req, {
        branch: result?.branch ?? null,
        changes: result?.changes ?? [],
        staged: result?.staged ?? [],
        repoPath: payload.repoPath,
        hasRemote: result?.hasRemote ?? false,
        ahead: result?.ahead ?? 0,
        behind: result?.behind ?? 0,
      } satisfies GitStatusResponse);

      conn.send(resp);
    } else {
      const result = await doGetGitStatus(gitDir);

      const resp: ResponseEnvelope<GitStatusResponse> = createResponse(req, {
        branch: result?.branch ?? null,
        changes: result?.changes ?? [],
        staged: result?.staged ?? [],
        repoPath: payload.repoPath,
        hasRemote: (result as GitStatusResponse & { hasRemote?: boolean })?.hasRemote ?? false,
        ahead: (result as GitStatusResponse & { ahead?: number })?.ahead ?? 0,
        behind: (result as GitStatusResponse & { behind?: number })?.behind ?? 0,
      } satisfies GitStatusResponse);

      conn.send(resp);
    }
  });

  // --- git.log -----------------------------------------------------------
  router.handle('git.log', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitLogRequest>;
    const payload = req.payload;

    if (!payload || typeof payload.workspaceId !== 'string') {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.log' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid workspaceId',
        ),
      );
      return;
    }

    if (typeof payload.skip !== 'number' || typeof payload.limit !== 'number') {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.log' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid skip/limit',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.log' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          'Workspace not found',
        ),
      );
      return;
    }

    const gitDir = payload.repoPath ? join(workspace.cwd, payload.repoPath) : workspace.cwd;
    const limit = Math.min(Math.max(payload.limit, 1), 100);
    const skip = Math.max(payload.skip, 0);
    const commits = await doGetGitLog(gitDir, skip, limit);
    const hasMore = commits.length === limit;

    const resp = createResponse(req, { commits, hasMore } satisfies GitLogResponse);
    conn.send(resp);
  });

  // --- git.repoDiscovery --------------------------------------------------
  router.handle('git.repoDiscovery', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitRepoDiscoveryRequest>;
    const payload = req.payload;

    if (!payload || typeof payload !== 'object' || typeof payload.workspaceId !== 'string') {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.repoDiscovery' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing required field: workspaceId',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.repoDiscovery' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const repos = await doDiscoverRepos(workspace.cwd);
    const resp = createResponse(req, { repos } satisfies GitRepoDiscoveryResponse);
    conn.send(resp);
  });

  // --- git.stage ----------------------------------------------------------
  router.handle('git.stage', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitStageRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stage' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, files (non-empty array)',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.stage' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = join(workspace.cwd, payload.repoPath);
    await doStageFiles(absPath, payload.files);
    conn.send(createResponse(req, {}));
  });

  // --- git.unstage --------------------------------------------------------
  router.handle('git.unstage', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitUnstageRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.unstage' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, files (non-empty array)',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.unstage' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = join(workspace.cwd, payload.repoPath);
    await doUnstageFiles(absPath, payload.files);
    conn.send(createResponse(req, {}));
  });

  // --- git.discard --------------------------------------------------------
  router.handle('git.discard', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitDiscardRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      !Array.isArray(payload.files) ||
      payload.files.length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.discard' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, files (non-empty array)',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.discard' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = join(workspace.cwd, payload.repoPath);
    await doDiscardChanges(absPath, payload.files);
    conn.send(createResponse(req, {}));
  });

  // --- git.commit ---------------------------------------------------------
  router.handle('git.commit', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitCommitRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string' ||
      typeof payload.message !== 'string' ||
      payload.message.trim().length === 0
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commit' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, message (non-empty string)',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.commit' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = join(workspace.cwd, payload.repoPath);
    const commitHash = await doCommitChanges(absPath, payload.message);
    const resp = createResponse(req, { commitHash } satisfies GitCommitResponse);
    conn.send(resp);
  });

  // --- git.branches -------------------------------------------------------
  router.handle('git.branches', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
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

    const absPath = join(workspace.cwd, payload.repoPath);
    const result = await doListBranches(absPath);
    const resp = createResponse(req, result satisfies GitBranchesResponse);
    conn.send(resp);
  });

  // --- git.checkout -------------------------------------------------------
  router.handle('git.checkout', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
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

    const absPath = join(workspace.cwd, payload.repoPath);
    if (payload.createNew) {
      await doCreateBranch(absPath, payload.branch);
    } else {
      await doCheckoutBranch(absPath, payload.branch);
    }
    conn.send(createResponse(req, {}));
  });

  // --- git.push -----------------------------------------------------------
  router.handle('git.push', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitPushRequest>;
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
          { id: req.id, channel: req.channel ?? 'git.push' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath, branch',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.push' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = join(workspace.cwd, payload.repoPath);
    await doPushBranch(absPath, payload.branch);
    conn.send(createResponse(req, {}));
  });

  // --- git.fetch ----------------------------------------------------------
  router.handle('git.fetch', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<GitFetchRequest>;
    const payload = req.payload;

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.repoPath !== 'string'
    ) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.fetch' },
          ErrorCodes.INVALID_MESSAGE,
          'Missing or invalid fields: workspaceId, repoPath',
        ),
      );
      return;
    }

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
    if (!workspace) {
      conn.send(
        createError(
          { id: req.id, channel: req.channel ?? 'git.fetch' },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        ),
      );
      return;
    }

    const absPath = join(workspace.cwd, payload.repoPath);
    await doFetchRemote(absPath);
    conn.send(createResponse(req, {}));
  });

  // --- git.diffData --------------------------------------------------------
  router.handle('git.diffData', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
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

    const absRepoPath = join(workspace.cwd, payload.repoPath);
    const result = await doGetDiffData(absRepoPath, payload.filePath, payload.staged);
    conn.send(
      createResponse(req, { ...result, filePath: payload.filePath } satisfies GitDiffDataResponse),
    );
  });
}
