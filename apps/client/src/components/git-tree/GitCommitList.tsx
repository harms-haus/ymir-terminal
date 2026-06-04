import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { GitLogItem } from '@ymir/shared';
import { COLOR_TEXT_MUTED } from '../../lib/theme';
import {
  LANE_WIDTH,
  GRAPH_LEFT_PADDING,
  EMPTY_ACTIVE_LANES,
  computeLanes,
  computeActiveLanes,
} from '../../lib/git-graph';
import { TreeRow } from './TreeRow';
import type { CommitDetail } from './types';

// ── Constants ───────────────────────────────────────────────────────────────

const ROW_HEIGHT = 24;

// ── GitCommitList ───────────────────────────────────────────────────────────

export interface GitCommitListProps {
  commits: GitLogItem[];
  expandedSha: string | null;
  detailsCache: Map<string, CommitDetail>;
  detailsLoading: Set<string>;
  detailsErrors: Map<string, string>;
  onToggleExpand: (sha: string) => void;
  onOpenCommitDiff: (commitSha: string, parentSha: string, filePath: string) => void;
  onRetryDetails: (sha: string) => void;
  scrollToSha?: string | null;
  sentinelRef: (node?: Element | null) => void;
  loading: boolean;
}

export function GitCommitList({
  commits,
  expandedSha,
  detailsCache,
  detailsLoading,
  detailsErrors,
  onToggleExpand,
  onOpenCommitDiff,
  onRetryDetails,
  scrollToSha,
  sentinelRef,
  loading,
}: GitCommitListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollPendingRef = useRef(false);

  // ── Computed lane data ───────────────────────────────────────────────

  const laneData = useMemo(() => computeLanes(commits), [commits]);

  const maxLane = useMemo(() => {
    if (laneData.length === 0) return 0;
    return Math.max(...laneData.map((l) => l.lane));
  }, [laneData]);

  const graphWidth = LANE_WIDTH * (maxLane + 1) + GRAPH_LEFT_PADDING;

  const activeLanesData = useMemo(() => computeActiveLanes(laneData), [laneData]);

  // ── Virtualizer ──────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index: number) => commits[index]?.id ?? index,
    measureElement: (el: HTMLElement) => el.getBoundingClientRect().height,
  });

  // ── Scroll-to-sha effects ──────────────────────────────────────────

  useEffect(() => {
    if (!scrollToSha) return;
    scrollPendingRef.current = true;
    const idx = commits.findIndex((c) => c.id === scrollToSha);
    if (idx !== -1) {
      scrollPendingRef.current = false;
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(idx, { align: 'center' });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToSha]);

  useEffect(() => {
    if (!scrollPendingRef.current || !scrollToSha) return;
    const idx = commits.findIndex((c) => c.id === scrollToSha);
    if (idx !== -1) {
      scrollPendingRef.current = false;
      requestAnimationFrame(() => rowVirtualizer.scrollToIndex(idx, { align: 'center' }));
    }
  }, [commits, scrollToSha, rowVirtualizer]);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div ref={parentRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
      {commits.length === 0 && !loading && (
        <div style={{ padding: 8, color: COLOR_TEXT_MUTED, fontSize: 12 }}>No commits</div>
      )}

      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const idx = virtualItem.index;
          const commit = commits[idx];
          const info = laneData[idx];
          const isExpanded = expandedSha === commit.id;
          const details = detailsCache.get(commit.id);
          const isLoadingDetails = detailsLoading.has(commit.id);
          const parentSha = commit.parents[0] ?? '';
          const subject = commit.message.split('\n')[0] ?? commit.message;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TreeRow
                commit={commit}
                subject={subject}
                info={info}
                graphWidth={graphWidth}
                activeLanes={activeLanesData[idx] ?? EMPTY_ACTIVE_LANES}
                isExpanded={isExpanded}
                details={details}
                isLoadingDetails={isLoadingDetails}
                detailsError={detailsErrors.get(commit.id) ?? null}
                parentSha={parentSha}
                onToggle={onToggleExpand}
                onOpenCommitDiff={onOpenCommitDiff}
                onRetryDetails={onRetryDetails}
              />
            </div>
          );
        })}
      </div>

      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && <div style={{ padding: 8, color: COLOR_TEXT_MUTED, fontSize: 12 }}>Loading…</div>}
    </div>
  );
}
