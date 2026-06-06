import { useCallback, useEffect, useRef } from 'react';
import { wsClient } from '../lib/ws-client';
import { toBase64, fromBase64, PROTOCOL_VERSION, generateId } from '@ymir/shared';
import type { MessageEnvelope, TerminalStateResponse } from '@ymir/shared';
import { sendRequest } from '../lib/send-request';

const decoder = new TextDecoder();

export function useTerminal(terminalId: string | null) {
  const outputHandlers = useRef<((data: string) => void)[]>([]);
  const isRestoringRef = useRef(false);
  const pendingEventsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!terminalId) return;
    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      const payload = envelope.payload as { terminalId: string; data: string } | undefined;
      if (envelope.channel === 'terminal.output' && payload?.terminalId === terminalId) {
        const decoded = fromBase64(payload.data);
        const text = decoder.decode(decoded);
        if (isRestoringRef.current) {
          pendingEventsRef.current.push(text);
          return;
        }
        outputHandlers.current.forEach((h) => h(text));
      }
    });
    return unsub;
  }, [terminalId]);

  const sendData = useCallback(
    (data: string) => {
      if (!terminalId) return;
      const encoded = toBase64(new TextEncoder().encode(data));
      wsClient.send({
        v: PROTOCOL_VERSION,
        type: 'request',
        id: generateId(),
        channel: 'terminal.input',
        payload: { terminalId, data: encoded },
      });
    },
    [terminalId],
  );

  const createTerminal = useCallback(async (workspaceId: string, cwd?: string) => {
    const result = await sendRequest<{ terminalId: string }>('terminal.create', {
      workspaceId,
      cols: 80,
      rows: 24,
      ...(cwd ? { cwd } : {}),
    });
    return result.terminalId;
  }, []);

  const closeTerminal = useCallback(async () => {
    if (!terminalId) return;
    await sendRequest('terminal.close', { terminalId });
  }, [terminalId]);

  const resizeTerminal = useCallback(
    (cols: number, rows: number) => {
      if (!terminalId) return;
      wsClient.send({
        v: PROTOCOL_VERSION,
        type: 'request',
        id: generateId(),
        channel: 'terminal.resize',
        payload: { terminalId, cols, rows },
      });
    },
    [terminalId],
  );

  const onOutput = useCallback((handler: (data: string) => void) => {
    outputHandlers.current.push(handler);
    return () => {
      outputHandlers.current = outputHandlers.current.filter((h) => h !== handler);
    };
  }, []);

  const requestState = useCallback(async (): Promise<{
    data: string;
    cols: number;
    rows: number;
  } | null> => {
    if (!terminalId) return null;
    try {
      const result = await sendRequest<TerminalStateResponse>('terminal.state', { terminalId });
      return result;
    } catch {
      return null;
    }
  }, [terminalId]);

  const restoreState = useCallback(async () => {
    if (!terminalId) return;
    isRestoringRef.current = true;
    pendingEventsRef.current = [];

    try {
      const result = await requestState();
      if (result && result.data) {
        const bytes = fromBase64(result.data);
        const text = decoder.decode(bytes);
        for (const handler of outputHandlers.current) {
          handler(text);
        }
      }

      // Replay any events that arrived during restoration
      for (const event of pendingEventsRef.current) {
        for (const handler of outputHandlers.current) {
          handler(event);
        }
      }
    } finally {
      isRestoringRef.current = false;
      pendingEventsRef.current = [];
    }
  }, [terminalId, requestState]);

  return {
    sendData,
    onOutput,
    createTerminal,
    closeTerminal,
    resizeTerminal,
    requestState,
    restoreState,
  };
}
