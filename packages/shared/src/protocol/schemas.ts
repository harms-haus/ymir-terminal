import { z } from 'zod';

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

export const AuthRequestSchema = z.object({
  password: z.string(),
});

// ---------------------------------------------------------------------------
// Git schemas
// ---------------------------------------------------------------------------

// Shared base schemas

const WorkspaceIdSchema = z.string();
const RepoPathSchema = z.string();

/** workspaceId + repoPath — used by most git operations */
const GitRepoRequestBaseSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  repoPath: RepoPathSchema,
});

export const GitStageRequestSchema = GitRepoRequestBaseSchema.extend({
  files: z.array(z.string().min(1)).min(1),
});

/** Reuse the same shape for unstage and discard (identical fields) */
export const GitUnstageRequestSchema = GitStageRequestSchema;
export const GitDiscardRequestSchema = GitStageRequestSchema;

export const GitStageAllRequestSchema = GitRepoRequestBaseSchema;
export const GitUnstageAllRequestSchema = GitRepoRequestBaseSchema;
export const GitDiscardAllRequestSchema = GitRepoRequestBaseSchema;

export const GitBranchesRequestSchema = GitRepoRequestBaseSchema;
export const GitBranchesRemoteRequestSchema = GitRepoRequestBaseSchema;

export const GitCommitRequestSchema = GitRepoRequestBaseSchema.extend({
  message: z.string().trim().min(1),
});

export const GitCommitAmendRequestSchema = GitRepoRequestBaseSchema.extend({
  message: z.string().optional(),
  noEdit: z.boolean().optional(),
});

export const GitCommitAllRequestSchema = GitRepoRequestBaseSchema.extend({
  message: z.string().trim().min(1),
  includeUntracked: z.boolean().optional(),
  amend: z.boolean().optional(),
});

export const GitResetSoftRequestSchema = GitRepoRequestBaseSchema.extend({
  ref: z.string().optional(),
});

export const GitCheckoutRequestSchema = GitRepoRequestBaseSchema.extend({
  branch: z.string(),
  createNew: z.boolean().optional(),
});

export const GitBranchRenameRequestSchema = GitRepoRequestBaseSchema.extend({
  oldName: z.string(),
  newName: z.string(),
});

export const GitBranchDeleteRequestSchema = GitRepoRequestBaseSchema.extend({
  name: z.string(),
  force: z.boolean().optional(),
});

export const GitBranchDeleteRemoteRequestSchema = GitRepoRequestBaseSchema.extend({
  remote: z.string(),
  branch: z.string(),
});

export const GitBranchPublishRequestSchema = GitRepoRequestBaseSchema.extend({
  remote: z.string().optional(),
});

export const GitBranchCreateFromRequestSchema = GitRepoRequestBaseSchema.extend({
  name: z.string(),
  startPoint: z.string(),
});

// ---------------------------------------------------------------------------
// Tab schemas
// ---------------------------------------------------------------------------

const TabTypeEnum = z.enum(['terminal', 'editor', 'diff', 'git-tree']);

export const TabListRequestSchema = z.object({
  workspaceId: z.string(),
  pane: z.string().optional(),
  worktreePath: z.string().nullable().optional(),
});

export const TabCreateRequestSchema = z.object({
  workspaceId: z.string(),
  pane: z.string(),
  tabType: TabTypeEnum,
  title: z.string(),
  terminalId: z.string().optional(),
  filePath: z.string().optional(),
  diffRef: z.enum(['staged', 'unstaged', 'commit']).nullable().optional(),
  diffRepoPath: z.string().optional(),
  repoPath: z.string().optional(),
  commitSha: z.string().optional(),
  parentSha: z.string().optional(),
  cwd: z.string().optional(),
  customTitle: z.string().optional(),
  worktreePath: z.string().nullable().optional(),
});

export const TabUpdateRequestSchema = z.object({
  tabId: z.string(),
  active: z.boolean().optional(),
  sortOrder: z.number().optional(),
  title: z.string().optional(),
});

export const TabDeleteRequestSchema = z.object({
  tabId: z.string(),
});

export const TabReorderRequestSchema = z.object({
  tabIds: z.array(z.string()).min(1),
});

export const TabRestoreRequestSchema = z.object({
  workspaceId: z.string(),
  worktreePath: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// File schemas
// ---------------------------------------------------------------------------

export const FileWriteRequestSchema = z.object({
  workspaceId: z.string(),
  path: z.string(),
  content: z.string(),
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Validate `data` against a Zod schema and return the typed result.
 * Throws a formatted error on validation failure.
 */
export function validatePayload<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  ${path}: ${issue.message}`;
    })
    .join('\n');

  throw new Error(`Payload validation failed:\n${issues}`);
}
