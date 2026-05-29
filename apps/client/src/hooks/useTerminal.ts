import { useCallback, useEffect, useRef } from 'react';
import { wsClient } from '../lib/ws-client';
import { toBase64, fromBase64, PROTOCOL_VERSION } from '@ymir/shared';
import type { MessageEnvelope } from '@ymir/shared';
import { sendRequest } from '../lib/send-request';

export function useTerminal(terminalId: string | null) {
  const outputHandlers = useRef<((data: string) => void)[]>([]);

  useEffect(() => {
    if (!terminalId) return;
    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      const payload = envelope.payload as { terminalId: string; data: string } | undefined;
      if (envelope.channel === 'terminal.output' && payload?.terminalId === terminalId) {
        const decoded = fromBase64(payload.data);
        const text = new TextDecoder().decode(decoded);
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
        id: crypto.randomUUID(),
        channel: 'terminal.input',
        payload: { terminalId, data: encoded },
      });
    },
    [terminalId],
  );

  const createTerminal = useCallback(async (workspaceId: string) => {
    const result = await sendRequest<{ terminalId: string }>('terminal.create', {
      workspaceId,
      cols: 80,
      rows: 24,
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
        id: crypto.randomUUID(),
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

  return { sendData, onOutput, createTerminal, closeTerminal, resizeTerminal };
}
