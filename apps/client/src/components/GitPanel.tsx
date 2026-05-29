import type { GitStatusResponse, GitFileChange } from '@ymir/shared';
import { COLOR_ACCENT, COLOR_TEXT_DIM, COLOR_TEXT_MUTED, GIT_STATUS_COLORS } from '../lib/theme';

interface GitPanelProps {
  gitStatus: GitStatusResponse | null;
}

export function GitPanel({ gitStatus }: GitPanelProps) {
  if (!gitStatus)
    return (
      <div
        data-testid="git-panel"
        style={{ padding: '8px', color: COLOR_TEXT_DIM, fontSize: '12px' }}
      >
        Not a git repository
      </div>
    );

  return (
    <div data-testid="git-panel" style={{ padding: '8px', fontSize: '12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginBottom: '8px',
        }}
      >
        <span style={{ color: COLOR_ACCENT }}>⎇</span>
        <span data-testid="git-branch">{gitStatus.branch}</span>
      </div>

      {gitStatus.staged.length > 0 && (
        <div data-testid="git-staged" style={{ marginBottom: '8px' }}>
          <div style={{ color: COLOR_TEXT_MUTED, marginBottom: '4px' }}>Staged Changes</div>
          {gitStatus.staged.map((f: GitFileChange, i: number) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 0',
              }}
            >
              <span
                style={{
                  color: GIT_STATUS_COLORS[f.status] || COLOR_TEXT_MUTED,
                  width: '16px',
                }}
              >
                {f.status}
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.path}
              </span>
            </div>
          ))}
        </div>
      )}

      {gitStatus.changes.length > 0 && (
        <div data-testid="git-changes">
          <div style={{ color: COLOR_TEXT_MUTED, marginBottom: '4px' }}>Changes</div>
          {gitStatus.changes.map((f: GitFileChange, i: number) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 0',
              }}
            >
              <span
                style={{
                  color: GIT_STATUS_COLORS[f.status] || COLOR_TEXT_MUTED,
                  width: '16px',
                }}
              >
                {f.status}
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.path}
              </span>
            </div>
          ))}
        </div>
      )}

      {gitStatus.changes.length === 0 && gitStatus.staged.length === 0 && (
        <div style={{ color: COLOR_TEXT_DIM }}>No changes</div>
      )}
    </div>
  );
}
