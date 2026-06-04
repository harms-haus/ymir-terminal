import { useCallback, useRef, useEffect, type MutableRefObject } from 'react';
import type { TerminalPanelHandle } from './useTerminalPanel';
import { parseScopeKey } from './useWorkspaceSelection';
import { sendRequest } from '../lib/send-request';
import type { PersistedTabInfo, TabRestoreResponse } from '@ymir/shared';

interface UseTabRestoreParams {
  activeScopeKey: string | null;
  paneHandleRefs: MutableRefObject<Map<string, TerminalPanelHandle>>;
}

/**
 * Restores tabs from the persisted session when the active scope (workspace/worktree)
 * changes. Each scope is restored at most once.
 */
export function useTabRestore({ activeScopeKey, paneHandleRefs }: UseTabRestoreParams): void {
  const restoredWorkspacesRef = useRef(new Set<string>());

  /* eslint-disable react-hooks/exhaustive-deps -- paneHandleRefs is a stable ref */
  const handleRestoreTabs = useCallback(async (scopeKey: string) => {
    if (restoredWorkspacesRef.current.has(scopeKey)) return;
    restoredWorkspacesRef.current.add(scopeKey);

    const { workspaceId: realWsId, worktreePath } = parseScopeKey(scopeKey);

    try {
      const res = await sendRequest<TabRestoreResponse>('tab.restore', {
        workspaceId: realWsId,
        worktreePath,
      });
      if (!res.tabs || res.tabs.length === 0) return;

      // Group tabs by pane
      const tabsByPane = new Map<string, PersistedTabInfo[]>();
      for (const tab of res.tabs) {
        const pane = tab.pane || 'content';
        if (!tabsByPane.has(pane)) tabsByPane.set(pane, []);
        tabsByPane.get(pane)!.push(tab);
      }

      // Wait a frame for pane handles to register after layout load
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      for (const [paneId, tabs] of tabsByPane) {
        const handle = paneHandleRefs.current.get(paneId);
        if (!handle) continue;

        handle.loadRestoredTabs(scopeKey, tabs);
      }
    } catch {
      // Silent fail – restoration is best-effort
    }
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (activeScopeKey) {
      handleRestoreTabs(activeScopeKey);
    }
  }, [activeScopeKey, handleRestoreTabs]);
}
