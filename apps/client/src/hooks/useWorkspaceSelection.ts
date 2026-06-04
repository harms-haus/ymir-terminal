import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { WorkspaceSummary, GitWorktreeInfo, GitWorktreeListResponse } from '@ymir/shared';
import {
  useWorkspaces,
  useUpdateWorkspace,
  useDeleteWorkspace,
  useReorderWorkspaces,
  useRemoveWorktree,
  useMergeWorktree,
} from './useWorkspaces';
import { sendRequest } from '../lib/send-request';

interface UseWorkspaceSelectionParams {
  setAccentColor: (color: string) => void;
}

export function useWorkspaceSelection({ setAccentColor }: UseWorkspaceSelectionParams) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  // Worktree state
  const [activeWorktreePath, setActiveWorktreePath] = useState<string | null>(null);
  const [isCreateWorktreeDialogOpen, setIsCreateWorktreeDialogOpen] = useState(false);
  const [createWorktreeForWsId, setCreateWorktreeForWsId] = useState<string | null>(null);

  const { data: workspaces } = useWorkspaces();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const reorderWorkspacesMutation = useReorderWorkspaces();
  const removeWorktreeMutation = useRemoveWorktree();
  const mergeWorktreeMutation = useMergeWorktree();

  // Ref for workspaces to avoid stale closures in drag handlers
  const workspacesRef = useRef(workspaces);
  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  const activeWorkspaceId = useMemo(() => {
    if (selectedWorkspaceId) return selectedWorkspaceId;
    if (workspaces && workspaces.length > 0) return workspaces[0].id;
    return null;
  }, [selectedWorkspaceId, workspaces]);

  const activeWorkspace = useMemo(
    () => workspaces?.find((ws: WorkspaceSummary) => ws.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  // Derive the effective cwd for terminal creation: use active worktree path if set,
  // otherwise fall back to the workspace's default cwd (or undefined for server default)
  const effectiveCwd = activeWorktreePath ?? undefined;

  // Fetch worktrees for ALL workspaces eagerly (avoids chicken-and-egg deadlock
  // where expandedWorkspaces starts empty so data never loads)
  const allWorkspaceIds = useMemo(
    () => workspaces?.map((ws: WorkspaceSummary) => ws.id) ?? [],
    [workspaces],
  );

  const worktreeResults = useQueries({
    queries: allWorkspaceIds.map((id) => ({
      queryKey: ['worktrees', id],
      queryFn: async () => {
        const response = await sendRequest<GitWorktreeListResponse>('git.worktreeList', {
          workspaceId: id,
        });
        return response.worktrees;
      },
    })),
  });

  // worktreeResults from useQueries uses react-query's structural sharing, so
  // worktreeResults[i].data is referentially stable when data hasn't changed.
  const worktreesByWorkspace = useMemo<Record<string, GitWorktreeInfo[]>>(() => {
    const result: Record<string, GitWorktreeInfo[]> = {};
    for (let i = 0; i < allWorkspaceIds.length; i++) {
      const data = worktreeResults[i]?.data;
      if (data) result[allWorkspaceIds[i]] = data;
    }
    return result;
  }, [allWorkspaceIds, worktreeResults]);

  // --- Handlers ---

  const handleWorkspaceSelect = useCallback(
    (id: string) => {
      setSelectedWorkspaceId(id);
      setActiveWorktreePath(null);
      const ws = workspaces?.find((w: WorkspaceSummary) => w.id === id);
      if (ws?.color) setAccentColor(ws.color);
    },
    [workspaces, setAccentColor],
  );

  const handleRenameWorkspace = useCallback(
    (id: string, name: string) => {
      updateWorkspace.mutate({ id, name });
    },
    [updateWorkspace],
  );

  const handleSetCwdWorkspace = useCallback(
    (id: string, cwd: string) => {
      updateWorkspace.mutate({ id, cwd });
    },
    [updateWorkspace],
  );

  const handleChangeColorWorkspace = useCallback(
    (id: string, color: string) => {
      updateWorkspace.mutate({ id, color });
      if (id === activeWorkspaceId) setAccentColor(color);
    },
    [updateWorkspace, activeWorkspaceId, setAccentColor],
  );

  const handleRemoveWorkspace = useCallback(
    (id: string) => {
      deleteWorkspace.mutate({ id });
      if (id === selectedWorkspaceId) setSelectedWorkspaceId(null);
    },
    [deleteWorkspace, selectedWorkspaceId],
  );

  // Worktree handlers
  const handleWorktreeSelect = useCallback((path: string) => {
    setActiveWorktreePath(path);
  }, []);

  const handleCreateWorktree = useCallback((workspaceId: string) => {
    setCreateWorktreeForWsId(workspaceId);
    setIsCreateWorktreeDialogOpen(true);
  }, []);

  const handleWorktreeCreated = useCallback(() => {
    setIsCreateWorktreeDialogOpen(false);
    setCreateWorktreeForWsId(null);
  }, []);

  const handleCopyWorktreePath = useCallback((path: string) => {
    try {
      navigator.clipboard.writeText(path);
    } catch {
      console.warn('Failed to copy to clipboard');
    }
  }, []);

  const handleRemoveWorktree = useCallback(
    (workspaceId: string, worktreePath: string, force: boolean) => {
      removeWorktreeMutation.mutate({ workspaceId, worktreePath, force });
    },
    [removeWorktreeMutation],
  );

  const handleMergeWorktree = useCallback(
    (
      workspaceId: string,
      worktreePath: string,
      _branch: string,
      deleteAfterMerge?: boolean,
      filesToCopy?: string[],
    ) => {
      mergeWorktreeMutation.mutate({
        workspaceId,
        worktreePath,
        targetBranch: 'main',
        deleteAfterMerge,
        filesToCopy,
      });
    },
    [mergeWorktreeMutation],
  );

  return {
    // State
    selectedWorkspaceId,
    activeWorkspaceId,
    activeWorkspace,
    effectiveCwd,
    activeWorktreePath,
    workspaces,
    workspacesRef,
    worktreesByWorkspace,
    isCreateWorktreeDialogOpen,
    createWorktreeForWsId,

    // Mutations
    reorderWorkspacesMutation,
    updateWorkspace,

    // Workspace handlers
    handleWorkspaceSelect,
    handleRenameWorkspace,
    handleSetCwdWorkspace,
    handleChangeColorWorkspace,
    handleRemoveWorkspace,

    // Worktree handlers
    handleWorktreeSelect,
    handleCreateWorktree,
    handleWorktreeCreated,
    handleCopyWorktreePath,
    handleRemoveWorktree,
    handleMergeWorktree,

    // Dialog helpers
    setIsCreateWorktreeDialogOpen,
    setCreateWorktreeForWsId,
    setSelectedWorkspaceId,
  };
}
