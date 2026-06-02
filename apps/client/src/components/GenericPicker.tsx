import { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog } from './Dialog';
import { inputStyle } from '../lib/dialog-styles';
import { COLOR_TEXT, COLOR_TEXT_MUTED, COLOR_HOVER_BG } from '../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PickerItem {
  id: string;
  label: string;
  description?: string;
}

export interface GenericPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: PickerItem) => void;
  title: string;
  placeholder?: string;
  items: PickerItem[];
  emptyMessage?: string;
  testId?: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const listContainerStyle: React.CSSProperties = {
  maxHeight: '240px',
  overflowY: 'auto',
  marginTop: '12px',
};

const itemStyle = (highlighted: boolean): React.CSSProperties => ({
  padding: '8px 12px',
  cursor: 'pointer',
  borderRadius: '6px',
  backgroundColor: highlighted ? COLOR_HOVER_BG : 'transparent',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  color: COLOR_TEXT,
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  color: COLOR_TEXT_MUTED,
};

const emptyStyle: React.CSSProperties = {
  padding: '16px 12px',
  fontSize: '14px',
  color: COLOR_TEXT_MUTED,
  textAlign: 'center',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Generic picker dialog with filter input and keyboard-navigable list.
 *
 * Features:
 * - Case-insensitive substring filtering on label + description
 * - ArrowUp / ArrowDown keyboard navigation
 * - Enter selects highlighted item
 * - Escape closes (handled by Dialog shell)
 * - Auto-focus input on open
 * - Empty message when no items match
 */
export function GenericPicker({
  open,
  onClose,
  onSelect,
  title,
  placeholder = 'Filter...',
  items,
  emptyMessage = 'No items found.',
  testId = 'generic-picker',
}: GenericPickerProps) {
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightedIndex(0);
    }
  }, [open]);

  // Auto-focus input when dialog opens
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Filter items (case-insensitive substring match on label + description)
  const filtered = query
    ? items.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.label.toLowerCase().includes(q) ||
          (item.description?.toLowerCase().includes(q) ?? false)
        );
      })
    : items;

  // Keep highlighted index in bounds when filtered list changes
  useEffect(() => {
    setHighlightedIndex((prev) => {
      if (filtered.length === 0) return 0;
      return Math.min(prev, filtered.length - 1);
    });
  }, [filtered.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const highlighted = listRef.current.querySelector('[data-highlighted="true"]');
    highlighted?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, filtered.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered.length > 0 && highlightedIndex < filtered.length) {
          onSelect(filtered[highlightedIndex]);
        }
      }
    },
    [filtered, highlightedIndex, onSelect],
  );

  return (
    <Dialog open={open} onClose={onClose} title={title} testId={testId}>
      <input
        ref={inputRef}
        style={inputStyle}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Filter items"
      />
      <div ref={listRef} style={listContainerStyle} role="listbox">
        {filtered.length === 0 ? (
          <div style={emptyStyle}>{emptyMessage}</div>
        ) : (
          filtered.map((item, index) => (
            <div
              key={item.id}
              role="option"
              aria-selected={index === highlightedIndex}
              data-highlighted={index === highlightedIndex}
              style={itemStyle(index === highlightedIndex)}
              onClick={() => onSelect(item)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span style={labelStyle}>{item.label}</span>
              {item.description && <span style={descriptionStyle}>{item.description}</span>}
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
}
