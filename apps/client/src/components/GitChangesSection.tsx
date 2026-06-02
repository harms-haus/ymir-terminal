import { useState } from 'react';
import type { GitFileChange } from '@ymir/shared';
import { GitChangeTree } from './GitChangeTree';
import { useConfirm } from '../hooks/useDialog';
import {
  COLOR_TEXT_MUTED,
  COLOR_GIT_SECTION_HEADER,
  COLOR_GIT_BADGE_BG,
  COLOR_GIT_BADGE_TEXT,
  COLOR_ERROR,
} from '../lib/theme';

interface GitChangesSectionProps {
  staged: GitFileChange[];
  changes: GitFileChange[];
  repoPath: string;
  onStageFiles: (repoPath: string, files: string[]) => void;
  onUnstageFiles: (repoPath: string, files: string[]) => void;
  onDiscardFiles: (repoPath: string, files: string[]) => void;
  onOpenEditor?: (filePath: string) => void;
  onOpenDiff?: (filePath: string, staged: boolean) => void;
}

export function GitChangesSection({
  staged,
  changes,
  repoPath,
  onStageFiles,
  onUnstageFiles,
  onDiscardFiles,
  onOpenEditor,
  onOpenDiff,
}: GitChangesSectionProps) {
  const confirm = useConfirm();

  return (
    <div
      data-testid="git-changes-section"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}
    >
      <CollapsibleSection
        title="Staged Changes"
        count={staged.length}
        testId="git-staged-section"
        renderActions={() =>
          staged.length > 0 ? (
            <button
              data-testid="git-unstage-all-button"
              onClick={() =>
                onUnstageFiles(
                  repoPath,
                  staged.map((f) => f.path),
                )
              }
              style={{
                background: 'transparent',
                color: COLOR_TEXT_MUTED,
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Unstage All
            </button>
          ) : null
        }
      >
        <GitChangeTree
          changes={staged}
          isStagedSection={true}
          onUnstageFile={(path) => onUnstageFiles(repoPath, [path])}
          onUnstageDirectory={(path) => onUnstageFiles(repoPath, [path])}
          onOpenEditor={onOpenEditor}
          onOpenDiff={onOpenDiff ? (fp) => onOpenDiff(fp, true) : undefined}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Changes"
        count={changes.length}
        testId="git-unstaged-section"
        renderActions={() =>
          changes.length > 0 ? (
            <>
              <button
                onClick={async () => {
                  const ok = await confirm({ title: 'Discard All Changes', message: 'Discard all unstaged changes? This cannot be undone.', confirmLabel: 'Discard All', danger: true });
                  if (!ok) return;
                  onDiscardFiles(
                    repoPath,
                    changes.map((f) => f.path),
                  );
                }}
                style={{
                  background: 'transparent',
                  color: COLOR_ERROR,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                Discard All
              </button>
              <button
                onClick={() =>
                  onStageFiles(
                    repoPath,
                    changes.map((f) => f.path),
                  )
                }
                style={{
                  background: 'transparent',
                  color: COLOR_TEXT_MUTED,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                Stage All
              </button>
            </>
          ) : null
        }
      >
        <GitChangeTree
          changes={changes}
          isStagedSection={false}
          onStageFile={(path) => onStageFiles(repoPath, [path])}
          onStageDirectory={(path) => onStageFiles(repoPath, [path])}
          onDiscardFile={(path) => onDiscardFiles(repoPath, [path])}
          onOpenEditor={onOpenEditor}
          onOpenDiff={onOpenDiff ? (fp) => onOpenDiff(fp, false) : undefined}
        />
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  children,
  renderActions,
  testId,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  renderActions: () => React.ReactNode;
  testId: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div data-testid={testId}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          // No border or special background for collapsible section headers
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            color: COLOR_GIT_SECTION_HEADER,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          <span style={{ fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
          {title}
          {count > 0 && (
            <span
              style={{
                background: COLOR_GIT_BADGE_BG,
                color: COLOR_GIT_BADGE_TEXT,
                borderRadius: 8,
                padding: '0 6px',
                fontSize: 11,
              }}
            >
              {count}
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
          {renderActions()}
        </div>
      </div>
      {expanded && children}
    </div>
  );
}
