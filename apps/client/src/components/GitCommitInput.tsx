import { useState, useRef, useCallback } from 'react';
import { COLOR_BG_SECONDARY, COLOR_TEXT, COLOR_BORDER } from '../lib/theme';

interface GitCommitInputProps {
  onCommit: (message: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function GitCommitInput({
  onCommit,
  disabled = false,
  loading = false,
}: GitCommitInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 4 * 22) + 'px';
    }
  }, []);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 4 * 22) + 'px';
  }, []);

  const handleCommit = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || disabled || loading) return;
    onCommit(trimmed);
    setMessage('');
    if (textareaRef.current) {
      textareaRef.current.value = '';
      resetHeight();
    }
  }, [message, disabled, loading, onCommit, resetHeight]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit],
  );

  const commitDisabled = loading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 8px' }}>
      <textarea
        ref={textareaRef}
        rows={1}
        value={message}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Commit message..."
        aria-label="Commit message"
        data-testid="git-commit-input"
        disabled={commitDisabled}
        style={{
          background: COLOR_BG_SECONDARY,
          color: COLOR_TEXT,
          border: `1px solid ${COLOR_BORDER}`,
          borderRadius: '3px',
          padding: '6px 8px',
          fontSize: '13px',
          fontFamily: 'inherit',
          resize: 'none',
          outline: 'none',
        }}
      />
    </div>
  );
}
