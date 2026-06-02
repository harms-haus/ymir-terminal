import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sendRequest } from '../lib/send-request';
import { useAuth } from './useAuth';
import { useConnectionStatus } from './useConnectionStatus';
import type {
  WorkspaceSummary,
  WorkspaceListResponse,
  WorkspaceCreateRequest,
  WorkspaceCreateResponse,
  WorkspaceUpdateRequest,
  WorkspaceDeleteRequest,
  WorkspaceReorderRequest,
  GitWorktreeListResponse,
  GitWorktreeCreateResponse,
  GitWorktreeRemoveRequest,
  GitWorktreeMergeResponse,
  GitWorktreeCopyFilesResponse,
} from '@ymir/shared';

export function useWorkspaces() {
  const { token } = useAuth();
  const { isConnected } = useConnectionStatus();
  return useQuery({
    queryKey: ['workspaces'],
    enabled: !!token && isConnected,
    queryFn: async () => {
      const response = await sendRequest<WorkspaceListResponse>('workspace.list', {});
      return response.workspaces;
    },
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: WorkspaceCreateRequest) => {
      return sendRequest<WorkspaceCreateResponse>('workspace.create', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: WorkspaceUpdateRequest) => {
      return sendRequest<void>('workspace.update', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: WorkspaceDeleteRequest) => {
      return sendRequest<void>('workspace.delete', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useReorderWorkspaces() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: WorkspaceReorderRequest) => {
      return sendRequest<void>('workspace.reorder', payload);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['workspaces'] });
      const snapshot = queryClient.getQueryData(['workspaces']);
      queryClient.setQueryData<WorkspaceSummary[]>(['workspaces'], (old) => {
        if (!old) return old;
        const map = new Map(old.map((w) => [w.id, w]));
        return variables.workspaceIds
          .map((id) => map.get(id))
          .filter((w): w is WorkspaceSummary => w !== undefined);
      });
      return { snapshot };
    },
    onError: (_err, _variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['workspaces'], context.snapshot);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useWorktreeList(workspaceId: string | null, options?: { enabled?: boolean }) {
  const { isConnected } = useConnectionStatus();
  return useQuery({
    queryKey: ['worktrees', workspaceId],
    enabled: !!workspaceId && options?.enabled !== false && isConnected,
    queryFn: async () => {
      const response = await sendRequest<GitWorktreeListResponse>('git.worktreeList', {
        workspaceId,
      });
      return response.worktrees;
    },
  });
}

export function useCreateWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      workspaceId: string;
      branchName: string;
      startRef?: string;
      filesToCopy?: string[];
    }) => {
      return sendRequest<GitWorktreeCreateResponse>('git.worktreeCreate', payload);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({
        queryKey: ['worktrees', variables.workspaceId],
      });
    },
  });
}

export function useRemoveWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId, worktreePath, force }: GitWorktreeRemoveRequest) => {
      return sendRequest<void>('git.worktreeRemove', {
        workspaceId,
        worktreePath,
        force,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({
        queryKey: ['worktrees', variables.workspaceId],
      });
    },
  });
}

export function useMergeWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      workspaceId: string;
      worktreePath: string;
      targetBranch?: string;
      deleteAfterMerge?: boolean;
      filesToCopy?: string[];
    }) => {
      return sendRequest<GitWorktreeMergeResponse>('git.worktreeMerge', params);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({
        queryKey: ['worktrees', variables.workspaceId],
      });
    },
  });
}

export function useWorktreeCopyFiles(
  workspaceId: string | null,
  dirPath?: string,
) {
  const { isConnected } = useConnectionStatus();
  return useQuery({
    queryKey: ['worktreeCopyFiles', workspaceId, dirPath],
    enabled: !!workspaceId && isConnected,
    queryFn: async () => {
      const response = await sendRequest<GitWorktreeCopyFilesResponse>('git.worktreeCopyFiles', {
        workspaceId: workspaceId!,
        dirPath,
      });
      return response;
    },
  });
}
