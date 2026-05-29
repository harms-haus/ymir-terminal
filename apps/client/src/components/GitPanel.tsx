import type { GitStatusResponse, GitFileChange } from '@ymir/shared';

interface GitPanelProps {
  gitStatus: GitStatusResponse | null;
}

const STATUS_COLORS: Record<string, string> = {
  M: '#e2c08d',
  A: '#73c991',
  D: '#c74e39',
  R: '#73c991',
  C: '#73c991',
  '?': '#888',
};

export function GitPanel({ gitStatus }: GitPanelProps) {
  if (!gitStatus)
    return (
      <div data-testid="git-panel" style={{ padding: '8px', color: '#666', fontSize: '12px' }}>
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
        <span style={{ color: '#007acc' }}>⎇</span>
        <span data-testid="git-branch">{gitStatus.branch}</span>
      </div>

      {gitStatus.staged.length > 0 && (
        <div data-testid="git-staged" style={{ marginBottom: '8px' }}>
          <div style={{ color: '#888', marginBottom: '4px' }}>Staged Changes</div>
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
                  color: STATUS_COLORS[f.status] || '#888',
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
          <div style={{ color: '#888', marginBottom: '4px' }}>Changes</div>
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
                  color: STATUS_COLORS[f.status] || '#888',
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
        <div style={{ color: '#666' }}>No changes</div>
      )}
    </div>
  );
}
