import type { GitRepoInfo, GitBranch } from '@ymir/shared';
import type { UseGitReposReturn } from '../hooks/useGitRepos';
import { GitBranchSelector } from './GitBranchSelector';
import { GitRepoMenu } from './GitRepoMenu';
import {
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_BORDER,
  COLOR_GIT_REPO_HEADER_BG,
  COLOR_GIT_ACTION_BG,
  COLOR_GIT_ACTION_HOVER,
} from '../lib/theme';

interface GitRepoHeaderProps {
  repoInfo: GitRepoInfo;
  branches: GitBranch[];
  gitOps: UseGitReposReturn;
  onCheckout: (branch: string) => void;
  onCreateBranch: (name: string) => void;
  onPush: (branch: string) => void;
  onFetch: () => void;
  onOpenGitTree?: (repoPath: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  pushLoading?: boolean;
  fetchLoading?: boolean;
}

const actionButtonStyle: React.CSSProperties = {
  background: COLOR_GIT_ACTION_BG,
  border: `1px solid ${COLOR_BORDER}`,
  borderRadius: 3,
  padding: '2px 6px',
  fontSize: 12,
  cursor: 'pointer',
  color: COLOR_TEXT_MUTED,
};

export function GitRepoHeader({
  repoInfo,
  branches,
  gitOps,
  onCheckout,
  onCreateBranch,
  onPush,
  onFetch,
  onOpenGitTree,
  collapsed = false,
  onToggleCollapse,
  pushLoading = false,
  fetchLoading = false,
}: GitRepoHeaderProps) {
  return (
    <div
      data-testid="git-repo-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
        background: COLOR_GIT_REPO_HEADER_BG,
        borderBottom: `1px solid ${COLOR_BORDER}`,
      }}
    >
      {/* Left side */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: 1,
          minWidth: 0,
          cursor: onToggleCollapse ? 'pointer' : undefined,
        }}
        onClick={onToggleCollapse}
      >
        {onToggleCollapse && (
          <span style={{ fontSize: 10, color: COLOR_TEXT_MUTED }}>{collapsed ? '▶' : '▼'}</span>
        )}
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: COLOR_TEXT,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {repoInfo.name}
        </span>
        <GitBranchSelector
          branches={branches}
          current={repoInfo.branch}
          onCheckout={onCheckout}
          onCreateBranch={onCreateBranch}
        />
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {repoInfo.hasRemote && (
          <>
            <button
              data-testid="git-fetch-button"
              aria-label="Fetch"
              title="Fetch"
              onClick={onFetch}
              disabled={fetchLoading}
              style={{
                ...actionButtonStyle,
                ...(fetchLoading ? { opacity: 0.6, cursor: 'default' } : {}),
              }}
              onMouseEnter={(e) => {
                if (!fetchLoading) e.currentTarget.style.background = COLOR_GIT_ACTION_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLOR_GIT_ACTION_BG;
              }}
            >
              {fetchLoading ? '...' : '↻'}
            </button>
            <button
              data-testid="git-push-button"
              aria-label="Push"
              title="Push"
              onClick={() => onPush(repoInfo.branch!)}
              disabled={pushLoading}
              style={{
                ...actionButtonStyle,
                ...(pushLoading ? { opacity: 0.6, cursor: 'default' } : {}),
              }}
              onMouseEnter={(e) => {
                if (!pushLoading) e.currentTarget.style.background = COLOR_GIT_ACTION_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLOR_GIT_ACTION_BG;
              }}
            >
              {pushLoading ? '...' : '↑'}
            </button>
          </>
        )}
        <button
          data-testid="git-graph-button"
          aria-label="Git graph"
          title="Git Graph"
          onClick={() => onOpenGitTree?.(repoInfo.path)}
          style={actionButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = COLOR_GIT_ACTION_HOVER;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = COLOR_GIT_ACTION_BG;
          }}
        >
          ⊞
        </button>
        <GitRepoMenu
          repoInfo={repoInfo}
          branches={branches}
          status={gitOps.repoStatuses.get(repoInfo.path)}
          isRebaseInProgress={false}
          onPull={(rebase) => gitOps.pull(repoInfo.path, { rebase })}
          onPush={(branch) => gitOps.push(repoInfo.path, branch)}
          onFetch={() => gitOps.fetch(repoInfo.path)}
          onSync={(_branch) => gitOps.sync(repoInfo.path)}
          onCommitAmend={(opts) => gitOps.commitAmend(repoInfo.path, opts)}
          onCommitAll={(msg, opts) => gitOps.commitAll(repoInfo.path, msg, opts)}
          onResetSoft={() => gitOps.resetSoft(repoInfo.path)}
          onRebaseAbort={() => gitOps.rebaseAbort(repoInfo.path)}
          onStageAll={() => gitOps.stageAll(repoInfo.path)}
          onUnstageAll={() => gitOps.unstageAll(repoInfo.path)}
          onDiscardAll={() => gitOps.discardAll(repoInfo.path)}
          onMerge={(branch) => gitOps.merge(repoInfo.path, branch)}
          onRebase={(branch) => gitOps.rebase(repoInfo.path, branch)}
          onCreateBranch={(name) => gitOps.checkout(repoInfo.path, name, true)}
          onCreateBranchFrom={(name, start) => gitOps.createBranchFrom(repoInfo.path, name, start)}
          onRenameBranch={(old, newName) => gitOps.branchRename(repoInfo.path, old, newName)}
          onDeleteBranch={(name) => gitOps.branchDelete(repoInfo.path, name)}
          onDeleteRemoteBranch={(remote, branch) =>
            gitOps.branchDeleteRemote(repoInfo.path, remote, branch)
          }
          onPublishBranch={() => gitOps.branchPublish(repoInfo.path)}
          onRemoteAdd={(name, url) => gitOps.remoteAdd(repoInfo.path, name, url)}
          onRemoteRemove={(name) => gitOps.remoteRemove(repoInfo.path, name)}
          onStashPush={async (opts) => {
            await gitOps.stashPush(repoInfo.path, opts);
            return '';
          }}
          onStashApply={(ref) => gitOps.stashApply(repoInfo.path, ref)}
          onStashPop={(ref) => gitOps.stashPop(repoInfo.path, ref)}
          onStashDrop={(ref) => gitOps.stashDrop(repoInfo.path, ref)}
          onStashClear={() => gitOps.stashClear(repoInfo.path)}
          onFetchStashList={() => gitOps.stashList(repoInfo.path)}
          onFetchRemoteList={() => gitOps.remoteList(repoInfo.path)}
          onFetchRemoteBranches={() => gitOps.listRemoteBranches(repoInfo.path)}
        >
          <button
            data-testid="git-more-menu"
            aria-label="More actions"
            title="More Actions"
            style={actionButtonStyle}
          >
            ⋯
          </button>
        </GitRepoMenu>
      </div>
    </div>
  );
}
