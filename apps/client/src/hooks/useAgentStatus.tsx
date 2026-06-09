import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { AgentStatus, AgentStatusEvent, MessageEnvelope } from '@ymir/shared';
import { wsClient } from '../lib/ws-client';

interface AgentStatusContextValue {
  getStatus: (terminalId: string | undefined) => AgentStatus | undefined;
  clearStatus: (terminalId: string) => void;
  markFocused: (terminalId: string) => void;
}

const AgentStatusContext = createContext<AgentStatusContextValue | null>(null);

export function AgentStatusProvider({ children }: { children: ReactNode }) {
  const [statusMap, setStatusMap] = useState<Map<string, AgentStatus>>(new Map());

  useEffect(() => {
    const unsub = wsClient.onMessage((envelope: MessageEnvelope) => {
      if (envelope.channel !== 'agent.status') return;
      const payload = envelope.payload as AgentStatusEvent | undefined;
      if (!payload?.terminalId || !payload.status) return;
      setStatusMap((prev) => {
        if (prev.get(payload.terminalId) === payload.status) return prev;
        const next = new Map(prev);
        next.set(payload.terminalId, payload.status);
        return next;
      });
    });
    return unsub;
  }, []);

  const getStatus = useCallback(
    (terminalId: string | undefined) => {
      if (!terminalId) return undefined;
      return statusMap.get(terminalId);
    },
    [statusMap],
  );

  const clearStatus = useCallback((terminalId: string) => {
    setStatusMap((prev) => {
      if (!prev.has(terminalId)) return prev;
      const next = new Map(prev);
      next.delete(terminalId);
      return next;
    });
  }, []);

  // Client-side focus detection: done → idle (cosmetic only)
  const markFocused = useCallback((terminalId: string) => {
    setStatusMap((prev) => {
      if (prev.get(terminalId) !== 'done') return prev;
      const next = new Map(prev);
      next.set(terminalId, 'idle');
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ getStatus, clearStatus, markFocused }),
    [getStatus, clearStatus, markFocused],
  );

  return <AgentStatusContext.Provider value={value}>{children}</AgentStatusContext.Provider>;
}

export function useAgentStatus(): AgentStatusContextValue {
  const ctx = useContext(AgentStatusContext);
  if (!ctx) throw new Error('useAgentStatus must be used within AgentStatusProvider');
  return ctx;
}
