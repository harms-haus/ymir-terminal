import { useCallback, useRef } from 'react';
import { COLOR_TEXT, COLOR_TEXT_MUTED, COLOR_BORDER } from '../../lib/theme';

// ── GitCommitFilter ─────────────────────────────────────────────────────────

interface GitCommitFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function GitCommitFilter({ value, onChange }: GitCommitFilterProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onChange('');
        inputRef.current?.blur();
      }
    },
    [onChange],
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderBottom: `1px solid ${COLOR_BORDER}`,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontSize: 12,
          color: COLOR_TEXT_MUTED,
          marginRight: 6,
          userSelect: 'none',
        }}
      >
        ⊟
      </span>
      <input
        ref={inputRef}
        type="text"
        placeholder="Filter commits…"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',

          color: COLOR_TEXT,
          fontSize: 12,
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}
