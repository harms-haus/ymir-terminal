import type { FileSearchSubmatch } from '@ymir/shared';
import type { JSX } from 'react';

import {
  COLOR_TEXT_DIM,
  COLOR_TEXT_MUTED,
  COLOR_SEARCH_MATCH_BG,
  COLOR_SEARCH_MATCH_TEXT,
  COLOR_SEARCH_REPLACE_TEXT,
  COLOR_SEARCH_STRIKETHROUGH,
} from '../lib/theme';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SearchResultLineProps {
  lineText: string;
  submatches: FileSearchSubmatch[];
  replaceText?: string;
  maxDisplayWidth?: number;
}

export interface TruncateResult {
  displayText: string;
  adjustedSubmatches: FileSearchSubmatch[];
  prefixEllipsis: boolean;
  suffixEllipsis: boolean;
}

// ---------------------------------------------------------------------------
// truncateLine
// ---------------------------------------------------------------------------

export function truncateLine(
  lineText: string,
  submatches: FileSearchSubmatch[],
  maxDisplayWidth?: number,
): TruncateResult {
  const maxWidth = maxDisplayWidth ?? 80;

  if (lineText.length <= maxWidth) {
    return {
      displayText: lineText,
      adjustedSubmatches: submatches,
      prefixEllipsis: false,
      suffixEllipsis: false,
    };
  }

  // Centre the window around the first submatch
  const center = Math.floor((submatches[0].start + submatches[0].end) / 2);
  let startIdx = Math.max(0, center - Math.floor(maxWidth / 2));
  const endIdx = Math.min(lineText.length, startIdx + maxWidth);

  // If we hit the right edge before filling the window, slide left
  if (endIdx - startIdx < maxWidth && startIdx > 0) {
    startIdx = Math.max(0, endIdx - maxWidth);
  }

  const displayText = lineText.slice(startIdx, endIdx);

  const adjustedSubmatches = submatches
    .map(
      (sm): FileSearchSubmatch => ({
        matchText: sm.matchText,
        start: Math.max(0, sm.start - startIdx),
        end: Math.min(maxWidth, sm.end - startIdx),
      }),
    )
    .filter((sm) => sm.start < sm.end && sm.end > 0);

  return {
    displayText,
    adjustedSubmatches,
    prefixEllipsis: startIdx > 0,
    suffixEllipsis: endIdx < lineText.length,
  };
}

// ---------------------------------------------------------------------------
// SearchResultLine component
// ---------------------------------------------------------------------------

export function SearchResultLine(props: SearchResultLineProps): JSX.Element {
  const { lineText, submatches, replaceText, maxDisplayWidth } = props;

  const { displayText, adjustedSubmatches, prefixEllipsis, suffixEllipsis } = truncateLine(
    lineText,
    submatches,
    maxDisplayWidth,
  );

  const isReplace = replaceText !== undefined;

  // Build segments by walking through the display text
  const children: JSX.Element[] = [];
  let cursor = 0;

  for (const sm of adjustedSubmatches) {
    const matchStart = sm.start;
    const matchEnd = sm.end;

    // Text before the match
    if (matchStart > cursor) {
      children.push(
        <span key={`pre-${cursor}`} style={{ color: COLOR_TEXT_MUTED }}>
          {displayText.slice(cursor, matchStart)}
        </span>,
      );
    }

    const matchText = displayText.slice(matchStart, matchEnd);

    if (isReplace) {
      // REPLACE mode: struck-through original + replacement
      children.push(
        <span
          key={`del-${matchStart}`}
          style={{
            color: COLOR_SEARCH_STRIKETHROUGH,
            textDecoration: 'line-through',
            background: COLOR_SEARCH_MATCH_BG,
          }}
        >
          {matchText}
        </span>,
      );
      children.push(
        <span
          key={`ins-${matchStart}`}
          style={{
            color: COLOR_SEARCH_REPLACE_TEXT,
            background: 'rgba(115, 201, 145, 0.15)',
          }}
        >
          {replaceText}
        </span>,
      );
    } else {
      // FIND mode: highlighted match
      children.push(
        <span
          key={`match-${matchStart}`}
          style={{
            background: COLOR_SEARCH_MATCH_BG,
            color: COLOR_SEARCH_MATCH_TEXT,
          }}
        >
          {matchText}
        </span>,
      );
    }

    cursor = matchEnd;
  }

  // Remaining text after the last match
  if (cursor < displayText.length) {
    children.push(
      <span key={`post-${cursor}`} style={{ color: COLOR_TEXT_MUTED }}>
        {displayText.slice(cursor)}
      </span>,
    );
  }

  return (
    <span
      style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {prefixEllipsis && <span style={{ color: COLOR_TEXT_DIM }}>...</span>}
      {children}
      {suffixEllipsis && <span style={{ color: COLOR_TEXT_DIM }}>...</span>}
    </span>
  );
}
