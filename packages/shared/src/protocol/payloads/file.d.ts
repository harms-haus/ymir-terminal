export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}
export interface FileTreeRequest {
  workspaceId: string;
  path?: string;
  includeHidden?: boolean;
}
export interface FileTreeResponse {
  tree: FileNode[];
}
export interface FileReadRequest {
  workspaceId: string;
  path: string;
}
export interface FileReadResponse {
  content: string;
  language: string;
}
export interface FileWriteRequest {
  workspaceId: string;
  path: string;
  content: string;
}
export interface FileDeleteRequest {
  workspaceId: string;
  path: string;
}
export interface FileRenameRequest {
  workspaceId: string;
  oldPath: string;
  newPath: string;
}
export interface FileCreateRequest {
  workspaceId: string;
  path: string;
  isDirectory: boolean;
}
export interface FileCopyRequest {
  workspaceId: string;
  srcPath: string;
  destDir: string;
}
export interface FileMoveRequest {
  workspaceId: string;
  srcPath: string;
  destDir: string;
}
export interface FileChangeEvent {
  workspaceId: string;
  path: string;
  kind: 'create' | 'modify' | 'delete';
}
