import { useState, memo } from 'react';
import { formatRelativeTime } from '../../lib/git-utils';
import type { GitLogItem } from '@ymir/shared';
import { COLOR_TEXT, COLOR_TEXT_MUTED } from '../../lib/theme';
import type { LaneInfo, ActiveLane } from '../../lib/git-graph';
import { CommitGraphRow } from '../git-graph/CommitGraphRow';
import { GitCommitDetail } from './GitCommitDetail';
import type { CommitDetail } from './types';

// ── Constants ───────────────────────────────────────────────────────────────

const ROW_HEIGHT = 24;

// ── TreeRow ─────────────────────────────────────────────────────────────────

interface TreeRowProps {
  commit: GitLogItem;
  subject: string;
  info: LaneInfo;
  graphWidth: number;
  activeLanes: ActiveLane[];
  isExpanded: boolean;
  details: CommitDetail | undefined;
  isLoadingDetails: boolean;
  detailsError: string | null;
  parentSha: string;
  onToggle: (sha: string) => void;
  onOpenCommitDiff: (commitSha: string, parentSha: string, filePath: string) => void;
  onRetryDetails: (sha: string) => void;
}

export const TreeRow = memo(function TreeRow({
  commit,
  subject,
  info,
  graphWidth,
  activeLanes,
  isExpanded,
  details,
  isLoadingDetails,
  detailsError,
  parentSha,
  onToggle,
  onOpenCommitDiff,
  onRetryDetails,
}: TreeRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div>
      {/* Collapsed header row — always visible */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => onToggle(commit.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(commit.id);
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: ROW_HEIGHT,
          cursor: 'pointer',
          background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: COLOR_TEXT_MUTED,
            flexShrink: 0,
            width: 12,
            textAlign: 'center',
          }}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
        <CommitGraphRow info={info} graphWidth={graphWidth} activeLanes={activeLanes} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
            paddingRight: 8,
            overflow: 'hidden',
            gap: 6,
          }}
        >
          <div
            style={{
              flex: 1,
              fontSize: 12,
              color: COLOR_TEXT,
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
            }}
          >
            {subject}
          </div>
          <span
            style={{
              flexShrink: 0,
              fontSize: 10,
              color: COLOR_TEXT_MUTED,
              whiteSpace: 'nowrap',
            }}
          >
            {formatRelativeTime(commit.date)}
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <GitCommitDetail
          commit={commit}
          subject={subject}
          details={details}
          isLoading={isLoadingDetails}
          error={detailsError}
          parentSha={parentSha}
          onOpenCommitDiff={onOpenCommitDiff}
          onRetry={onRetryDetails}
        />
      )}
    </div>
  );
});
