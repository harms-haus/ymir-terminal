import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Terminal as GhosttyTerminal, FitAddon, init } from 'ghostty-web';
import { useTerminal } from '../hooks/useTerminal';

export interface TerminalProps {
  terminalId: string;
  cols?: number;
  rows?: number;
}

export const Terminal = forwardRef(function Terminal(
  { terminalId, cols = 80, rows = 24 }: TerminalProps,
  ref,
) {
  const { sendData, onOutput, resizeTerminal } = useTerminal(terminalId);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<GhosttyTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const ioCleanupRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    focus() {
      termRef.current?.focus();
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    const setup = async () => {
      await init();
      await document.fonts?.ready;
      if (disposed) return;

      const term = new GhosttyTerminal({
        cols,
        rows,
        fontFamily: "'Cascadia Code Variable', 'JetBrainsMono Nerd Font', monospace",
        fontSize: 11,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current!);
      fit.fit();

      termRef.current = term;
      fitRef.current = fit;

      const dataDisposable = term.onData((data: string) => {
        sendData(data);
      });
      const unregisterOutput = onOutput((data: string) => {
        term.write(data);
      });

      const observer = new ResizeObserver(() => {
        // Don't fit when hidden (display:none → 0×0)
        if (!containerRef.current || containerRef.current.offsetWidth === 0) return;
        fit.fit();
        if (term.cols > 0 && term.rows > 0) {
          resizeTerminal(term.cols, term.rows);
        }
      });
      observer.observe(containerRef.current!);
      observerRef.current = observer;

      ioCleanupRef.current = () => {
        dataDisposable?.dispose?.();
        unregisterOutput();
      };
    };

    setup();

    return () => {
      disposed = true;
      ioCleanupRef.current?.();
      ioCleanupRef.current = null;
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
});
