import { useState } from 'react';
import type { JSX } from 'react';
import { COLOR_GIT_BADGE_BG, COLOR_GIT_BADGE_TEXT, COLOR_GIT_SECTION_HEADER } from '../lib/theme';

interface CollapsibleSectionProps {
  title: React.ReactNode;
  count?: number;
  defaultExpanded?: boolean;
  renderActions?: () => React.ReactNode;
  testId?: string;
  children: React.ReactNode;
}

export function CollapsibleSection(props: CollapsibleSectionProps): JSX.Element {
  const { title, count, defaultExpanded, renderActions, testId, children } = props;
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);

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
          {count !== undefined && count > 0 && (
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
          {renderActions?.()}
        </div>
      </div>
      {expanded && children}
    </div>
  );
}
