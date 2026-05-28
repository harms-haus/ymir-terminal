import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sendRequest } from '../lib/send-request';
import { useAuth } from './useAuth';
import type {
  WorkspaceListResponse,
  WorkspaceCreateRequest,
  WorkspaceCreateResponse,
  WorkspaceUpdateRequest,
  WorkspaceDeleteRequest,
} from '@ymir/shared';

export function useWorkspaces() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['workspaces'],
    enabled: !!token,
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
