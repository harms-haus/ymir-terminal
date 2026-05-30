import { useState, useMemo, useEffect } from 'react';
import fuzzysort from 'fuzzysort';
import { sendRequest } from '../lib/send-request';
import type { FileNode } from '@ymir/shared';

export interface FileSearchResult {
  path: string;
  filename: string;
  directory: string;
  score: number;
}

interface FlattenedFile {
  path: string;
  filename: string;
  directory: string;
}

/** Recursively flatten a FileNode tree into a flat array of files */
function flattenTree(nodes: FileNode[]): FlattenedFile[] {
  const result: FlattenedFile[] = [];
  function walk(node: FileNode) {
    if (!node.isDirectory) {
      const lastSlash = node.path.lastIndexOf('/');
      const directory = lastSlash >= 0 ? node.path.substring(0, lastSlash) : '';
      result.push({ path: node.path, filename: node.name, directory });
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }
  for (const node of nodes) walk(node);
  return result;
}

export function useFileSearch(workspaceId: string | null) {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<FlattenedFile[]>([]);

  // Effective files: clear when workspace is deselected
  const effectiveFiles = workspaceId ? files : [];

  // Fetch file tree when workspaceId changes
  useEffect(() => {
    if (!workspaceId) return;
    sendRequest<{ tree: FileNode[] }>('file.tree', { workspaceId })
      .then((res) => {
        setFiles(flattenTree(res.tree));
      })
      .catch(() => {
        setFiles([]);
      });
  }, [workspaceId]);

  // Memoized search results
  const results = useMemo<FileSearchResult[]>(() => {
    if (!query || query.startsWith('/')) return []; // empty or command mode
    if (effectiveFiles.length === 0) return [];

    const fuzzResults = fuzzysort.go(query, effectiveFiles, { key: 'filename' });
    return fuzzResults.slice(0, 50).map((r) => ({
      path: r.obj.path,
      filename: r.obj.filename,
      directory: r.obj.directory,
      score: r.score,
    }));
  }, [query, effectiveFiles]);

  return { query, setQuery, results };
}
