import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  COLOR_COMMANDBAR_BG,
  COLOR_COMMANDBAR_BORDER,
  COLOR_COMMANDBAR_ACTIVE_BORDER,
  COLOR_COMMANDBAR_SELECTED_BG,
  COLOR_BG_SECONDARY,
  COLOR_TEXT_BRIGHT,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_DIM,
} from '../lib/theme';
import { useFileSearch } from '../hooks/useFileSearch';
import { searchCommands } from '../lib/commands';

interface CommandBarProps {
  workspaceId: string | null;
  workspaceName?: string;
  onFileSelect: (path: string) => void;
}

export function CommandBar({ workspaceId, workspaceName, onFileSelect }: CommandBarProps) {
  const [isActive, setIsActive] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { query, setQuery: originalSetQuery, results } = useFileSearch(workspaceId);

  const setQuery = useCallback(
    (value: string) => {
      originalSetQuery(value);
      setSelectedIndex(0);
    },
    [originalSetQuery],
  );

  const isCommandMode = query.startsWith('/');

  const commandResults = useMemo(() => {
    if (!isCommandMode) return [];
    const commandQuery = query.slice(1);
    return searchCommands(commandQuery);
  }, [query, isCommandMode]);

  const displayResults = isCommandMode ? commandResults : results;
  const resultCount = displayResults.length;

  // Scroll selected item into view
  useEffect(() => {
    if (!isActive || resultCount === 0) return;
    const dropdown = dropdownRef.current;
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('[data-testid="command-bar-item"]');
    const selected = items[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, isActive, resultCount]);

  const deactivate = useCallback(() => {
    setIsActive(false);
    setQuery('');
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [setQuery]);

  const selectItem = useCallback(
    (index: number) => {
      if (isCommandMode) {
        const cmd = commandResults[index];
        cmd?.execute?.();
      } else {
        const file = results[index];
        if (file) onFileSelect(file.path);
      }
      deactivate();
    },
    [isCommandMode, commandResults, results, onFileSelect, deactivate],
  );

  // Keyboard shortcut: Ctrl+K / Cmd+K to activate
  useEffect(() => {
    if (isActive) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsActive(true);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  // Click outside to deactivate
  useEffect(() => {
    if (!isActive) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        deactivate();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isActive, deactivate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, resultCount - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (resultCount > 0) selectItem(selectedIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        deactivate();
      }
    },
    [resultCount, selectedIndex, selectItem, deactivate],
  );

  // ── Inactive state ──────────────────────────────────────────────────────

  if (!isActive) {
    return (
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        data-testid="command-bar-trigger"
        onClick={() => setIsActive(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsActive(true);
          }
        }}
        style={{
          width: '33vw',
          maxWidth: '500px',
          height: '28px',
          borderRadius: '4px',
          background: COLOR_COMMANDBAR_BG,
          border: `1px solid ${COLOR_COMMANDBAR_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ color: COLOR_TEXT_DIM, fontSize: '12px' }}>
          {workspaceName ?? 'No workspace'}
        </span>
      </div>
    );
  }

  // ── Active state ────────────────────────────────────────────────────────

  const showDropdown = !!query;

  return (
    <div
      ref={containerRef}
      style={{
        width: '33vw',
        maxWidth: '500px',
        height: '28px',
        position: 'relative',
      }}
    >
      <input
        ref={inputRef}
        data-testid="command-bar-input"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="command-bar-listbox"
        aria-activedescendant={resultCount > 0 ? `command-bar-item-${selectedIndex}` : undefined}
        aria-label="Search files and commands"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search files by name... (/ for commands)"
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          background: 'transparent',
          border: `1px solid ${COLOR_COMMANDBAR_ACTIVE_BORDER}`,
          outline: 'none',
          color: COLOR_TEXT_BRIGHT,
          fontSize: '13px',
          padding: '0 8px',
          borderRadius: '4px',
        }}
      />

      {showDropdown && (
        <div
          ref={dropdownRef}
          data-testid="command-bar-dropdown"
          role="listbox"
          id="command-bar-listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: '300px',
            overflowY: 'auto',
            background: COLOR_BG_SECONDARY,
            border: `1px solid ${COLOR_COMMANDBAR_BORDER}`,
            borderRadius: '0 0 4px 4px',
            zIndex: 1001,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {isCommandMode ? (
            commandResults.length > 0 ? (
              commandResults.map((cmd, i) => (
                <div
                  key={cmd.id}
                  data-testid="command-bar-item"
                  role="option"
                  aria-selected={i === selectedIndex}
                  id={`command-bar-item-${i}`}
                  onClick={() => selectItem(i)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  style={{
                    padding: '6px 12px',
                    cursor: 'pointer',
                    background: i === selectedIndex ? COLOR_COMMANDBAR_SELECTED_BG : undefined,
                  }}
                >
                  <div style={{ color: COLOR_TEXT_BRIGHT, fontSize: '13px' }}>{cmd.label}</div>
                  {cmd.description && (
                    <div style={{ color: COLOR_TEXT_MUTED, fontSize: '11px' }}>
                      {cmd.description}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div
                data-testid="command-bar-item"
                style={{ padding: '6px 12px', color: COLOR_TEXT_MUTED, fontSize: '13px' }}
              >
                No commands found
              </div>
            )
          ) : results.length > 0 ? (
            results.map((result, i) => (
              <div
                key={result.path}
                data-testid="command-bar-item"
                role="option"
                aria-selected={i === selectedIndex}
                id={`command-bar-item-${i}`}
                onClick={() => selectItem(i)}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: i === selectedIndex ? COLOR_COMMANDBAR_SELECTED_BG : undefined,
                }}
              >
                <div style={{ color: COLOR_TEXT_BRIGHT, fontSize: '13px', fontWeight: 500 }}>
                  {result.filename}
                </div>
                <div style={{ color: COLOR_TEXT_MUTED, fontSize: '11px' }}>{result.directory}</div>
              </div>
            ))
          ) : (
            <div style={{ padding: '6px 12px', color: COLOR_TEXT_MUTED, fontSize: '13px' }}>
              No files found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
