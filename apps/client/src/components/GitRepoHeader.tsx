import { useState, useRef, useEffect, useCallback } from 'react';
import type { GitRepoInfo, GitBranch } from '@ymir/shared';
import { GitBranchSelector } from './GitBranchSelector';
import { toast } from 'sonner';
import {
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_BORDER,
  COLOR_GIT_REPO_HEADER_BG,
  COLOR_GIT_ACTION_BG,
  COLOR_GIT_ACTION_HOVER,
  COLOR_BG_SECONDARY,
} from '../lib/theme';

interface GitRepoHeaderProps {
  repoInfo: GitRepoInfo;
  branches: GitBranch[];
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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Click outside to close more menu
  useEffect(() => {
    if (!moreMenuOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [moreMenuOpen]);

  const toggleMoreMenu = useCallback(() => {
    setMoreMenuOpen((prev) => !prev);
  }, []);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: onToggleCollapse ? 'pointer' : undefined }} onClick={onToggleCollapse}>
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
        <div ref={moreMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            data-testid="git-more-menu"
            aria-label="More actions"
            title="More Actions"
            onClick={toggleMoreMenu}
            style={actionButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLOR_GIT_ACTION_HOVER;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLOR_GIT_ACTION_BG;
            }}
          >
            ⋯
          </button>
          {moreMenuOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                zIndex: 1000,
                background: COLOR_BG_SECONDARY,
                border: `1px solid ${COLOR_BORDER}`,
                borderRadius: 4,
                minWidth: 120,
              }}
            >
              <div
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  toast.info('Not yet implemented');
                  setMoreMenuOpen(false);
                }}
                style={{
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: COLOR_TEXT,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLOR_GIT_ACTION_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = undefined as unknown as string;
                }}
              >
                Pull
              </div>
              <div
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  toast.info('Not yet implemented');
                  setMoreMenuOpen(false);
                }}
                style={{
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: COLOR_TEXT,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLOR_GIT_ACTION_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = undefined as unknown as string;
                }}
              >
                Push
              </div>
              <div
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  toast.info('Not yet implemented');
                  setMoreMenuOpen(false);
                }}
                style={{
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: COLOR_TEXT,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLOR_GIT_ACTION_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = undefined as unknown as string;
                }}
              >
                Commit
              </div>
              <div
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  toast.info('Not yet implemented');
                  setMoreMenuOpen(false);
                }}
                style={{
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: COLOR_TEXT,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLOR_GIT_ACTION_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = undefined as unknown as string;
                }}
              >
                Branch
              </div>
              <div style={{ borderTop: `1px solid ${COLOR_BORDER}`, margin: '2px 0' }} />
              <div
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  toast.info('Not yet implemented');
                  setMoreMenuOpen(false);
                }}
                style={{
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: COLOR_TEXT,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLOR_GIT_ACTION_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = undefined as unknown as string;
                }}
              >
                Stash
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
