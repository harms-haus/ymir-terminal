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
  type GitCommitDetailsRequest,
  type GitCommitDetailsResponse,
  type GitCommitDiffRequest,
  type GitCommitDiffResponse,
  type GitWorktreeListRequest,
  type GitWorktreeListResponse,
  type GitWorktreeCreateRequest,
  type GitWorktreeCreateResponse,
  type GitWorktreeRemoveRequest,
  type GitWorktreeInfo,
  type GitWorktreeMergeRequest,
  type GitWorktreeMergeResponse,
  type GitWorktreeCopyFilesRequest,
  type GitWorktreeCopyFilesResponse,
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
import {
  getDiffData as nativeGetDiffData,
  getCommitFileDiff as nativeGetCommitFileDiff,
} from '../../git/diff';
import { getCommitDetails as nativeGetCommitDetails } from '../../git/commit-details';
import {
  listWorktrees as nativeListWorktrees,
  createWorktree as nativeCreateWorktree,
  removeWorktree as nativeRemoveWorktree,
  mergeWorktree as nativeMergeWorktree,
  listUntrackedFiles as nativeListUntrackedFiles,
  readWorktreeCopyConfig as nativeReadWorktreeCopyConfig,
  writeWorktreeCopyConfig as nativeWriteWorktreeCopyConfig,
} from '../../git/worktrees';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { Workspace } from '../../db/persistent';
import { getWorkspace as dbGetWorkspace } from '../../db/persistent';
import { copyFile as nativeCopyFile } from '../../files/operations';
import { safePath } from '../../lib/handler-validation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHA_REGEX = /^[0-9a-f]{4,64}$/i;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Resolve `userInput` within `workspaceCwd`, sending a path-traversal error
 * to the client if validation fails.
 *
 * @returns The resolved absolute path, or `null` if traversal was detected
 *          (an error response is sent on `conn`).
 */
function resolveSafeRepoPath(
  workspaceCwd: string,
  repoPath: string | undefined | null,
  conn: ClientConnection,
  req: Pick<RequestEnvelope, 'id' | 'channel'>,
  channel: string,
): string | null {
  if (!repoPath) return workspaceCwd;
  try {
    return safePath(workspaceCwd, repoPath);
  } catch {
    conn.send(
      createError(
        { id: req.id, channel: req.channel ?? channel },
        ErrorCodes.PERMISSION_DENIED,
        'Path traversal detected',
      ),
    );
    return null;
  }
}

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
    getCommitDetails?: (
      dirPath: string,
      commitSha: string,
    ) => Promise<import('../../git/commit-details').CommitDetails | null>;
    getCommitFileDiff?: (
      repoDir: string,
      commitSha: string,
      parentSha: string,
      filePath: string,
    ) => Promise<{
      originalContent: string;
      modifiedContent: string;
      additions: number;
      deletions: number;
    }>;
    listWorktrees?: (dirPath: string) => Promise<GitWorktreeInfo[]>;
    createWorktree?: (
      dirPath: string,
      branchName: string,
      startRef?: string,
    ) => Promise<GitWorktreeInfo>;
    removeWorktree?: (dirPath: string, worktreePath: string, force?: boolean) => Promise<void>;
    mergeWorktree?: (
      dirPath: string,
      worktreePath: string,
      options?: { targetBranch?: string; deleteAfterMerge?: boolean },
    ) => Promise<{ success: boolean; message: string; worktreeRemoved: boolean }>;
    listUntrackedFiles?: (dirPath: string) => Promise<string[]>;
    readWorktreeCopyConfig?: (dirPath: string) => Promise<string[]>;
    writeWorktreeCopyConfig?: (dirPath: string, files: string[]) => Promise<void>;
    copyFile?: (src: string, dest: string) => Promise<void>;
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
  const doGetCommitDetails = deps._mocks?.getCommitDetails ?? nativeGetCommitDetails;
  const doGetCommitFileDiff = deps._mocks?.getCommitFileDiff ?? nativeGetCommitFileDiff;
  const doListWorktrees = deps._mocks?.listWorktrees ?? nativeListWorktrees;
  const doCreateWorktree = deps._mocks?.createWorktree ?? nativeCreateWorktree;
  const doRemoveWorktree = deps._mocks?.removeWorktree ?? nativeRemoveWorktree;
  const doMergeWorktree = deps._mocks?.mergeWorktree ?? nativeMergeWorktree;
  const doListUntrackedFiles = deps._mocks?.listUntrackedFiles ?? nativeListUntrackedFiles;
  const doReadWorktreeCopyConfig = deps._mocks?.readWorktreeCopyConfig ?? nativeReadWorktreeCopyConfig;
  const doWriteWorktreeCopyConfig = deps._mocks?.writeWorktreeCopyConfig ?? nativeWriteWorktreeCopyConfig;
  const doCopyFile = deps._mocks?.copyFile ?? nativeCopyFile;

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

    const gitDir = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.status');
    if (gitDir === null) return;

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

    const gitDir = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.log');
    if (gitDir === null) return;
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

    const baseDir = resolveSafeRepoPath(
      workspace.cwd,
      payload.repoPath,
      conn,
      req,
      'git.repoDiscovery',
    );
    if (baseDir === null) return;
    const repos = await doDiscoverRepos(baseDir);
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

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.stage');
    if (absPath === null) return;
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

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.unstage');
    if (absPath === null) return;
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

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.discard');
    if (absPath === null) return;
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

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.commit');
    if (absPath === null) return;
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

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.branches');
    if (absPath === null) return;
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

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.checkout');
    if (absPath === null) return;
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

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.push');
    if (absPath === null) return;
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

    const absPath = resolveSafeRepoPath(workspace.cwd, payload.repoPath, conn, req, 'git.fetch');
    if (absPath === null) return;
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
  router.handle('git.commitDetails', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
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
  router.handle('git.commitDiff', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
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

  // --- git.worktreeList ---------------------------------------------------
  router.handle('git.worktreeList', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
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
  router.handle(
    'git.worktreeCopyFiles',
    async (conn: ClientConnection, envelope: MessageEnvelope) => {
      const req = envelope as RequestEnvelope<GitWorktreeCopyFilesRequest>;
      const payload = req.payload;

      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.workspaceId !== 'string'
      ) {
        conn.send(
          createError(
            { id: req.id, channel: req.channel ?? 'git.worktreeCopyFiles' },
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
        createResponse(
          req,
          { untrackedFiles, configuredFiles } satisfies GitWorktreeCopyFilesResponse,
        ),
      );
    },
  );

  // --- git.worktreeCreate -------------------------------------------------
  router.handle('git.worktreeCreate', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
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
        const mainDir = workspace.cwd;
        const worktreeDir = worktree.path;

        // Copy each selected file from main to worktree
        for (const relPath of filesToCopy) {
          if (relPath === '.worktreecopy') continue;
          try {
            const srcAbs = safePath(mainDir, relPath);
            const dstAbs = safePath(worktreeDir, relPath);
            await doCopyFile(srcAbs, dstAbs);
          } catch {
            // Path traversal or copy failure — skip
          }
        }

        // Write confirmed list to .worktreecopy in main dir
        await doWriteWorktreeCopyConfig(mainDir, filesToCopy);
      }

      // ALWAYS copy .worktreecopy to the worktree if it exists
      try {
        await doCopyFile(join(workspace.cwd, '.worktreecopy'), join(worktree.path, '.worktreecopy'));
      } catch {
        // .worktreecopy may not exist yet, that's OK
      }

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
  router.handle('git.worktreeMerge', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
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
        const mainDir = workspace.cwd;
        const worktreeDir = resolved;

        for (const relPath of filesToCopy) {
          if (relPath === '.worktreecopy') continue;
          try {
            const srcAbs = safePath(worktreeDir, relPath);
            const dstAbs = safePath(mainDir, relPath);
            await doCopyFile(srcAbs, dstAbs);
          } catch {
            // Path traversal or copy failure — skip
          }
        }

        // Write confirmed list to .worktreecopy in main dir
        await doWriteWorktreeCopyConfig(mainDir, filesToCopy);
      }

      const result = await doMergeWorktree(workspace.cwd, payload.worktreePath, {
        targetBranch: payload.targetBranch,
        deleteAfterMerge: payload.deleteAfterMerge,
      });
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
  router.handle('git.worktreeRemove', async (conn: ClientConnection, envelope: MessageEnvelope) => {
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

    const workspace = doGetWorkspace(deps.persistentDb, payload.workspaceId);
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

    try {
      safePath(workspace.cwd, payload.worktreePath);
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
      await doRemoveWorktree(workspace.cwd, payload.worktreePath, payload.force);
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
