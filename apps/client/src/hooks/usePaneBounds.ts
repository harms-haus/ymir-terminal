import { useRef, useState, useEffect } from 'react';
import type { PaneBounds } from '../components/TerminalManager';

function boundsEqual(
  a: { top: number; left: number; width: number; height: number } | null,
  b: { top: number; left: number; width: number; height: number } | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

interface UsePaneBoundsParams {
  /** When pane visibility is loading, skip observing (avoids stale refs). */
  loading: boolean;
}

export function usePaneBounds({ loading }: UsePaneBoundsParams) {
  // Wrapper div for overlay positioning context
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Refs for terminal container divs (used by ResizeObserver for bounds tracking)
  const contentTerminalRef = useRef<HTMLDivElement>(null);
  const bottomTerminalRef = useRef<HTMLDivElement>(null);

  // Bounds state for overlay positioning
  const [containerBounds, setContainerBounds] = useState<{
    content: PaneBounds | null;
    bottom: PaneBounds | null;
  }>({ content: null, bottom: null });

  // Track bounds via ResizeObserver
  useEffect(() => {
    const updateBounds = () => {
      const wrapperRect = wrapperRef.current?.getBoundingClientRect();
      const contentRect = contentTerminalRef.current?.getBoundingClientRect();
      const bottomRect = bottomTerminalRef.current?.getBoundingClientRect();

      const newContent =
        wrapperRect && contentRect
          ? {
              top: contentRect.top - wrapperRect.top,
              left: contentRect.left - wrapperRect.left,
              width: contentRect.width,
              height: contentRect.height,
            }
          : null;
      const newBottom =
        wrapperRect && bottomRect
          ? {
              top: bottomRect.top - wrapperRect.top,
              left: bottomRect.left - wrapperRect.left,
              width: bottomRect.width,
              height: bottomRect.height,
            }
          : null;

      setContainerBounds((prev) => {
        if (boundsEqual(prev.content, newContent) && boundsEqual(prev.bottom, newBottom)) {
          return prev;
        }
        return { content: newContent, bottom: newBottom };
      });
    };

    const observer = new ResizeObserver(updateBounds);
    if (contentTerminalRef.current) observer.observe(contentTerminalRef.current);
    if (bottomTerminalRef.current) observer.observe(bottomTerminalRef.current);
    updateBounds();

    return () => observer.disconnect();
  }, [loading]);

  return {
    wrapperRef,
    contentTerminalRef,
    bottomTerminalRef,
    containerBounds,
  };
}
