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

  // ── RAF-coalescing machinery ─────────────────────────────────────────────

  // Accumulates ResizeObserver changes that haven't been flushed to state yet.
  const pendingRef = useRef<Map<string, PaneBounds>>(new Map());
  // The scheduled rAF id (if any).
  const rafIdRef = useRef<number | null>(null);

  const flushPending = useCallback(() => {
    rafIdRef.current = null;
    if (pendingRef.current.size > 0) {
      setAllBounds(new Map(boundsMap.current));
      pendingRef.current.clear();
    }
  }, []);

  // ── ResizeObserver callback (uses pre-computed entry geometry) ──────────

  const handleResize = useCallback(
    (entries: ResizeObserverEntry[]) => {
      const wrapperEl = wrapperRef.current;
      if (!wrapperEl) return;

      // One forced layout reflow for the wrapper per batch (unavoidable for
      // computing wrapper-relative coordinates).
      const wrapperRect = wrapperEl.getBoundingClientRect();

      let hasPaneChanges = false;

      for (const entry of entries) {
        const target = entry.target as HTMLDivElement;

        // ── Bottom panel ──────────────────────────────────────────
        if (target === bottomTerminalRef.current) {
          const cr = entry.contentRect;
          const bbs = entry.borderBoxSize?.[0];
          const newBottom: PaneBounds = {
            top: cr.top - wrapperRect.top,
            left: cr.left - wrapperRect.left,
            width: bbs ? bbs.inlineSize : cr.width,
            height: bbs ? bbs.blockSize : cr.height,
          };
          setBottomBounds((prev) => {
            if (boundsEqual(prev, newBottom)) return prev;
            return newBottom;
          });
          continue;
        }

        // ── Dynamic panes ──────────────────────────────────────────
        // Look up the paneId whose element matches this entry's target.
        let paneId: string | undefined;
        for (const [id, el] of containerRefs.current) {
          if (el === target) {
            paneId = id;
            break;
          }
        }
        if (!paneId) continue;

        const cr = entry.contentRect;
        const bbs = entry.borderBoxSize?.[0];
        const newBounds: PaneBounds = {
          top: cr.top - wrapperRect.top,
          left: cr.left - wrapperRect.left,
          width: bbs ? bbs.inlineSize : cr.width,
          height: bbs ? bbs.blockSize : cr.height,
        };

        const prev = boundsMap.current.get(paneId) ?? null;
        if (!boundsEqual(prev, newBounds)) {
          boundsMap.current.set(paneId, newBounds);
          pendingRef.current.set(paneId, newBounds);
          hasPaneChanges = true;
        }
      }

      // Schedule a single rAF flush if there are pending pane changes.
      if (hasPaneChanges && rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushPending);
      }
    },
    [flushPending],
  );

  // ── Manual full-bounds recomputation ──────────────────────────────────

  // Recompute all bounds from current DOM layout.
  // Uses getBoundingClientRect() because there are no ResizeObserverEntry
  // objects to read pre-computed sizes from.  This is called infrequently
  // (once on mount, and when consumers manually request a refresh), so the
  // forced reflows are acceptable.
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

  // ── Register / unregister a pane container ──────────────────────────

  const registerContainer = useCallback(
    (paneId: string, element: HTMLDivElement | null) => {
      const prev = containerRefs.current.get(paneId);
      if (prev) {
        observerRef.current?.unobserve(prev);
      }

      if (element) {
        containerRefs.current.set(paneId, element);
        observerRef.current?.observe(element);

        // Immediately compute bounds for *this* pane only (no loop over all
        // panes).  Two getBoundingClientRect calls (wrapper + element) is
        // acceptable for a registration path.
        const wrapperEl = wrapperRef.current;
        if (wrapperEl) {
          const wrapperRect = wrapperEl.getBoundingClientRect();
          const rect = element.getBoundingClientRect();
          const newBounds: PaneBounds = {
            top: rect.top - wrapperRect.top,
            left: rect.left - wrapperRect.left,
            width: rect.width,
            height: rect.height,
          };
          const prevBounds = boundsMap.current.get(paneId) ?? null;
          if (!boundsEqual(prevBounds, newBounds)) {
            boundsMap.current.set(paneId, newBounds);
            setAllBounds(new Map(boundsMap.current));
          }
        }
      } else {
        containerRefs.current.delete(paneId);
        if (boundsMap.current.has(paneId)) {
          boundsMap.current.delete(paneId);
          setAllBounds(new Map(boundsMap.current));
        }
      }
    },
    // Only uses refs and state setters; all are stable.
    [],
  );

  // Get bounds for a specific pane (synchronous, reads from ref)
  const getPaneBounds = useCallback((paneId: string): PaneBounds | null => {
    return boundsMap.current.get(paneId) ?? null;
  }, []);

  // ── Set up ResizeObserver when loading completes ────────────────────

  useEffect(() => {
    if (loading) {
      observerRef.current = null;
      return;
    }

    const observer = new ResizeObserver(handleResize);
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
      // Cancel any pending rAF to avoid setState after teardown
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // pendingRef is a data-storage ref (not a DOM ref), so its .current
      // identity is stable across renders.  The eslint rule below is a false
      // positive for non-DOM refs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pendingRef.current.clear();
    };
  }, [loading, handleResize, updateBounds]);

  return {
    wrapperRef,
    registerContainer,
    getPaneBounds,
    allBounds,
    bottomTerminalRef,
    bottomBounds,
    updateBounds,
  };
}
