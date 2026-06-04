import { useState, useCallback, memo } from 'react';
import type { GitCommitFileChange } from '@ymir/shared';
import {
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_DIFF_ADDITIONS,
  COLOR_DIFF_DELETIONS,
  GIT_STATUS_COLORS,
} from '../../lib/theme';

// ── FileRow ─────────────────────────────────────────────────────────────────

interface FileRowProps {
  file: GitCommitFileChange;
  commitSha: string;
  parentSha: string;
  onOpenCommitDiff: (commitSha: string, parentSha: string, filePath: string) => void;
}

export const FileRow = memo(function FileRow({
  file,
  commitSha,
  parentSha,
  onOpenCommitDiff,
}: FileRowProps) {
  const [hovered, setHovered] = useState(false);

  const statusColor = GIT_STATUS_COLORS[file.status] ?? COLOR_TEXT_MUTED;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenCommitDiff(commitSha, parentSha, file.filePath);
      }
    },
    [commitSha, parentSha, file.filePath, onOpenCommitDiff],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenCommitDiff(commitSha, parentSha, file.filePath)}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 22,
        paddingLeft: 24,
        paddingRight: 8,
        gap: 6,
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontSize: 11,
          fontFamily: 'monospace',
          color: statusColor,
          width: 16,
          textAlign: 'center',
        }}
      >
        {file.status}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: COLOR_TEXT,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
        }}
      >
        {file.filePath}
      </span>
      <span
        style={{
          flexShrink: 0,
          fontSize: 12,
          fontFamily: 'monospace',
          color: COLOR_DIFF_ADDITIONS,
        }}
      >
        +{file.additions}
      </span>
      <span
        style={{
          flexShrink: 0,
          fontSize: 12,
          fontFamily: 'monospace',
          color: COLOR_DIFF_DELETIONS,
        }}
      >
        -{file.deletions}
      </span>
    </div>
  );
});
