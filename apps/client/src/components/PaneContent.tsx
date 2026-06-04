import type { Tab } from '../hooks/useTabs';
import { DiffViewer } from './DiffViewer';
import { EditorPane } from './EditorPane';
import { GitTreeTab } from './git-tree';
import { COLOR_BG_PRIMARY, COLOR_TEXT_DIM } from '../lib/theme';

export interface PaneContentProps {
  activeTab: Tab | undefined;
  terminalContainerRef?: React.Ref<HTMLDivElement>;
  workspaceId: string | null;
  commitToHighlight?: { commitSha?: string; repoPath: string } | null;
  onDirtyChange: (filePath: string, dirty: boolean) => void;
  onOpenEditor: (filePath: string) => void;
  onOpenCommitDiff: (
    commitSha: string,
    parentSha: string,
    filePath: string,
    repoPath: string,
  ) => void;
  emptyState?: React.ReactNode;
}

const DEFAULT_EMPTY_STATE = (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      color: COLOR_TEXT_DIM,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: COLOR_BG_PRIMARY,
    }}
  >
    No tabs open
  </div>
);

export function PaneContent({
  activeTab,
  terminalContainerRef,
  workspaceId,
  commitToHighlight,
  onDirtyChange,
  onOpenEditor,
  onOpenCommitDiff,
  emptyState,
}: PaneContentProps) {
  return (
    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      {/* TerminalManager portals terminals into this container */}
      <div
        ref={terminalContainerRef}
        data-testid="terminal-container"
        style={{ height: '100%', pointerEvents: 'none' }}
      />
      {activeTab?.type === 'editor' && activeTab.filePath && workspaceId && (
        <div style={{ position: 'absolute', inset: 0, background: COLOR_BG_PRIMARY }}>
          <EditorPane
            key={activeTab.filePath}
            workspaceId={workspaceId}
            filePath={activeTab.filePath}
            onDirtyChange={onDirtyChange}
          />
        </div>
      )}
      {activeTab?.type === 'diff' &&
        activeTab.filePath &&
        workspaceId &&
        activeTab.diffRepoPath && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: COLOR_BG_PRIMARY,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <DiffViewer
              key={`${activeTab.filePath}-${activeTab.diffRef}`}
              workspaceId={workspaceId}
              repoPath={activeTab.diffRepoPath}
              filePath={activeTab.filePath}
              staged={activeTab.diffRef === 'staged'}
              onOpenEditor={onOpenEditor}
              commitSha={activeTab.diffRef === 'commit' ? activeTab.commitSha : undefined}
              parentSha={activeTab.diffRef === 'commit' ? activeTab.parentSha : undefined}
            />
          </div>
        )}
      {activeTab?.type === 'git-tree' && activeTab.repoPath != null && workspaceId && (
        <div style={{ position: 'absolute', inset: 0, background: COLOR_BG_PRIMARY }}>
          <GitTreeTab
            workspaceId={workspaceId}
            repoPath={activeTab.repoPath}
            highlightCommitSha={commitToHighlight?.commitSha ?? null}
            onOpenCommitDiff={(commitSha, parentSha, filePath) =>
              onOpenCommitDiff(commitSha, parentSha, filePath, activeTab.repoPath!)
            }
          />
        </div>
      )}
      {!activeTab && (emptyState ?? DEFAULT_EMPTY_STATE)}
    </div>
  );
}
