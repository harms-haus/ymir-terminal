import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { sendRequest } from '../../lib/send-request';
import { usePaginatedGitLog } from '../../hooks/usePaginatedGitLog';
import type { GitCommitDetailsResponse } from '@ymir/shared';
import { COLOR_ERROR, COLOR_BG_PRIMARY } from '../../lib/theme';
import { GitCommitFilter } from './GitCommitFilter';
import { GitCommitList } from './GitCommitList';
import type { CommitDetail } from './types';

// ── GitTreeTab ──────────────────────────────────────────────────────────────

interface GitTreeTabProps {
  workspaceId: string;
  repoPath: string; // empty string '' means workspace root
  highlightCommitSha?: string | null; // one-shot: scroll to and expand this commit
  onOpenCommitDiff: (commitSha: string, parentSha: string, filePath: string) => void;
}

export function GitTreeTab({
  workspaceId,
  repoPath,
  highlightCommitSha,
  onOpenCommitDiff,
}: GitTreeTabProps) {
  // ── Paginated git log ────────────────────────────────────────────────

  const { commits, loading, error, sentinelRef, reload } = usePaginatedGitLog({
    workspaceId,
    repoPath,
  });

  // ── Filter state ─────────────────────────────────────────────────────

  const [filterText, setFilterText] = useState('');

  const filteredCommits = useMemo(() => {
    if (!filterText.trim()) return commits;
    const lower = filterText.toLowerCase();
    return commits.filter(
      (c) => c.message.toLowerCase().includes(lower) || c.author.toLowerCase().includes(lower),
    );
  }, [commits, filterText]);

  // ── Commit-details state ────────────────────────────────────────────

  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Map<string, CommitDetail>>(new Map());
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());
  const [detailsErrors, setDetailsErrors] = useState<Map<string, string>>(new Map());

  // ── Refs to stabilise loadCommitDetails callback ───────────────────────
  const detailsCacheRef = useRef(detailsCache);
  const detailsLoadingRef = useRef(detailsLoading);
  useEffect(() => {
    detailsCacheRef.current = detailsCache;
  }, [detailsCache]);
  useEffect(() => {
    detailsLoadingRef.current = detailsLoading;
  }, [detailsLoading]);

  // ── loadCommitDetails ─────────────────────────────────────────────────

  const loadCommitDetails = useCallback(
    async (sha: string) => {
      if (detailsCacheRef.current.has(sha) || detailsLoadingRef.current.has(sha)) return;
      setDetailsLoading((prev) => {
        const next = new Set(prev);
        next.add(sha);
        return next;
      });
      try {
        setDetailsErrors((prev) => {
          const next = new Map(prev);
          next.delete(sha);
          return next;
        });
        const res = await sendRequest<GitCommitDetailsResponse>('git.commitDetails', {
          workspaceId,
          repoPath: repoPath || undefined,
          commitSha: sha,
        });
        setDetailsCache((prev) => {
          const next = new Map(prev);
          next.set(sha, { body: res.body, files: res.files });
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load commit details';
        setDetailsErrors((prev) => {
          const next = new Map(prev);
          next.set(sha, message);
          return next;
        });
      } finally {
        setDetailsLoading((prev) => {
          const next = new Set(prev);
          next.delete(sha);
          return next;
        });
      }
    },
    [workspaceId, repoPath],
  );

  const loadCommitDetailsRef = useRef(loadCommitDetails);
  // Keep ref current outside of render to satisfy React Compiler
  useEffect(() => {
    loadCommitDetailsRef.current = loadCommitDetails;
  });

  // ── Reset details on workspaceId / repoPath change ─────────────────

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setExpandedSha(null);
    setDetailsCache(new Map());
    setDetailsLoading(new Set());
    setDetailsErrors(new Map());
    setFilterText('');
  }, [workspaceId, repoPath]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Expand triggers details fetch ────────────────────────────────────

  useEffect(() => {
    if (expandedSha) {
      loadCommitDetailsRef.current(expandedSha);
    }
  }, [expandedSha]);

  // ── highlightCommitSha ───────────────────────────────────────────────

  const [scrollToSha, setScrollToSha] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!highlightCommitSha) return;
    setExpandedSha(highlightCommitSha);
    loadCommitDetailsRef.current(highlightCommitSha);
    setScrollToSha(highlightCommitSha);
  }, [highlightCommitSha]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Render helpers ───────────────────────────────────────────────────

  const toggleExpand = useCallback((sha: string) => {
    setExpandedSha((prev) => (prev === sha ? null : sha));
  }, []);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      data-testid="git-tree-tab"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: COLOR_BG_PRIMARY,
      }}
    >
      <GitCommitFilter value={filterText} onChange={setFilterText} />

      {error && (
        <div
          style={{
            padding: 8,
            color: COLOR_ERROR,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={reload}
            style={{
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

      <GitCommitList
        commits={filteredCommits}
        expandedSha={expandedSha}
        detailsCache={detailsCache}
        detailsLoading={detailsLoading}
        detailsErrors={detailsErrors}
        onToggleExpand={toggleExpand}
        onOpenCommitDiff={onOpenCommitDiff}
        onRetryDetails={loadCommitDetails}
        scrollToSha={scrollToSha}
        sentinelRef={sentinelRef}
        loading={loading}
      />
    </div>
  );
}
