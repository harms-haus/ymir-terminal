import type { GitFileChange } from '@ymir/shared';
import { GitChangeTree } from './GitChangeTree';
import { CollapsibleSection } from './CollapsibleSection';
import { useConfirm } from '../hooks/useDialog';
import { COLOR_TEXT_MUTED, COLOR_ERROR } from '../lib/theme';

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
                  const ok = await confirm({
                    title: 'Discard All Changes',
                    message: 'Discard all unstaged changes? This cannot be undone.',
                    confirmLabel: 'Discard All',
                    danger: true,
                  });
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
