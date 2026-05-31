import '@vscode/codicons/dist/codicon.css';
import { useState } from 'react';
import {
  COLOR_DIFF_HEADER_BG,
  COLOR_DIFF_HEADER_BORDER,
  COLOR_DIFF_ADDITIONS,
  COLOR_DIFF_DELETIONS,
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_DIFF_TOGGLE_ACTIVE_BG,
  COLOR_BORDER,
  TITLE_BAR_HEIGHT,
} from '../lib/theme';

export type DiffViewMode = 'changes' | 'inline';

export interface DiffViewerHeaderProps {
  fileName: string;
  additions: number;
  deletions: number;
  mode: DiffViewMode;
  onModeChange: (mode: DiffViewMode) => void;
  onOpenEditor: () => void;
  commitSha?: string;
}

const btnStyle: React.CSSProperties = {
  border: 'none',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: '3px',
  fontSize: '14px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
};

export function DiffViewerHeader({
  fileName,
  additions,
  deletions,
  mode,
  onModeChange,
  onOpenEditor,
  commitSha,
}: DiffViewerHeaderProps) {
  const [hoverEditorBtn, setHoverEditorBtn] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: TITLE_BAR_HEIGHT + 'px',
        padding: '0 8px',
        background: COLOR_DIFF_HEADER_BG,
        borderBottom: `1px solid ${COLOR_DIFF_HEADER_BORDER}`,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Left side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            color: COLOR_TEXT,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '300px',
          }}
        >
          {commitSha ? `${fileName} @ ${commitSha.slice(0, 7)}` : fileName}
        </span>
        <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
          <span style={{ color: COLOR_DIFF_ADDITIONS }}>+{additions}</span>{' '}
          <span style={{ color: COLOR_DIFF_DELETIONS }}>-{deletions}</span>
        </span>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          data-testid="diff-toggle-changes"
          title="Changes only"
          onClick={() => onModeChange('changes')}
          style={{
            ...btnStyle,
            background: mode === 'changes' ? COLOR_DIFF_TOGGLE_ACTIVE_BG : 'transparent',
            color: mode === 'changes' ? COLOR_TEXT : COLOR_TEXT_MUTED,
          }}
        >
          <span className="codicon codicon-diff" />
        </button>
        <button
          data-testid="diff-toggle-inline"
          title="Inline diff"
          onClick={() => onModeChange('inline')}
          style={{
            ...btnStyle,
            background: mode === 'inline' ? COLOR_DIFF_TOGGLE_ACTIVE_BG : 'transparent',
            color: mode === 'inline' ? COLOR_TEXT : COLOR_TEXT_MUTED,
          }}
        >
          <span className="codicon codicon-file" />
        </button>

        {/* Separator */}
        <span style={{ width: 1, height: 16, background: COLOR_BORDER, margin: '0 4px' }} />

        <button
          data-testid="diff-open-editor"
          title="Open in Editor"
          onClick={onOpenEditor}
          onMouseEnter={() => setHoverEditorBtn(true)}
          onMouseLeave={() => setHoverEditorBtn(false)}
          style={{
            ...btnStyle,
            color: COLOR_TEXT_MUTED,
            background: hoverEditorBtn ? 'rgba(255,255,255,0.06)' : 'transparent',
          }}
        >
          <span className="codicon codicon-go-to-file" />
        </button>
      </div>
    </div>
  );
}
