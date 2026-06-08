import type { JSX } from 'react';
import { useState, useEffect, useRef } from 'react';
import '@vscode/codicons/dist/codicon.css';
import { useFileContentSearch } from '../hooks/useFileContentSearch';
import { sendRequest } from '../lib/send-request';
import type { FileSearchReplaceResponse } from '@ymir/shared';
import { SearchResults } from './SearchResults';
import {
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_BORDER,
  COLOR_ERROR,
  COLOR_SEARCH_INPUT_BORDER,
  COLOR_SEARCH_INPUT_FOCUS_BORDER,
  COLOR_SEARCH_TOGGLE_ACTIVE_BG,
  COLOR_BG_SECONDARY,
} from '../lib/theme';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchPanelProps {
  workspaceId: string | null;
  workspaceCwd?: string;
  onFileSelect: (path: string) => void;
  onResultClick: (filePath: string, lineNumber: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchPanel(props: SearchPanelProps): JSX.Element {
  const { workspaceId, onFileSelect, onResultClick } = props;

  // State
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [includePattern, setIncludePattern] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);

  // Search hook
  const {
    results,
    isSearching,
    isComplete,
    totalMatches,
    fileCount,
    truncated,
    error,
    search,
    clearResults,
  } = useFileContentSearch(workspaceId);

  // Debounce query
  useEffect(() => {
    const delay = query === '' ? 0 : 300;
    const timer = setTimeout(() => setDebouncedQuery(query), delay);
    return () => clearTimeout(timer);
  }, [query]);

  // Trigger search when debounced query or options change
  useEffect(() => {
    if (debouncedQuery) {
      search(debouncedQuery, {
        caseSensitive,
        wholeWord,
        useRegex,
        includePattern: includePattern || undefined,
      });
    }
  }, [debouncedQuery, caseSensitive, wholeWord, useRegex, includePattern, search]);

  // Ref for the find input
  const findInputRef = useRef<HTMLInputElement>(null);

  // Toggle button helper
  const toggleStyle = (active: boolean): React.CSSProperties => ({
    background: active ? COLOR_SEARCH_TOGGLE_ACTIVE_BG : 'transparent',
    color: active ? COLOR_TEXT : COLOR_TEXT_MUTED,
    border: 'none',
    padding: '2px 4px',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
  });

  // No workspace
  if (!workspaceId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }}>No workspace selected</span>
      </div>
    );
  }

  return (
    <>
      <style>{`
        [data-testid='search-panel'] input:focus-visible {
          outline: 2px solid var(--accent, #007acc) !important;
          outline-offset: 1px;
        }
        [data-testid='search-panel'] button:focus-visible {
          outline: 2px solid var(--accent, #007acc) !important;
          outline-offset: 1px;
        }
      `}</style>
      <div
        data-testid="search-panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden',
          background: COLOR_BG_SECONDARY,
        }}
      >
        {/* Find input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 8px 2px',
            borderBottom: `1px solid ${COLOR_BORDER}`,
          }}
        >
          <input
            ref={findInputRef}
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              if (val === '') {
                clearResults();
              }
            }}
            placeholder="Search"
            aria-label="Search"
            style={{
              flex: 1,
              height: 22,
              background: 'transparent',
              border: `1px solid ${COLOR_SEARCH_INPUT_BORDER}`,
              color: COLOR_TEXT,
              fontSize: 13,
              padding: '0 4px',
              borderRadius: 2,
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = COLOR_SEARCH_INPUT_FOCUS_BORDER;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = COLOR_SEARCH_INPUT_BORDER;
            }}
          />
          <button
            onClick={() => setShowReplace((prev) => !prev)}
            style={{
              background: 'transparent',
              border: 'none',
              color: showReplace ? COLOR_TEXT : COLOR_TEXT_MUTED,
              cursor: 'pointer',
              padding: '2px 4px',
              fontSize: 14,
              lineHeight: 1,
              borderRadius: 3,
            }}
            title="Toggle Replace"
          >
            <span className="codicon codicon-replace" />
          </button>
        </div>

        {/* Options row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '2px 8px 4px',
          }}
        >
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            style={toggleStyle(caseSensitive)}
            title="Match Case"
            aria-pressed={caseSensitive}
          >
            <span className="codicon codicon-case-sensitive" />
          </button>
          <button
            onClick={() => setWholeWord((v) => !v)}
            style={toggleStyle(wholeWord)}
            title="Match Whole Word"
            aria-pressed={wholeWord}
          >
            <span className="codicon codicon-whole-word" />
          </button>
          <button
            onClick={() => setUseRegex((v) => !v)}
            style={toggleStyle(useRegex)}
            title="Use Regular Expression"
            aria-pressed={useRegex}
          >
            <span className="codicon codicon-regex" />
          </button>
          <input
            value={includePattern}
            onChange={(e) => setIncludePattern(e.target.value)}
            placeholder="files to include"
            aria-label="Files to include"
            style={{
              width: 120,
              height: 20,
              background: 'transparent',
              border: `1px solid ${COLOR_SEARCH_INPUT_BORDER}`,
              color: COLOR_TEXT,
              fontSize: 11,
              padding: '0 4px',
              borderRadius: 2,
              outline: 'none',
              marginLeft: 4,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = COLOR_SEARCH_INPUT_FOCUS_BORDER;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = COLOR_SEARCH_INPUT_BORDER;
            }}
          />
        </div>

        {/* Replace row */}
        {showReplace && (
          <div style={{ padding: '0 8px 4px', display: 'flex', gap: 4 }}>
            <input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace"
              aria-label="Replace"
              style={{
                flex: 1,
                height: 22,
                background: 'transparent',
                border: `1px solid ${COLOR_SEARCH_INPUT_BORDER}`,
                color: COLOR_TEXT,
                fontSize: 13,
                padding: '0 4px',
                borderRadius: 2,
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = COLOR_SEARCH_INPUT_FOCUS_BORDER;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = COLOR_SEARCH_INPUT_BORDER;
              }}
            />
            <button
              onClick={async () => {
                if (!workspaceId || !debouncedQuery) return;
                setIsReplacing(true);
                try {
                  await sendRequest<FileSearchReplaceResponse>('file.search.replace', {
                    workspaceId,
                    query: debouncedQuery,
                    replacement: replaceText,
                    caseSensitive,
                    wholeWord,
                    useRegex,
                    includePattern: includePattern || undefined,
                  });
                  // Re-trigger search to show updated results
                  search(debouncedQuery, {
                    caseSensitive,
                    wholeWord,
                    useRegex,
                    includePattern: includePattern || undefined,
                  });
                } catch {
                  // Error handled by search hook
                } finally {
                  setIsReplacing(false);
                }
              }}
              disabled={isReplacing || !debouncedQuery}
              style={{
                background: COLOR_SEARCH_TOGGLE_ACTIVE_BG,
                border: 'none',
                color: COLOR_TEXT,
                padding: '2px 8px',
                borderRadius: 3,
                cursor: isReplacing ? 'not-allowed' : 'pointer',
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              {isReplacing ? 'Replacing...' : 'Replace All'}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ color: COLOR_ERROR, padding: '8px 12px', fontSize: 12 }}>{error}</div>
        )}

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SearchResults
            results={results}
            totalMatches={totalMatches}
            fileCount={fileCount}
            truncated={truncated}
            isSearching={isSearching}
            isComplete={isComplete}
            replaceText={showReplace ? replaceText : undefined}
            onFileClick={onFileSelect}
            onResultClick={onResultClick}
          />
        </div>
      </div>
    </>
  );
}
