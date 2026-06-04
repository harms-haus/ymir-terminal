import { memo } from 'react';
import { GIT_GRAPH_COLORS } from '../../lib/theme';
import { LANE_WIDTH, GRAPH_LEFT_PADDING } from '../../lib/git-graph';
import type { LaneInfo, ActiveLane } from '../../lib/git-graph';

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ROW_HEIGHT = 24;

// ── CommitGraphRow ──────────────────────────────────────────────────────────

interface CommitGraphRowProps {
  info: LaneInfo;
  graphWidth: number;
  activeLanes: ActiveLane[];
  rowHeight?: number;
}

/**
 * Pure SVG renderer for a single commit-graph row: pass-through vertical
 * lines, bezier merge/split curves, and the commit-node dot.
 *
 * Shared by GitHistoryPanel and GitTreeTab.
 */
export const CommitGraphRow = memo(function CommitGraphRow({
  info,
  graphWidth,
  activeLanes,
  rowHeight = DEFAULT_ROW_HEIGHT,
}: CommitGraphRowProps) {
  const { lane, colorIndex, linesDown } = info;
  const color = GIT_GRAPH_COLORS[colorIndex % GIT_GRAPH_COLORS.length];
  const cx = lane * LANE_WIDTH + GRAPH_LEFT_PADDING;
  const cy = rowHeight / 2;

  return (
    <svg width={graphWidth} height={rowHeight} style={{ flexShrink: 0 }}>
      {/* Pass-through vertical lines */}
      {activeLanes.map((al) => {
        const x = al.lane * LANE_WIDTH + GRAPH_LEFT_PADDING;
        const c = GIT_GRAPH_COLORS[al.colorIndex % GIT_GRAPH_COLORS.length];
        return (
          <line
            key={`pt-${al.lane}`}
            x1={x}
            y1={0}
            x2={x}
            y2={rowHeight}
            stroke={c}
            strokeWidth={1.5}
          />
        );
      })}

      {/* Lines going down to parents */}
      {linesDown.map((seg, idx) => {
        const fromX = seg.fromLane * LANE_WIDTH + GRAPH_LEFT_PADDING;
        const toX = seg.toLane * LANE_WIDTH + GRAPH_LEFT_PADDING;
        const segColor = GIT_GRAPH_COLORS[seg.colorIndex % GIT_GRAPH_COLORS.length];

        if (seg.fromLane === seg.toLane) {
          // Same lane — vertical line from center to bottom
          return (
            <line
              key={`ld-${idx}`}
              x1={fromX}
              y1={cy}
              x2={toX}
              y2={rowHeight}
              stroke={segColor}
              strokeWidth={1.5}
            />
          );
        }

        // Different lane — cubic bezier curve
        return (
          <path
            key={`ld-${idx}`}
            d={`M ${fromX} ${cy} C ${fromX} ${rowHeight * 0.75} ${toX} ${rowHeight * 0.75} ${toX} ${rowHeight}`}
            stroke={segColor}
            strokeWidth={1.5}
            fill="none"
          />
        );
      })}

      {/* Node dot */}
      <circle cx={cx} cy={cy} r={4} fill={color} />
    </svg>
  );
});
