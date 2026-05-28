import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sendRequest } from '../lib/send-request';
import type {
  WorkspaceListResponse,
  WorkspaceCreateRequest,
  WorkspaceCreateResponse,
  WorkspaceUpdateRequest,
  WorkspaceDeleteRequest,
} from '@ymir/shared';

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const response = await sendRequest<WorkspaceListResponse>(
        'workspace.list',
        {},
      );
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
