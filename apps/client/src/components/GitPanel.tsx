import { useState } from 'react';
import { useGitRepos } from '../hooks/git';
import { GitRepoHeader } from './GitRepoHeader';
import { GitCommitInput } from './GitCommitInput';
import { GitChangesSection } from './GitChangesSection';
import { COLOR_TEXT_DIM, COLOR_ERROR, COLOR_BORDER } from '../lib/theme';

interface GitPanelProps {
  workspaceId: string | null;
  workspaceCwd: string | null;
  onOpenEditor?: (filePath: string) => void;
  onOpenDiff?: (filePath: string, repoPath: string, staged: boolean) => void;
  onOpenGitTree?: (repoPath: string) => void;
}

export function GitPanel({
  workspaceId,
  workspaceCwd,
  onOpenEditor,
  onOpenDiff,
  onOpenGitTree,
}: GitPanelProps) {
  const git = useGitRepos(workspaceId, workspaceCwd);
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());

  const toggleRepoCollapse = (repoPath: string) => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoPath)) {
        next.delete(repoPath);
      } else {
        next.add(repoPath);
      }
      return next;
    });
  };

  if (!workspaceId) {
    return (
      <div style={{ padding: 12, color: COLOR_TEXT_DIM }} data-testid="git-panel">
        No workspace selected
      </div>
    );
  }

  if (git.loading && git.repos.length === 0) {
    return (
      <div style={{ padding: 12, color: COLOR_TEXT_DIM }} data-testid="git-panel">
        Loading...
      </div>
    );
  }

  if (git.repos.length === 0 && !git.loading) {
    return (
      <div style={{ padding: 12, color: COLOR_TEXT_DIM }} data-testid="git-panel">
        Not a git repository
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      data-testid="git-panel"
    >
      {git.error && (
        <div
          style={{
            padding: '6px 8px',
            color: COLOR_ERROR,
            fontSize: 12,
            background: 'rgba(255,0,0,0.1)',
            borderBottom: `1px solid ${COLOR_ERROR}`,
          }}
        >
          {git.error}
        </div>
      )}
      {git.repos.map((repo) => {
        const status = git.repoStatuses.get(repo.path);
        const branches = git.repoBranches.get(repo.path) || [];
        const hasStagedFiles = (status?.staged?.length ?? 0) > 0;
        const handleOpenDiff = onOpenDiff
          ? (filePath: string, staged: boolean) => onOpenDiff(filePath, repo.path, staged)
          : undefined;

        return (
          <div
            key={repo.path || '.'}
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderBottom: `1px solid ${COLOR_BORDER}`,
            }}
          >
            <GitRepoHeader
              repoInfo={repo}
              branches={branches}
              gitOps={git}
              collapsed={collapsedRepos.has(repo.path)}
              onToggleCollapse={() => toggleRepoCollapse(repo.path)}
              onCheckout={(branch) => git.checkout(repo.path, branch)}
              onCreateBranch={(name) => git.checkout(repo.path, name, true)}
              onPush={(branch) => git.push(repo.path, branch)}
              onFetch={() => git.fetch(repo.path)}
              onOpenGitTree={onOpenGitTree}
              pushLoading={git.pushLoading.get(repo.path)}
              fetchLoading={git.fetchLoading.get(repo.path)}
            />
            {!collapsedRepos.has(repo.path) && (
              <>
                <GitCommitInput
                  onCommit={(message) =>
                    git.commitAll(repo.path, message, { includeUntracked: false })
                  }
                  disabled={!hasStagedFiles}
                  loading={false}
                />
                <GitChangesSection
                  staged={status?.staged ?? []}
                  changes={status?.changes ?? []}
                  repoPath={repo.path}
                  onStageFiles={git.stageFiles}
                  onUnstageFiles={git.unstageFiles}
                  onDiscardFiles={git.discardChanges}
                  onOpenEditor={onOpenEditor}
                  onOpenDiff={handleOpenDiff}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
