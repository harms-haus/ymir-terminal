import { useState, useEffect, useRef } from 'react';
import { useStableCallback } from './useStableCallback';
import { toast } from 'sonner';
import type { AgentStatus, AgentStatusEvent } from '@ymir/shared';
import { wsClient } from '../lib/ws-client';
import type { TerminalRegistryEntry } from './useTerminalRegistry';

const STATUS_PRIORITY: Record<AgentStatus, number> = {
  working: 0,
  halted: 1,
  done: 2,
};

interface UseAgentStatusOptions {
  terminalRegistry: TerminalRegistryEntry[];
}

export function useAgentStatus(options: UseAgentStatusOptions) {
  const { terminalRegistry } = options;

  // Current status for each terminal
  const statusMapRef = useRef<Map<string, AgentStatus>>(new Map());
  // Previous status for each terminal — used to detect transitions
  const prevStatusRef = useRef<Map<string, AgentStatus>>(new Map());
  // Version counter to trigger re-renders when status changes
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const unsub = wsClient.onMessage((envelope) => {
      if (envelope.channel !== 'agent.status') return;

      const payload = envelope.payload as AgentStatusEvent;
      const { terminalId, status: newStatus } = payload;

      // Look up the current status for this terminal to detect transitions
      const currentStatus = statusMapRef.current.get(terminalId);

      if (currentStatus !== newStatus) {
        // Save the previous status before updating
        if (currentStatus !== undefined) {
          prevStatusRef.current.set(terminalId, currentStatus);
        }
        statusMapRef.current.set(terminalId, newStatus);
        setVersion((v) => v + 1);

        // Toast on real transitions (skip first-time status)
        if (currentStatus !== undefined) {
          const label = payload.agent
            ? payload.agent.charAt(0).toUpperCase() + payload.agent.slice(1)
            : 'Agent';

          if (newStatus === 'halted') {
            toast.info(`${label} needs your input`, {
              id: `agent-halted-${terminalId}`,
              description: `${label} is waiting for your response`,
              duration: 0,
            });
          } else if (newStatus === 'done') {
            toast.success(`${label} finished`, {
              id: `agent-done-${terminalId}`,
              description: `${label} has completed its task`,
              duration: 5000,
            });
          }
        }
      }
    });

    return unsub;
  }, []);

  const getStatusForTerminal = useStableCallback((terminalId: string): AgentStatus | null => {
    return statusMapRef.current.get(terminalId) ?? null;
  });

  const getStatusForTab = useStableCallback((tabId: string): AgentStatus | null => {
    const entry = terminalRegistry.find((e) => e.tabId === tabId);
    if (!entry) return null;
    return statusMapRef.current.get(entry.terminalId) ?? null;
  });

  const getStatusesForPath = useStableCallback((absolutePath: string): AgentStatus | null => {
    const matching = terminalRegistry.filter((e) => e.cwd && absolutePath.startsWith(e.cwd));
    if (matching.length === 0) return null;

    let worst: AgentStatus | null = null;
    let worstPriority = Infinity;

    for (const entry of matching) {
      const status = statusMapRef.current.get(entry.terminalId) ?? null;
      if (status !== null) {
        const priority = STATUS_PRIORITY[status];
        if (priority < worstPriority) {
          worstPriority = priority;
          worst = status;
        }
      }
    }

    return worst;
  });

  return {
    getStatusForTerminal,
    getStatusForTab,
    getStatusesForPath,
  };
}
