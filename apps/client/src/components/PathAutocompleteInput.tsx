import { useState, useEffect, useRef, useCallback, useId } from 'react';
import type { AutocompleteDirectoryEntry } from '@ymir/shared';
import { parsePathInput, usePathAutocomplete } from '../hooks/usePathAutocomplete';
import { inputStyle } from '../lib/dialog-styles';
import { COLOR_BG_CARD, COLOR_BORDER_CARD, COLOR_HOVER_BG, COLOR_TEXT_CARD } from '../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PathAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PathAutocompleteInput({
  value,
  onChange,
  disabled,
  placeholder,
  id,
}: PathAutocompleteInputProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const listboxId = useId();
  const blurTimerRef = useRef<number | null>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);

  const { queryDir, prefix } = parsePathInput(value);
  const { directories } = usePathAutocomplete(queryDir);

  const filtered = prefix
    ? directories.filter((d) => d.name.toLowerCase().startsWith(prefix.toLowerCase()))
    : directories;

  // ---------------------------------------------------------------------------
  // Accept entry
  // ---------------------------------------------------------------------------

  const acceptEntry = useCallback(
    (entry: AutocompleteDirectoryEntry) => {
      const lastSlash = value.lastIndexOf('/');
      const basePath = lastSlash >= 0 ? value.slice(0, lastSlash + 1) : '';
      onChange(basePath + entry.name + '/');
      setHighlightedIndex(-1);
    },
    [value, onChange],
  );

  // ---------------------------------------------------------------------------
  // Reset highlight when filtered list or prefix changes
  // ---------------------------------------------------------------------------

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setHighlightedIndex(-1);
    if (filtered.length === 0) {
      setIsDropdownOpen(false);
    }
  }, [filtered.length, prefix]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ---------------------------------------------------------------------------
  // Scroll highlighted option into view
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]!.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setIsDropdownOpen(true);
          setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev));
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setIsDropdownOpen(true);
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        }
        case 'Tab': {
          if (isDropdownOpen && (highlightedIndex >= 0 || filtered.length > 0)) {
            e.preventDefault();
            acceptEntry(filtered[highlightedIndex >= 0 ? highlightedIndex : 0]);
          }
          break;
        }
        case 'Enter': {
          if (isDropdownOpen && highlightedIndex >= 0) {
            e.preventDefault();
            acceptEntry(filtered[highlightedIndex]);
          }
          break;
        }
        case 'Escape': {
          if (isDropdownOpen) {
            e.preventDefault();
            setIsDropdownOpen(false);
            setHighlightedIndex(-1);
          }
          break;
        }
      }
    },
    [isDropdownOpen, highlightedIndex, filtered, acceptEntry],
  );

  // ---------------------------------------------------------------------------
  // Blur handler
  // ---------------------------------------------------------------------------

  const handleBlur = useCallback(() => {
    blurTimerRef.current = window.setTimeout(() => {
      setIsDropdownOpen(false);
      setHighlightedIndex(-1);
    }, 150);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ position: 'relative' }}>
      <input
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isDropdownOpen && filtered.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={
          highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined
        }
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (filtered.length > 0) setIsDropdownOpen(true);
        }}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        style={inputStyle}
      />
      {isDropdownOpen && filtered.length > 0 && (
        <ul
          role="listbox"
          id={listboxId}
          aria-label="Directory suggestions"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            width: '100%',
            maxHeight: '200px',
            overflowY: 'auto',
            backgroundColor: COLOR_BG_CARD,
            border: `1px solid ${COLOR_BORDER_CARD}`,
            borderRadius: '6px',
            marginTop: '2px',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            padding: 0,
            margin: 0,
            listStyle: 'none',
          }}
        >
          {filtered.map((entry, i) => (
            <li
              key={entry.name}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === highlightedIndex}
              ref={(el) => {
                optionRefs.current[i] = el;
              }}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                color: COLOR_TEXT_CARD,
                backgroundColor: i === highlightedIndex ? COLOR_HOVER_BG : 'transparent',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                clearTimeout(blurTimerRef.current ?? undefined);
                acceptEntry(entry);
              }}
              onMouseEnter={() => setHighlightedIndex(i)}
            >
              {entry.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
