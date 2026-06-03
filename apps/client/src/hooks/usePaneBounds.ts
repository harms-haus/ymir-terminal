import { useRef, useState, useEffect, useCallback } from 'react';
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

  // Dynamic pane container refs: paneId → element
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Synchronous bounds map: paneId → PaneBounds (ref, not state)
  const boundsMap = useRef<Map<string, PaneBounds>>(new Map());

  // ResizeObserver instance (stored in ref so registerContainer can add/remove targets)
  const observerRef = useRef<ResizeObserver | null>(null);

  // React state mirrors of bounds (trigger re-renders for consumers)
  const [allBounds, setAllBounds] = useState<Map<string, PaneBounds>>(new Map());

  // Bottom panel (separate from split pane system)
  const bottomTerminalRef = useRef<HTMLDivElement>(null);
  const [bottomBounds, setBottomBounds] = useState<PaneBounds | null>(null);

  // Recompute all bounds from current DOM layout
  const updateBounds = useCallback(() => {
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) return;

    let paneChanged = false;

    // Update dynamic pane bounds
    for (const [paneId, el] of containerRefs.current) {
      const rect = el.getBoundingClientRect();
      const newBounds: PaneBounds = {
        top: rect.top - wrapperRect.top,
        left: rect.left - wrapperRect.left,
        width: rect.width,
        height: rect.height,
      };
      const prev = boundsMap.current.get(paneId) ?? null;
      if (!boundsEqual(prev, newBounds)) {
        boundsMap.current.set(paneId, newBounds);
        paneChanged = true;
      }
    }

    // Clean up bounds for removed containers
    for (const paneId of [...boundsMap.current.keys()]) {
      if (!containerRefs.current.has(paneId)) {
        boundsMap.current.delete(paneId);
        paneChanged = true;
      }
    }

    if (paneChanged) {
      setAllBounds(new Map(boundsMap.current));
    }

    // Update bottom panel bounds
    const bottomRect = bottomTerminalRef.current?.getBoundingClientRect();
    const newBottom = bottomRect
      ? {
          top: bottomRect.top - wrapperRect.top,
          left: bottomRect.left - wrapperRect.left,
          width: bottomRect.width,
          height: bottomRect.height,
        }
      : null;

    setBottomBounds((prev) => {
      if (boundsEqual(prev, newBottom)) return prev;
      return newBottom;
    });
  }, []);

  // Register (or unregister) a pane container element by paneId.
  // Safe to use as a React ref callback.
  const registerContainer = useCallback(
    (paneId: string, element: HTMLDivElement | null) => {
      const prev = containerRefs.current.get(paneId);
      if (prev) {
        observerRef.current?.unobserve(prev);
      }

      if (element) {
        containerRefs.current.set(paneId, element);
        observerRef.current?.observe(element);
      } else {
        containerRefs.current.delete(paneId);
        if (boundsMap.current.has(paneId)) {
          boundsMap.current.delete(paneId);
          setAllBounds(new Map(boundsMap.current));
        }
      }
    },
    [],
  );

  // Get bounds for a specific pane (synchronous, reads from ref)
  const getPaneBounds = useCallback((paneId: string): PaneBounds | null => {
    return boundsMap.current.get(paneId) ?? null;
  }, []);

  // Set up ResizeObserver when loading completes
  useEffect(() => {
    if (loading) {
      observerRef.current = null;
      return;
    }

    const observer = new ResizeObserver(updateBounds);
    observerRef.current = observer;

    // Observe all currently registered pane containers
    for (const [, el] of containerRefs.current) {
      observer.observe(el);
    }

    // Observe bottom panel
    if (bottomTerminalRef.current) {
      observer.observe(bottomTerminalRef.current);
    }

    updateBounds();

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [loading, updateBounds]);

  return {
    wrapperRef,
    registerContainer,
    getPaneBounds,
    allBounds,
    bottomTerminalRef,
    bottomBounds,
  };
}
