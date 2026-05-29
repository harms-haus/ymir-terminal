import { useRef, useCallback } from 'react';
import { useTerminal } from './useTerminal';
import type { Tab } from './useTabs';

export function useCreateTerminalTab(
  workspaceId: string | null,
  tabs: Tab[],
  createTab: (opts: { type: 'terminal' | 'editor'; title: string; terminalId?: string }) => string,
) {
  const { createTerminal } = useTerminal(null);
  const creatingRef = useRef(false);

  const createTerminalTab = useCallback(async () => {
    if (!workspaceId || creatingRef.current) return;
    creatingRef.current = true;
    try {
      const terminalId = await createTerminal(workspaceId);
      createTab({ type: 'terminal', title: `Terminal ${tabs.length + 1}`, terminalId });
    } catch (err) {
      console.error('Failed to create terminal:', err);
    } finally {
      creatingRef.current = false;
    }
  }, [workspaceId, tabs.length, createTab, createTerminal]);

  return createTerminalTab;
}
