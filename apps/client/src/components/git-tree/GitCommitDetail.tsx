import { memo } from 'react';
import type { GitLogItem } from '@ymir/shared';
import { COLOR_TEXT_MUTED, COLOR_ERROR, COLOR_BORDER } from '../../lib/theme';
import { FileRow } from './FileRow';
import type { CommitDetail } from './types';

// ── GitCommitDetail ─────────────────────────────────────────────────────────

interface GitCommitDetailProps {
  commit: GitLogItem;
  subject: string;
  details: CommitDetail | undefined;
  isLoading: boolean;
  error: string | null;
  parentSha: string;
  onOpenCommitDiff: (commitSha: string, parentSha: string, filePath: string) => void;
  onRetry: (sha: string) => void;
}

export const GitCommitDetail = memo(function GitCommitDetail({
  commit,
  subject,
  details,
  isLoading,
  error,
  parentSha,
  onOpenCommitDiff,
  onRetry,
}: GitCommitDetailProps) {
  return (
    <div>
      {/* Commit body */}
      {details && details.body && details.body !== subject && (
        <div
          style={{
            fontSize: 12,
            color: COLOR_TEXT_MUTED,
            padding: '4px 8px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {details.body}
        </div>
      )}

      {/* Author info */}
      <div
        style={{
          fontSize: 11,
          color: COLOR_TEXT_MUTED,
          padding: '2px 8px',
        }}
      >
        {commit.author}
      </div>

      {/* Files changed section */}
      {details && details.files.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10,
              color: COLOR_TEXT_MUTED,
              textTransform: 'uppercase',
              padding: '4px 8px',
              borderTop: `1px solid ${COLOR_BORDER}`,
              marginTop: 4,
            }}
          >
            Files changed
          </div>
          {details.files.map((file) => (
            <FileRow
              key={file.filePath}
              file={file}
              commitSha={commit.id}
              parentSha={parentSha}
              onOpenCommitDiff={onOpenCommitDiff}
            />
          ))}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div
          style={{
            fontSize: 12,
            color: COLOR_TEXT_MUTED,
            padding: 8,
          }}
        >
          Loading...
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div style={{ padding: 8, color: COLOR_ERROR, fontSize: 12 }}>
          <div>Failed to load commit details.</div>
          <button
            onClick={() => onRetry(commit.id)}
            style={{
              marginTop: 4,
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: COLOR_ERROR,
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
});
