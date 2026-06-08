import type { JSX } from 'react';
import { useState } from 'react';
import type { FileSearchFileResult } from '@ymir/shared';
import '@vscode/codicons/dist/codicon.css';
import { CollapsibleSection } from './CollapsibleSection';
import { SearchResultLine } from './SearchResultLine';
import {
  COLOR_TEXT_DIM,
  COLOR_TEXT_MUTED,
  COLOR_ERROR,
  COLOR_SEARCH_STATUS_TEXT,
  COLOR_SEARCH_RESULT_HOVER_BG,
  FONT_SIZE_CONTENT,
} from '../lib/theme';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchResultsProps {
  results: FileSearchFileResult[];
  totalMatches: number;
  fileCount: number;
  truncated: boolean;
  isSearching: boolean;
  isComplete: boolean;
  replaceText?: string;
  onFileClick: (filePath: string) => void;
  onResultClick: (filePath: string, lineNumber: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchResults(props: SearchResultsProps): JSX.Element | null {
  const { results, isSearching, isComplete, replaceText, onFileClick, onResultClick } = props;

  // Empty state: no results and not searching
  if (results.length === 0 && !isSearching) {
    if (isComplete) {
      return (
        <div
          style={{
            padding: 12,
            color: COLOR_TEXT_MUTED,
            fontSize: FONT_SIZE_CONTENT,
            textAlign: 'center',
          }}
        >
          No results found. Try adjusting your search terms or filters.
        </div>
      );
    }
    return null;
  }

  return (
    <div
      data-testid="search-results"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'auto',
        fontSize: FONT_SIZE_CONTENT,
      }}
    >
      {/* Status bar */}
      {(isSearching || results.length > 0) && <StatusBar {...props} />}

      {/* File groups */}
      {results.map((file) => (
        <FileGroup
          key={file.path}
          file={file}
          replaceText={replaceText}
          onFileClick={onFileClick}
          onResultClick={onResultClick}
        />
      ))}

      {/* Searching indicator when results are still coming */}
      {isSearching && results.length > 0 && (
        <div style={{ padding: '4px 12px', fontSize: 11, color: COLOR_SEARCH_STATUS_TEXT }}>
          Searching...
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

function StatusBar({
  totalMatches,
  fileCount,
  truncated,
  isSearching,
  results,
}: SearchResultsProps): JSX.Element {
  if (isSearching && results.length === 0) {
    return (
      <div style={{ padding: '4px 12px', fontSize: 11, color: COLOR_SEARCH_STATUS_TEXT }}>
        Searching...
      </div>
    );
  }

  if (results.length > 0) {
    return (
      <div style={{ padding: '4px 12px', fontSize: 11, color: COLOR_SEARCH_STATUS_TEXT }}>
        {totalMatches} results in {fileCount} files
        {truncated && <span style={{ color: COLOR_ERROR }}> (results limited)</span>}
        {isSearching && '...'}
      </div>
    );
  }

  return <></>;
}

// ---------------------------------------------------------------------------
// FileGroup
// ---------------------------------------------------------------------------

function FileGroup({
  file,
  replaceText,
  onFileClick,
  onResultClick,
}: {
  file: FileSearchFileResult;
  replaceText?: string;
  onFileClick: (filePath: string) => void;
  onResultClick: (filePath: string, lineNumber: number) => void;
}): JSX.Element {
  // Parse relativePath into directory and filename
  const lastSlash = file.relativePath.lastIndexOf('/');
  const fileName = lastSlash >= 0 ? file.relativePath.slice(lastSlash + 1) : file.relativePath;
  const dirPath = lastSlash >= 0 ? file.relativePath.slice(0, lastSlash + 1) : '';

  const matchCount = file.matches.length;

  return (
    <CollapsibleSection
      title={
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={(e) => {
            e.stopPropagation();
            onFileClick(file.path);
          }}
        >
          <span className="codicon codicon-file" style={{ fontSize: 12 }} />
          <span style={{ fontWeight: 'bold', cursor: 'pointer' }}>{fileName}</span>
          {dirPath && <span style={{ color: COLOR_TEXT_DIM }}>{dirPath}</span>}
        </span>
      }
      count={matchCount}
      defaultExpanded={true}
      headerPadding="2px 8px"
    >
      {file.matches.map((match) => (
        <ResultLine
          key={`${file.path}:${match.lineNumber}`}
          filePath={file.path}
          match={match}
          replaceText={replaceText}
          onResultClick={onResultClick}
        />
      ))}
    </CollapsibleSection>
  );
}

// ---------------------------------------------------------------------------
// ResultLine
// ---------------------------------------------------------------------------

function ResultLine({
  filePath,
  match,
  replaceText,
  onResultClick,
}: {
  filePath: string;
  match: {
    lineNumber: number;
    lineText: string;
    submatches: { matchText: string; start: number; end: number }[];
  };
  replaceText?: string;
  onResultClick: (filePath: string, lineNumber: number) => void;
}): JSX.Element {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      style={{
        cursor: 'pointer',
        padding: '2px 8px 2px 8px',
        display: 'flex',
        alignItems: 'center',
        background: hovered ? COLOR_SEARCH_RESULT_HOVER_BG : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onResultClick(filePath, match.lineNumber)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onResultClick(filePath, match.lineNumber);
        }
      }}
    >
      <span
        style={{
          color: COLOR_TEXT_DIM,
          minWidth: '3ch',
          textAlign: 'right',
          marginRight: '8px',
          fontSize: '11px',
          userSelect: 'none',
        }}
      >
        {match.lineNumber}
      </span>
      <SearchResultLine
        lineText={match.lineText}
        submatches={match.submatches}
        replaceText={replaceText}
      />
    </div>
  );
}
