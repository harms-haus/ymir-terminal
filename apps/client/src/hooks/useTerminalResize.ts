import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_COLS, DEFAULT_ROWS } from '@ymir/shared';

const CHAR_WIDTH = 8;
const CHAR_HEIGHT = 16;

export function useTerminalResize() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [rows, setRows] = useState(DEFAULT_ROWS);

  const updateSize = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    setCols(Math.max(1, Math.floor(width / CHAR_WIDTH)));
    setRows(Math.max(1, Math.floor(height / CHAR_HEIGHT)));
  }, []);

  // Callback ref: triggers re-render when element attaches, enabling the effect below
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      setElement(node);
    },
    [],
  );

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, updateSize]);

  return { containerRef: ref, cols, rows, updateSize };
}
