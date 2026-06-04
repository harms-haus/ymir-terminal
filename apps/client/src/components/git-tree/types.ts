import type { GitCommitFileChange } from '@ymir/shared';

// ── CommitDetail ────────────────────────────────────────────────────────────

export interface CommitDetail {
  body: string;
  files: GitCommitFileChange[];
}
