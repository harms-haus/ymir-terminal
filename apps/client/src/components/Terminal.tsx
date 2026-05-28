import { useRef, useEffect } from 'react';
import { Terminal as GhosttyTerminal, FitAddon, init } from 'ghostty-web';

export interface TerminalProps {
  terminalId: string;
  cols?: number;
  rows?: number;
  onReady?: (terminal: GhosttyTerminal) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function Terminal({ terminalId, cols = 80, rows = 24, onReady, onResize }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<GhosttyTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Use refs for callbacks so the effect doesn't re-run on callback identity changes
  const onReadyRef = useRef(onReady);
  const onResizeRef = useRef(onResize);

  // Sync callback refs inside an effect (not during render)
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    const setup = async () => {
      await init();
      if (disposed) return;

      const term = new GhosttyTerminal({ cols, rows });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current!);
      fit.fit();

      termRef.current = term;
      fitRef.current = fit;

      onReadyRef.current?.(term);

      const observer = new ResizeObserver(() => {
        fit.fit();
        if (term.cols > 0 && term.rows > 0) {
          onResizeRef.current?.(term.cols, term.rows);
        }
      });
      observer.observe(containerRef.current!);
      observerRef.current = observer;
    };

    setup();

    return () => {
      disposed = true;
      observerRef.current?.disconnect();
      observerRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid={`terminal-${terminalId}`}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
